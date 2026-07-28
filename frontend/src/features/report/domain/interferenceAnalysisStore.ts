import type { InterferenceEpisodeAnalysis } from "./interferenceEpisode";

/**
 * 교란 에피소드 분석 결과의 로컬 보관소.
 *
 * 백엔드 보고 API에는 이런 구조 데이터를 실을 필드가 없으므로(계약 변경 없이 가려면),
 * 분석 결과는 보고서 id에 매달아 브라우저에 남기고 보고 상세에서 다시 읽어 렌더링한다.
 * 백엔드 보고 자체는 사람이 읽는 요약 텍스트로 정상 생성되므로, 이 로컬 데이터가 없어도
 * (다른 브라우저·저장소 삭제 등) 보고 기능은 그대로 동작한다 — 상세의 분석 블록만 생략된다.
 *
 * 관제(/operation)와 지휘보고(/reports)는 별도 창으로 열릴 수 있어, 다른 창의 쓰기를
 * storage 이벤트로 받아 캐시를 무효화한다. 읽기는 항상 메모리 캐시에서 하므로
 * useSyncExternalStore가 요구하는 "안정적인 스냅샷 참조"가 보장된다.
 */

// v2: scatter/imageUrls → timeline(시간·좌표·오차·이미지 통합 시계열)로 저장 형태 변경.
// 키를 올려 구형 항목이 새 렌더러에 섞이지 않게 한다(이전 데이터는 시연용이라 폐기 가능).
const STORAGE_KEY = "greenlight.interference-analysis.v2";
/** 장기 운용에도 저장소가 무한히 늘지 않도록 최신 N건만 유지한다. */
const MAX_ENTRIES = 50;

type StoredMap = Record<string, InterferenceEpisodeAnalysis>;

type StoreListener = () => void;

const listeners = new Set<StoreListener>();

/** 메모리 캐시 — null이면 아직 저장소에서 읽지 않은 상태 */
let cache: StoredMap | null = null;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function parseStored(raw: string | null): StoredMap {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as StoredMap;
  } catch {
    // 저장 형식이 깨졌더라도 보고 기능 자체는 계속 동작해야 한다.
    return {};
  }
}

function readCache(): StoredMap {
  if (cache) {
    return cache;
  }
  cache = canUseStorage()
    ? parseStored(window.localStorage.getItem(STORAGE_KEY))
    : {};
  return cache;
}

/** 오래된 항목부터 잘라 최신 MAX_ENTRIES건만 남긴다. */
function prune(map: StoredMap): StoredMap {
  const entries = Object.entries(map);
  if (entries.length <= MAX_ENTRIES) {
    return map;
  }
  return Object.fromEntries(
    entries.sort((a, b) => b[1].endedAtMs - a[1].endedAtMs).slice(0, MAX_ENTRIES),
  );
}

function emit() {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // 구독자끼리 서로를 막지 않는다.
    }
  }
}

// 다른 창(관제 화면)에서 분석이 저장되면 캐시를 버리고 구독자에게 알린다.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) {
      return;
    }
    cache = null;
    emit();
  });
}

export function subscribeInterferenceAnalyses(listener: StoreListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 보고서 id에 분석 결과를 붙여 저장한다. */
export function saveInterferenceAnalysis(
  reportId: string,
  analysis: InterferenceEpisodeAnalysis,
) {
  const next = prune({ ...readCache(), [reportId]: analysis });
  cache = next;
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 용량 초과 등으로 저장에 실패해도 메모리 캐시로는 계속 보여준다.
    }
  }
  emit();
}

/**
 * 보고서 id에 붙은 분석 결과. 캐시에서 읽으므로 값이 바뀌지 않는 한 참조가 유지된다
 * (useSyncExternalStore의 getSnapshot 계약).
 */
export function getInterferenceAnalysis(
  reportId: string,
): InterferenceEpisodeAnalysis | null {
  return readCache()[reportId] ?? null;
}
