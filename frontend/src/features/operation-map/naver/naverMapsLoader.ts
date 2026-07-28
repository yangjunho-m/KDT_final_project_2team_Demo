import { useEffect, useState } from "react";

export type NaverMapsSdkStatus = "disabled" | "loading" | "ready" | "error";

const SDK_URL_PREFIX = "https://oapi.map.naver.com/openapi/v3/maps.js";
const SDK_LOAD_TIMEOUT_MS = 10_000;

let loadPromise: Promise<void> | null = null;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

export function getNaverMapClientId(): string {
  return (import.meta.env.VITE_NAVER_MAP_CLIENT_ID ?? "").trim();
}

function notifyAuthFailure() {
  authFailed = true;
  loadPromise = null;
  for (const listener of Array.from(authFailureListeners)) {
    try {
      listener();
    } catch {
      // fallback 전환 리스너가 서로를 막으면 안 된다.
    }
  }
}

/**
 * NAVER Maps SDK를 1회만 script 태그로 로드한다.
 * - 키 없음/로드 실패/인증 실패/타임아웃 → reject (호출측이 placeholder로 fallback)
 * - 인증 실패는 SDK가 로드 후 비동기로 알릴 수 있어 전역 콜백도 함께 감시한다.
 */
export function loadNaverMapsSdk(): Promise<void> {
  const clientId = getNaverMapClientId();
  if (!clientId) {
    return Promise.reject(new Error("VITE_NAVER_MAP_CLIENT_ID is not set."));
  }
  if (authFailed) {
    return Promise.reject(new Error("NAVER Maps authentication failed."));
  }
  if (window.naver?.maps) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    window.navermap_authFailure = () => {
      notifyAuthFailure();
      reject(new Error("NAVER Maps authentication failed."));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${SDK_URL_PREFIX}"]`,
    );
    const script = existing ?? document.createElement("script");

    const timeout = window.setTimeout(() => {
      loadPromise = null;
      reject(new Error("NAVER Maps SDK load timed out."));
    }, SDK_LOAD_TIMEOUT_MS);

    const handleLoad = () => {
      window.clearTimeout(timeout);
      if (window.naver?.maps) {
        resolve();
      } else {
        loadPromise = null;
        reject(new Error("NAVER Maps SDK loaded without maps namespace."));
      }
    };
    const handleError = () => {
      window.clearTimeout(timeout);
      loadPromise = null;
      script.remove();
      reject(new Error("NAVER Maps SDK script failed to load."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.src = `${SDK_URL_PREFIX}?ncpKeyId=${encodeURIComponent(clientId)}`;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return loadPromise;
}

/**
 * SDK 상태 훅. 키가 없으면 "disabled", 로드/인증 실패 시 "error"로,
 * 호출측은 "ready"가 아닐 때 항상 OperationMapPlaceholder로 fallback한다.
 */
export function useNaverMapsSdk(): NaverMapsSdkStatus {
  const clientId = getNaverMapClientId();
  const [status, setStatus] = useState<NaverMapsSdkStatus>(() => {
    if (!clientId) {
      return "disabled";
    }
    if (authFailed) {
      return "error";
    }
    return window.naver?.maps ? "ready" : "loading";
  });

  useEffect(() => {
    if (!clientId) {
      return undefined;
    }
    let cancelled = false;

    const onAuthFailure = () => {
      if (!cancelled) {
        setStatus("error");
      }
    };
    authFailureListeners.add(onAuthFailure);

    loadNaverMapsSdk().then(
      () => {
        if (!cancelled && !authFailed) {
          setStatus("ready");
        }
      },
      () => {
        if (!cancelled) {
          setStatus("error");
        }
      },
    );

    return () => {
      cancelled = true;
      authFailureListeners.delete(onAuthFailure);
    };
  }, [clientId]);

  return status;
}
