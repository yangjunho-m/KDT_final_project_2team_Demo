export type ApiClientConfig = {
  baseUrl: string;
  wsUrl: string;
};

export type ApiSuccessResponse<TData> = {
  success: true;
  data: TData;
  message?: string | null;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp?: string;
  };
};

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

export type ApiRequestOptions = Omit<RequestInit, "body" | "method"> & {
  skipAuth?: boolean;
  skipUnauthorizedHandler?: boolean;
};

const AUTH_TOKEN_STORAGE_KEY = "drone-platform.accessToken";

export const apiClientConfig: ApiClientConfig = {
  baseUrl: (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, ""),
  wsUrl: import.meta.env.VITE_WS_BASE_URL ?? "",
};

// 서버 무응답 시 무한 대기를 막는 기본 타임아웃.
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function withDefaultTimeout(signal: AbortSignal | null | undefined): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);
  if (!signal) {
    return timeoutSignal;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  // AbortSignal.any 미지원 환경에서는 호출자 signal을 우선한다.
  return signal;
}

let accessTokenGetter: () => string | null = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
};

let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly timestamp?: string;
  readonly isNetworkError: boolean;

  constructor({
    code,
    message,
    status,
    details,
    timestamp,
    isNetworkError = false,
  }: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    timestamp?: string;
    isNetworkError?: boolean;
  }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.timestamp = timestamp;
    this.isNetworkError = isNetworkError;
  }
}

export function setApiAccessTokenGetter(getter: () => string | null) {
  accessTokenGetter = getter;
}

export function setApiUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function getAuthTokenStorageKey() {
  return AUTH_TOKEN_STORAGE_KEY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value) || value.success !== false || !isRecord(value.error)) {
    return false;
  }
  return (
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}

function isApiSuccessResponse<TData>(
  value: unknown,
): value is ApiSuccessResponse<TData> {
  return isRecord(value) && value.success === true && "data" in value;
}

function buildUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiClientConfig.baseUrl}${normalizedPath}`;
}

function buildHeaders(body: unknown, options?: ApiRequestOptions): Headers {
  const headers = new Headers(options?.headers);
  const token = options?.skipAuth ? null : accessTokenGetter();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    !(body instanceof FormData) &&
    body !== undefined &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      throw new ApiError({
        code: "INVALID_RESPONSE",
        message: "API response is not valid JSON.",
        status: response.status,
      });
    }
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

function unwrapApiResponse<TData>(
  body: unknown,
  response: Response,
  options?: ApiRequestOptions,
): TData {
  if (isApiErrorResponse(body)) {
    if (response.status === 401 && !options?.skipUnauthorizedHandler) {
      unauthorizedHandler?.();
    }
    throw new ApiError({
      code: body.error.code,
      message: body.error.message,
      status: response.status,
      details: body.error.details,
      timestamp: body.error.timestamp,
    });
  }

  if (!response.ok) {
    if (response.status === 401 && !options?.skipUnauthorizedHandler) {
      unauthorizedHandler?.();
    }
    throw new ApiError({
      code: `HTTP_${response.status}`,
      message: response.statusText || "API request failed.",
      status: response.status,
    });
  }

  if (response.status === 204) {
    return undefined as TData;
  }

  if (isApiSuccessResponse<TData>(body)) {
    return body.data;
  }

  return body as TData;
}

async function request<TData>(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<TData> {
  const headers = buildHeaders(body, options);
  const requestBody =
    body === undefined
      ? undefined
      : body instanceof FormData
        ? body
        : JSON.stringify(body);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      method,
      headers,
      body: requestBody,
      signal: withDefaultTimeout(options?.signal),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    throw new ApiError({
      code: isTimeout ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
      message: isTimeout
        ? "요청이 시간 내에 완료되지 않았습니다."
        : error instanceof Error
          ? error.message
          : "Network request failed.",
      status: 0,
      isNetworkError: true,
    });
  }

  const responseBody = await readResponseBody(response);
  return unwrapApiResponse<TData>(responseBody, response, options);
}

export const apiClient = {
  get<TData>(path: string, options?: ApiRequestOptions) {
    return request<TData>("GET", path, undefined, options);
  },
  post<TData, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions,
  ) {
    return request<TData>("POST", path, body, options);
  },
  patch<TData, TBody = unknown>(
    path: string,
    body: TBody,
    options?: ApiRequestOptions,
  ) {
    return request<TData>("PATCH", path, body, options);
  },
  put<TData, TBody = unknown>(
    path: string,
    body: TBody,
    options?: ApiRequestOptions,
  ) {
    return request<TData>("PUT", path, body, options);
  },
  delete<TData>(path: string, options?: ApiRequestOptions) {
    return request<TData>("DELETE", path, undefined, options);
  },
};
