import {
  defaultReconnectPolicy,
  getReconnectDelayMs,
  type ReconnectPolicy,
} from "./reconnectPolicy";
import {
  parseRealtimeEventMessage,
  type RealtimeEvent,
} from "./websocketEvents";

export type WebSocketConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export type RealtimeConnectionState = {
  status: WebSocketConnectionStatus;
  operationAreaId: string | null;
  reconnectAttempt: number;
  lastMessageAt: number | null;
  lastOpenedAt: number | null;
  errorMessage: string | null;
};

export type RealtimeEventListener = (event: RealtimeEvent) => void;
export type RealtimeStateListener = (state: RealtimeConnectionState) => void;
export type RealtimeReconnectListener = (
  state: RealtimeConnectionState,
) => void;
export type RealtimeDiagnosticEvent = {
  kind: "malformed-message";
  reason: string;
};
export type RealtimeDiagnosticListener = (
  diagnostic: RealtimeDiagnosticEvent,
) => void;

export type WebSocketClientOptions = {
  url: string;
  reconnectPolicy?: ReconnectPolicy;
  heartbeatIntervalMs?: number;
};

export type OperationWebSocketClient = {
  readonly status: WebSocketConnectionStatus;
  getState: () => RealtimeConnectionState;
  connect: (operationAreaId?: string | null) => void;
  disconnect: () => void;
  dispose: () => void;
  subscribe: (listener: RealtimeEventListener) => () => void;
  subscribeConnectionState: (listener: RealtimeStateListener) => () => void;
  subscribeReconnect: (listener: RealtimeReconnectListener) => () => void;
  subscribeDiagnostics: (listener: RealtimeDiagnosticListener) => () => void;
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;
const NORMAL_CLOSE_CODE = 1000;

export class RealtimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeConfigurationError";
  }
}

function normalizeOperationAreaId(operationAreaId?: string | null) {
  const trimmed = operationAreaId?.trim();
  return trimmed ? trimmed : null;
}

function isSocketOpeningOrOpen(socket: WebSocket | null) {
  return (
    socket !== null &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  );
}

function warnRealtime(message: string) {
  if (import.meta.env.DEV) {
    console.warn(`[realtime] ${message}`);
  }
}

const DEFAULT_WS_PATH = "/ws/realtime";

/**
 * WS base 해석 규칙:
 * - 빈 값 → same-origin `/ws/realtime` (개발은 vite proxy, 배포는 동일 Nginx 경유)
 * - "/"로 시작 → same-origin + 해당 경로
 * - 그 외 → ws:// 또는 wss:// 절대 URL만 허용
 */
function resolveWsBaseUrl(baseUrl: string): URL {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed.startsWith("/")) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return new URL(
      `${protocol}//${window.location.host}${trimmed || DEFAULT_WS_PATH}`,
    );
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RealtimeConfigurationError("VITE_WS_BASE_URL must be a valid URL.");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new RealtimeConfigurationError("VITE_WS_BASE_URL must use ws:// or wss://.");
  }
  return url;
}

export function buildRealtimeWebSocketUrl(
  baseUrl: string,
  operationAreaId?: string | null,
): string {
  const url = resolveWsBaseUrl(baseUrl);

  const normalizedAreaId = normalizeOperationAreaId(operationAreaId);
  if (normalizedAreaId) {
    url.searchParams.set("operationAreaId", normalizedAreaId);
  }

  return url.toString();
}

export function createOperationWebSocketClient(
  options: WebSocketClientOptions,
): OperationWebSocketClient {
  const reconnectPolicy = options.reconnectPolicy ?? defaultReconnectPolicy;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

  let state: RealtimeConnectionState = {
    status: "idle",
    operationAreaId: null,
    reconnectAttempt: 0,
    lastMessageAt: null,
    lastOpenedAt: null,
    errorMessage: null,
  };
  let socket: WebSocket | null = null;
  let generation = 0;
  let currentUrl: string | null = null;
  let manualDisconnect = false;
  let reconnectTimer: number | null = null;
  let heartbeatTimer: number | null = null;
  let hasOpenedSuccessfully = false;

  const eventListeners = new Set<RealtimeEventListener>();
  const stateListeners = new Set<RealtimeStateListener>();
  const reconnectListeners = new Set<RealtimeReconnectListener>();
  const diagnosticListeners = new Set<RealtimeDiagnosticListener>();

  const setState = (nextState: Partial<RealtimeConnectionState>) => {
    state = { ...state, ...nextState };
    for (const listener of stateListeners) {
      try {
        listener(state);
      } catch {
        warnRealtime("connection state listener failed.");
      }
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearHeartbeatTimer = () => {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const sendPing = () => {
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send("ping");
    } catch {
      warnRealtime("heartbeat ping failed.");
    }
  };

  const startHeartbeat = () => {
    clearHeartbeatTimer();
    heartbeatTimer = window.setInterval(sendPing, heartbeatIntervalMs);
  };

  const notifyEventListeners = (event: RealtimeEvent) => {
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch {
        warnRealtime("event listener failed.");
      }
    }
  };

  const notifyReconnectListeners = () => {
    for (const listener of reconnectListeners) {
      try {
        listener(state);
      } catch {
        warnRealtime("reconnect listener failed.");
      }
    }
  };

  const notifyDiagnosticListeners = (diagnostic: RealtimeDiagnosticEvent) => {
    for (const listener of diagnosticListeners) {
      try {
        listener(diagnostic);
      } catch {
        warnRealtime("diagnostic listener failed.");
      }
    }
  };

  const cleanupSocket = (closeSocket: boolean) => {
    clearHeartbeatTimer();
    if (socket && closeSocket) {
      try {
        socket.close(NORMAL_CLOSE_CODE, "client disconnect");
      } catch {
        warnRealtime("socket close failed.");
      }
    }
    socket = null;
  };

  const openSocket = (
    url: string,
    operationAreaId: string | null,
    isReconnect: boolean,
  ) => {
    const socketGeneration = ++generation;
    let nextSocket: WebSocket;
    try {
      nextSocket = new WebSocket(url);
    } catch {
      socket = null;
      currentUrl = url;
      setState({
        status: "error",
        operationAreaId,
        errorMessage: "WebSocket connection could not be opened.",
      });
      // 일시적 실패(잘못된 네트워크 상태 등)일 수 있으므로 정책 내에서 재시도한다.
      if (!manualDisconnect) {
        scheduleReconnect();
      }
      return;
    }
    socket = nextSocket;
    currentUrl = url;
    setState({
      status: isReconnect ? "reconnecting" : "connecting",
      operationAreaId,
      errorMessage: null,
    });

    nextSocket.onopen = () => {
      if (socketGeneration !== generation) {
        return;
      }

      const shouldNotifyReconnect = isReconnect && hasOpenedSuccessfully;
      hasOpenedSuccessfully = true;
      setState({
        status: "open",
        reconnectAttempt: 0,
        lastOpenedAt: Date.now(),
        errorMessage: null,
      });
      startHeartbeat();
      if (shouldNotifyReconnect) {
        notifyReconnectListeners();
      }
    };

    nextSocket.onmessage = (message) => {
      if (socketGeneration !== generation) {
        return;
      }

      setState({ lastMessageAt: Date.now() });
      const parsed = parseRealtimeEventMessage(message.data);
      if (!parsed.ok) {
        notifyDiagnosticListeners({
          kind: "malformed-message",
          reason: parsed.reason,
        });
        return;
      }

      notifyEventListeners(parsed.event);
    };

    nextSocket.onerror = () => {
      if (socketGeneration !== generation) {
        return;
      }

      setState({
        status: "error",
        errorMessage: "WebSocket connection error.",
      });
    };

    nextSocket.onclose = () => {
      if (socketGeneration !== generation) {
        return;
      }

      clearHeartbeatTimer();
      socket = null;

      if (manualDisconnect) {
        setState({ status: "closed" });
        return;
      }

      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (!reconnectPolicy.enabled || currentUrl === null) {
      setState({ status: "closed" });
      return;
    }
    if (
      reconnectPolicy.maxAttempts > 0 &&
      state.reconnectAttempt >= reconnectPolicy.maxAttempts
    ) {
      setState({
        status: "error",
        errorMessage: "WebSocket reconnect attempts exhausted.",
      });
      return;
    }
    if (reconnectTimer !== null) {
      return;
    }

    const nextAttempt = state.reconnectAttempt + 1;
    const delayMs = getReconnectDelayMs(reconnectPolicy, nextAttempt);
    setState({
      status: "reconnecting",
      reconnectAttempt: nextAttempt,
    });
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (manualDisconnect || currentUrl === null) {
        return;
      }
      openSocket(currentUrl, state.operationAreaId, true);
    }, delayMs);
  };

  const connect = (operationAreaId?: string | null) => {
    const normalizedAreaId = normalizeOperationAreaId(operationAreaId);
    let nextUrl: string;
    try {
      nextUrl = buildRealtimeWebSocketUrl(options.url, normalizedAreaId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid WebSocket URL.";
      manualDisconnect = true;
      clearReconnectTimer();
      cleanupSocket(true);
      setState({
        status: "error",
        operationAreaId: normalizedAreaId,
        errorMessage: message,
      });
      return;
    }

    if (currentUrl === nextUrl && isSocketOpeningOrOpen(socket)) {
      return;
    }

    manualDisconnect = false;
    clearReconnectTimer();
    cleanupSocket(true);
    openSocket(nextUrl, normalizedAreaId, false);
  };

  const disconnect = () => {
    manualDisconnect = true;
    hasOpenedSuccessfully = false;
    currentUrl = null;
    generation += 1;
    clearReconnectTimer();
    cleanupSocket(true);
    setState({
      status: "closed",
      operationAreaId: null,
      reconnectAttempt: 0,
      errorMessage: null,
    });
  };

  return {
    get status() {
      return state.status;
    },
    getState: () => state,
    connect,
    disconnect,
    dispose: () => {
      disconnect();
      eventListeners.clear();
      stateListeners.clear();
      reconnectListeners.clear();
      diagnosticListeners.clear();
    },
    subscribe: (listener) => {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeConnectionState: (listener) => {
      stateListeners.add(listener);
      listener(state);
      return () => stateListeners.delete(listener);
    },
    subscribeReconnect: (listener) => {
      reconnectListeners.add(listener);
      return () => reconnectListeners.delete(listener);
    },
    subscribeDiagnostics: (listener) => {
      diagnosticListeners.add(listener);
      return () => diagnosticListeners.delete(listener);
    },
  };
}
