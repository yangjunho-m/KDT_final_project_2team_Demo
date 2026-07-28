import { useEffect, useRef } from "react";
import type { DroneFlightRuntime, MapLayers, MapMode } from "../../../stores";
import type {
  Coordinate,
  Drone,
  EnemyArea,
  Target,
} from "../../../shared/types";
import {
  escapeHtml,
  isUsableCoordinate,
  MARKER_BADGE_STYLE,
  safeNaverCall,
} from "../naver/naverMapUtils";

/** 실시간 교란 상태에 따른 드론 marker 색 구분 */
export type DroneMarkerTone =
  | "normal"
  | "jamming"
  | "spoofing"
  | "crossview"
  | "corrected";

export type OperationNaverMapZone = {
  center: Coordinate;
  radiusMeters: number;
  tone: "jamming" | "spoofing";
};

/** 시나리오 실행 중 드론별 교란/보정 경로 오버레이 데이터 (정상 경로는 droneRoutes로 분리) */
export type OperationNaverMapDroneTrack = {
  /** INS 운용 경로 폴리라인 (교란 발생 시 INS만 운용한 경로) */
  gpsPath: Coordinate[];
  /** 보정(AI 재추정) 경로 폴리라인 */
  correctedPath: Coordinate[];
  /** 현재 GPS 보고 위치 (교란 마커) */
  gpsCurrent?: Coordinate | null;
  /** 현재 AI 보정 위치 (보정 마커) */
  correctedCurrent?: Coordinate | null;
  /** 교란 유형 (마커 표시 조건) */
  interferenceType?: "JAMMING" | "SPOOFING" | null;
};

/** 3경로 색상 (정상=초록, 교란=빨강, 보정=파랑) */
const PATH_COLORS = {
  true: "#10b981",
  gps: "#ef4444",
  corrected: "#2563eb",
} as const;

export type OperationNaverMapProps = {
  area: EnemyArea;
  drones: Drone[];
  targets?: Target[];
  selectedDroneId?: string | null;
  mapMode?: MapMode;
  layers?: MapLayers;
  flightRuntimes?: Record<string, DroneFlightRuntime>;
  /** active scenario의 교란 구역 (없으면 미표시) */
  interferenceZone?: OperationNaverMapZone | null;
  /** droneId → 교란 상태 tone (없으면 normal) */
  droneTones?: Record<string, DroneMarkerTone>;
  /** droneId → 시나리오 궤적/좌표 비교 오버레이 (없으면 미표시) */
  droneTracks?: Record<string, OperationNaverMapDroneTrack>;
  /**
   * droneId → 정상(계획) 경로 좌표 배열. 백엔드가 드론별 전체 route(출발→도착)를 미리
   * 주면 시나리오 실행과 무관하게 항상 초록 정적 라인으로 그린다. route가 새로 나타난
   * 작전지역에서는 한 번만 그 경로에 맞춰 시야를 맞춘다(이후 줌/이동은 사용자 자유).
   */
  droneRoutes?: Record<string, Coordinate[]>;
  /**
   * 어느 드론이든 실제로 교란(재밍/스푸핑) 중이면 true — "교란 상황 모드"로 전환해
   * 드론 아이콘 외 라벨 텍스트를 지우고 드론 아이콘 라벨은 키워서 상황 인지를 돕는다.
   */
  hasActiveInterference?: boolean;
  /** 미니맵 클릭 등 외부에서 지도 중심 이동 요청 (token이 바뀔 때마다 pan) */
  focusRequest?: { coordinate: Coordinate; token: number } | null;
  onDroneSelect?: (droneId: string) => void;
  onTargetSelect?: (targetId: string) => void;
  /** 마커가 아닌 지도 빈 곳 클릭 (선택 해제용) */
  onMapClick?: () => void;
  /** 팬/줌이 멈출 때마다(idle) 현재 화면에 보이는 영역(SW/NE)을 전달 — 미니맵 뷰포트 사각형용 */
  onViewportChange?: (bounds: { sw: Coordinate; ne: Coordinate }) => void;
};

// 지도 center를 계산할 수 없을 때의 안전 기본값 (서울 중심)
const FALLBACK_CENTER: Coordinate = { latitude: 37.5665, longitude: 126.978 };
const DEFAULT_ZOOM = 15;

// 시나리오 정상 경로 추적 시 fitBounds 여유값 — DroneFocusMap과 동일 기준을 사용한다.
const METERS_PER_DEG_LAT = 111320;
const TRACK_FIT_MARGIN_RATIO = 1.4;
const TRACK_FIT_MARGIN_MIN_METERS = 80;

const DRONE_TONE_COLORS: Record<DroneMarkerTone, string> = {
  normal: "#2563eb",
  jamming: "#f59e0b",
  spoofing: "#ef4444",
  crossview: "#8b5cf6",
  corrected: "#10b981",
};

const ZONE_COLORS: Record<OperationNaverMapZone["tone"], string> = {
  jamming: "#f59e0b",
  spoofing: "#ef4444",
};

/** 우선순위: 작전지역 중심 → 표시 드론 평균 → 서울 중심 */
function resolveMapCenter(area: EnemyArea, drones: Drone[]): Coordinate {
  if (isUsableCoordinate(area.latitude, area.longitude)) {
    return { latitude: area.latitude, longitude: area.longitude };
  }
  const usable = drones.filter((drone) =>
    isUsableCoordinate(
      drone.currentPosition.latitude,
      drone.currentPosition.longitude,
    ),
  );
  if (usable.length > 0) {
    return {
      latitude:
        usable.reduce((sum, d) => sum + d.currentPosition.latitude, 0) /
        usable.length,
      longitude:
        usable.reduce((sum, d) => sum + d.currentPosition.longitude, 0) /
        usable.length,
    };
  }
  return FALLBACK_CENTER;
}

// 교란 상황 모드에서 드론 라벨을 키울 때 쓰는 확대 배지 스타일 (기본 MARKER_BADGE_STYLE 대비 크게)
const MARKER_BADGE_STYLE_LARGE = MARKER_BADGE_STYLE.replace(
  "font-size:11px;",
  "font-size:15px;",
).replace("padding:2px 7px;", "padding:4px 10px;");

function buildDroneMarkerHtml(
  name: string,
  tone: DroneMarkerTone,
  iconImageUrl?: string,
  emphasizeLabel = false,
) {
  const color = DRONE_TONE_COLORS[tone];
  // 업로드된 드론 아이콘이 있으면 tone 색 테두리의 원형 이미지로 표시
  const dot = iconImageUrl
    ? `<img src="${escapeHtml(iconImageUrl)}" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;background:#fff;border:3px solid ${color};box-shadow:0 1px 5px rgba(0,0,0,.4);" />`
    : `<span style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);"></span>`;
  // 교란 상황 중에는 지도에서 드론 위치가 가장 중요한 정보이므로 라벨을 키워 눈에 띄게 한다.
  const badgeStyle = emphasizeLabel ? MARKER_BADGE_STYLE_LARGE : MARKER_BADGE_STYLE;
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-100%);">`,
    `<span style="${badgeStyle}background:${color};">${escapeHtml(name)}</span>`,
    dot,
    `</div>`,
  ].join("");
}

function buildAreaCenterHtml(name: string, hideLabel = false) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-50%);">`,
    `<span style="width:26px;height:26px;border:2.5px solid #dc2626;border-radius:50%;position:relative;background:rgba(220,38,38,.12);">`,
    `<span style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#dc2626;"></span>`,
    `</span>`,
    hideLabel
      ? ""
      : `<span style="${MARKER_BADGE_STYLE}background:#dc2626;">${escapeHtml(name)}</span>`,
    `</div>`,
  ].join("");
}

function buildTargetMarkerHtml(name: string, imageUrl?: string, hideLabel = false) {
  // 표적 이미지(드론 촬영 시뮬)가 있으면 발견 마커에 썸네일로 표시
  const mark = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="" style="width:34px;height:34px;border-radius:7px;object-fit:cover;background:#fff;border:2px solid #b91c1c;box-shadow:0 1px 5px rgba(0,0,0,.45);" />`
    : `<span style="width:13px;height:13px;background:#b91c1c;border:2px solid #fff;transform:rotate(45deg);box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>`;
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-100%);">`,
    hideLabel
      ? ""
      : `<span style="${MARKER_BADGE_STYLE}background:#b91c1c;">${escapeHtml(name)}</span>`,
    mark,
    `</div>`,
  ].join("");
}

function buildMovementTargetHtml() {
  return (
    `<div style="transform:translate(-50%,-100%);font-size:18px;` +
    `filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));">🚩</div>`
  );
}

/** INS 운용 위치 마커 (INS 운용 경로 끝 — 재밍 시 GPS 상실, 스푸핑 시 GPS 왜곡) */
function buildGpsMarkerHtml(
  interferenceType: "JAMMING" | "SPOOFING",
  hideLabel = false,
) {
  const label =
    interferenceType === "JAMMING" ? "INS 운용 · GPS 상실" : "INS 운용 · GPS 왜곡";
  const glyph = interferenceType === "JAMMING" ? "✕" : "⚠";
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%);">`,
    hideLabel
      ? ""
      : `<span style="${MARKER_BADGE_STYLE}background:${PATH_COLORS.gps};">${label}</span>`,
    `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#fff;border:2.5px solid ${PATH_COLORS.gps};box-shadow:0 1px 4px rgba(0,0,0,.4);font-size:11px;color:${PATH_COLORS.gps};font-weight:800;">${glyph}</span>`,
    `</div>`,
  ].join("");
}

/** Cross-view AI 보정 위치 마커 (보정 경로 끝) */
function buildCorrectedMarkerHtml(hideLabel = false) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%);">`,
    hideLabel
      ? ""
      : `<span style="${MARKER_BADGE_STYLE}background:${PATH_COLORS.corrected};">AI 보정</span>`,
    `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#fff;border:2.5px solid ${PATH_COLORS.corrected};box-shadow:0 1px 4px rgba(0,0,0,.4);font-size:11px;color:${PATH_COLORS.corrected};font-weight:800;">✓</span>`,
    `</div>`,
  ].join("");
}

function hasVisiblePath(runtime: DroneFlightRuntime | undefined): boolean {
  return (
    !!runtime &&
    runtime.destinationPosition !== null &&
    (runtime.status === "MOVING" ||
      runtime.status === "PAUSED" ||
      runtime.status === "HOVERING" ||
      runtime.status === "RETURNING")
  );
}

/**
 * NAVER Maps 기반 Operation 실지도.
 * marker 위치는 이미 resolveOperationDroneDisplayPosition을 거친
 * displayDrones의 currentPosition을 그대로 사용한다. (보간 없음)
 * 레이어(작전지역 중심/반경·이동 경로·목표점·교란 구역·표적)는 mapUiStore 토글을 따른다.
 */
export function OperationNaverMap({
  area,
  drones,
  targets = [],
  selectedDroneId,
  mapMode = "normal",
  layers,
  flightRuntimes = {},
  interferenceZone = null,
  droneTones = {},
  droneTracks = {},
  droneRoutes = {},
  hasActiveInterference = false,
  focusRequest = null,
  onDroneSelect,
  onTargetSelect,
  onMapClick,
  onViewportChange,
}: OperationNaverMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const droneMarkersRef = useRef(new Map<string, naver.maps.Marker>());
  const droneListenersRef = useRef(new Map<string, unknown>());
  const droneToneCacheRef = useRef(new Map<string, string>());
  const targetMarkersRef = useRef(new Map<string, naver.maps.Marker>());
  const targetListenersRef = useRef(new Map<string, unknown>());
  const pathLinesRef = useRef(new Map<string, naver.maps.Polyline>());
  const moveTargetMarkersRef = useRef(new Map<string, naver.maps.Marker>());
  // 정상(계획) 경로 폴리라인 (droneRoutes 전용) — 시나리오와 무관하게 항상 그린다.
  const routeLinesRef = useRef(new Map<string, naver.maps.Polyline>());
  // 정상 경로 집합이 바뀔 때 "한 번만" 시야를 맞추기 위한 서명 기록
  const routeFittedSigRef = useRef<string>("");
  const gpsPathLinesRef = useRef(new Map<string, naver.maps.Polyline>());
  const correctedPathLinesRef = useRef(new Map<string, naver.maps.Polyline>());
  const gpsMarkersRef = useRef(new Map<string, naver.maps.Marker>());
  const correctedMarkersRef = useRef(new Map<string, naver.maps.Marker>());
  const areaCenterMarkerRef = useRef<naver.maps.Marker | null>(null);
  const areaRadiusCircleRef = useRef<naver.maps.Circle | null>(null);
  const zoneCircleRef = useRef<naver.maps.Circle | null>(null);
  const dronesRef = useRef(drones);
  const onDroneSelectRef = useRef(onDroneSelect);
  const onTargetSelectRef = useRef(onTargetSelect);
  const onMapClickRef = useRef(onMapClick);
  const onViewportChangeRef = useRef(onViewportChange);

  useEffect(() => {
    dronesRef.current = drones;
    onDroneSelectRef.current = onDroneSelect;
    onTargetSelectRef.current = onTargetSelect;
    onMapClickRef.current = onMapClick;
    onViewportChangeRef.current = onViewportChange;
  }, [drones, onDroneSelect, onTargetSelect, onMapClick, onViewportChange]);

  // 지도 생성/파괴 (mount 1회)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.naver?.maps) {
      return undefined;
    }
    const droneMarkers = droneMarkersRef.current;
    const droneListeners = droneListenersRef.current;
    const targetMarkers = targetMarkersRef.current;
    const targetListeners = targetListenersRef.current;
    const pathLines = pathLinesRef.current;
    const moveTargetMarkers = moveTargetMarkersRef.current;
    const routeLines = routeLinesRef.current;
    const gpsPathLines = gpsPathLinesRef.current;
    const correctedPathLines = correctedPathLinesRef.current;
    const gpsMarkers = gpsMarkersRef.current;
    const correctedMarkers = correctedMarkersRef.current;
    const center = resolveMapCenter(area, dronesRef.current);
    const map = safeNaverCall(
      () =>
        new window.naver!.maps.Map(container, {
          center: new window.naver!.maps.LatLng(
            center.latitude,
            center.longitude,
          ),
          zoom: DEFAULT_ZOOM,
          mapDataControl: false,
        }),
    );
    if (!map) {
      return undefined;
    }
    mapRef.current = map;
    const mapClickListener = safeNaverCall(() =>
      window.naver!.maps.Event.addListener(map, "click", () => {
        onMapClickRef.current?.();
      }),
    );
    const emitViewport = () => {
      const bounds = safeNaverCall(() => map.getBounds());
      if (!bounds) {
        return;
      }
      const sw = safeNaverCall(() => bounds.getSW());
      const ne = safeNaverCall(() => bounds.getNE());
      if (!sw || !ne) {
        return;
      }
      onViewportChangeRef.current?.({
        sw: { latitude: sw.lat(), longitude: sw.lng() },
        ne: { latitude: ne.lat(), longitude: ne.lng() },
      });
    };
    // 팬/줌/최초 렌더가 끝날 때마다(idle) 미니맵 뷰포트 사각형을 갱신한다.
    const idleListener = safeNaverCall(() =>
      window.naver!.maps.Event.addListener(map, "idle", emitViewport),
    );
    emitViewport();

    return () => {
      if (mapClickListener) {
        safeNaverCall(() =>
          window.naver?.maps.Event.removeListener(mapClickListener),
        );
      }
      if (idleListener) {
        safeNaverCall(() =>
          window.naver?.maps.Event.removeListener(idleListener),
        );
      }
      for (const listener of [
        ...droneListeners.values(),
        ...targetListeners.values(),
      ]) {
        safeNaverCall(() => window.naver?.maps.Event.removeListener(listener));
      }
      droneListeners.clear();
      targetListeners.clear();
      for (const overlay of [
        ...droneMarkers.values(),
        ...targetMarkers.values(),
        ...pathLines.values(),
        ...moveTargetMarkers.values(),
        ...routeLines.values(),
        ...gpsPathLines.values(),
        ...correctedPathLines.values(),
        ...gpsMarkers.values(),
        ...correctedMarkers.values(),
        areaCenterMarkerRef.current,
        areaRadiusCircleRef.current,
        zoneCircleRef.current,
      ]) {
        safeNaverCall(() => overlay?.setMap(null));
      }
      droneMarkers.clear();
      targetMarkers.clear();
      pathLines.clear();
      moveTargetMarkers.clear();
      routeLines.clear();
      gpsPathLines.clear();
      correctedPathLines.clear();
      gpsMarkers.clear();
      correctedMarkers.clear();
      areaCenterMarkerRef.current = null;
      areaRadiusCircleRef.current = null;
      zoneCircleRef.current = null;
      safeNaverCall(() => map.destroy());
      mapRef.current = null;
    };
    // 지도 인스턴스는 1회 생성; area 이동은 아래 setCenter effect가 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 작전지역 변경 시 center 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const center = resolveMapCenter(area, dronesRef.current);
    safeNaverCall(() =>
      map.setCenter(
        new window.naver!.maps.LatLng(center.latitude, center.longitude),
      ),
    );
  }, [area]);

  // 일반/위성 모드 전환
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    safeNaverCall(() =>
      map.setMapTypeId(
        mapMode === "satellite"
          ? window.naver!.maps.MapTypeId.SATELLITE
          : window.naver!.maps.MapTypeId.NORMAL,
      ),
    );
  }, [mapMode]);

  // 작전지역 중심 마커 + 반경 원
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const showCenter = layers?.enemyAreaCenter !== false;
    const showRadius = layers?.enemyAreaRadius === true;
    const usable = isUsableCoordinate(area.latitude, area.longitude);
    const position = usable
      ? new maps.LatLng(area.latitude, area.longitude)
      : null;

    safeNaverCall(() => {
      if (!position || !showCenter) {
        areaCenterMarkerRef.current?.setMap(null);
        areaCenterMarkerRef.current = null;
      } else if (areaCenterMarkerRef.current) {
        areaCenterMarkerRef.current.setPosition(position);
        areaCenterMarkerRef.current.setIcon({
          content: buildAreaCenterHtml(area.name, hasActiveInterference),
        });
      } else {
        areaCenterMarkerRef.current = new maps.Marker({
          position,
          map,
          icon: { content: buildAreaCenterHtml(area.name, hasActiveInterference) },
          zIndex: 40,
          clickable: false,
        });
      }
    });

    safeNaverCall(() => {
      if (!position || !showRadius || !(area.radiusMeters > 0)) {
        areaRadiusCircleRef.current?.setMap(null);
        areaRadiusCircleRef.current = null;
      } else if (areaRadiusCircleRef.current) {
        areaRadiusCircleRef.current.setCenter(position);
        areaRadiusCircleRef.current.setRadius(area.radiusMeters);
      } else {
        areaRadiusCircleRef.current = new maps.Circle({
          map,
          center: position,
          radius: area.radiusMeters,
          strokeColor: "#dc2626",
          strokeOpacity: 0.7,
          strokeWeight: 2,
          strokeStyle: "shortdash",
          fillColor: "#dc2626",
          fillOpacity: 0.05,
          clickable: false,
        });
      }
    });
  }, [
    area,
    layers?.enemyAreaCenter,
    layers?.enemyAreaRadius,
    hasActiveInterference,
  ]);

  // 교란 구역 원 (active scenario)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const show =
      layers?.scenarioEffectRadius !== false &&
      interferenceZone !== null &&
      isUsableCoordinate(
        interferenceZone.center.latitude,
        interferenceZone.center.longitude,
      );

    safeNaverCall(() => {
      if (!show) {
        zoneCircleRef.current?.setMap(null);
        zoneCircleRef.current = null;
        return;
      }
      const color = ZONE_COLORS[interferenceZone!.tone];
      const center = new maps.LatLng(
        interferenceZone!.center.latitude,
        interferenceZone!.center.longitude,
      );
      if (zoneCircleRef.current) {
        zoneCircleRef.current.setOptions({
          center,
          radius: interferenceZone!.radiusMeters,
          strokeColor: color,
          fillColor: color,
        });
      } else {
        zoneCircleRef.current = new maps.Circle({
          map,
          center,
          radius: interferenceZone!.radiusMeters,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.14,
          clickable: false,
        });
      }
    });
  }, [interferenceZone, layers?.scenarioEffectRadius]);

  // 드론 marker 동기화 (교란 tone 반영, 기존 marker 재사용, 사라진 드론 정리)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const markers = droneMarkersRef.current;
    const listeners = droneListenersRef.current;
    const toneCache = droneToneCacheRef.current;
    const showDrones = layers?.drones !== false;
    const aliveIds = new Set<string>();

    if (showDrones) {
      for (const drone of drones) {
        const { latitude, longitude } = drone.currentPosition;
        if (!isUsableCoordinate(latitude, longitude)) {
          continue;
        }
        aliveIds.add(drone.id);
        const tone: DroneMarkerTone = droneTones[drone.id] ?? "normal";
        const iconKey = `${tone}:${drone.name}:${drone.iconImageUrl ?? ""}:${hasActiveInterference}`;
        const existing = markers.get(drone.id);
        if (existing) {
          safeNaverCall(() => {
            existing.setPosition(new maps.LatLng(latitude, longitude));
            if (toneCache.get(drone.id) !== iconKey) {
              existing.setIcon({
                content: buildDroneMarkerHtml(
                  drone.name,
                  tone,
                  drone.iconImageUrl,
                  hasActiveInterference,
                ),
              });
              toneCache.set(drone.id, iconKey);
            }
          });
          continue;
        }
        safeNaverCall(() => {
          const marker = new maps.Marker({
            position: new maps.LatLng(latitude, longitude),
            map,
            title: drone.name,
            icon: {
              content: buildDroneMarkerHtml(
                drone.name,
                tone,
                drone.iconImageUrl,
                hasActiveInterference,
              ),
            },
            zIndex: 60,
          });
          toneCache.set(drone.id, iconKey);
          const listener = maps.Event.addListener(marker, "click", () => {
            onDroneSelectRef.current?.(drone.id);
          });
          markers.set(drone.id, marker);
          listeners.set(drone.id, listener);
        });
      }
    }

    for (const [droneId, marker] of Array.from(markers.entries())) {
      if (!aliveIds.has(droneId)) {
        const listener = listeners.get(droneId);
        if (listener) {
          safeNaverCall(() => maps.Event.removeListener(listener));
          listeners.delete(droneId);
        }
        safeNaverCall(() => marker.setMap(null));
        markers.delete(droneId);
        toneCache.delete(droneId);
      }
    }
  }, [drones, droneTones, layers?.drones, hasActiveInterference]);

  // 이동 경로(잔여 구간) 점선 + 이동 목표 깃발
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const lines = pathLinesRef.current;
    const flags = moveTargetMarkersRef.current;
    const showPath = layers?.movementPath !== false;
    const showTarget = layers?.movementTarget !== false;
    const aliveIds = new Set<string>();

    for (const drone of drones) {
      const runtime = flightRuntimes[drone.id];
      if (!hasVisiblePath(runtime)) {
        continue;
      }
      const destination = runtime!.destinationPosition!;
      if (
        !isUsableCoordinate(destination.latitude, destination.longitude) ||
        !isUsableCoordinate(
          drone.currentPosition.latitude,
          drone.currentPosition.longitude,
        )
      ) {
        continue;
      }
      aliveIds.add(drone.id);
      const path = [
        new maps.LatLng(
          drone.currentPosition.latitude,
          drone.currentPosition.longitude,
        ),
        new maps.LatLng(destination.latitude, destination.longitude),
      ];
      safeNaverCall(() => {
        if (!showPath) {
          lines.get(drone.id)?.setMap(null);
          lines.delete(drone.id);
        } else if (lines.has(drone.id)) {
          lines.get(drone.id)!.setPath(path);
        } else {
          lines.set(
            drone.id,
            new maps.Polyline({
              map,
              path,
              strokeColor: "#2563eb",
              strokeOpacity: 0.85,
              strokeWeight: 3,
              strokeStyle: "shortdash",
              clickable: false,
            }),
          );
        }
      });
      safeNaverCall(() => {
        const position = new maps.LatLng(
          destination.latitude,
          destination.longitude,
        );
        if (!showTarget) {
          flags.get(drone.id)?.setMap(null);
          flags.delete(drone.id);
        } else if (flags.has(drone.id)) {
          flags.get(drone.id)!.setPosition(position);
        } else {
          flags.set(
            drone.id,
            new maps.Marker({
              position,
              map,
              icon: { content: buildMovementTargetHtml() },
              zIndex: 50,
              clickable: false,
            }),
          );
        }
      });
    }

    for (const [droneId, line] of Array.from(lines.entries())) {
      if (!aliveIds.has(droneId)) {
        safeNaverCall(() => line.setMap(null));
        lines.delete(droneId);
      }
    }
    for (const [droneId, flag] of Array.from(flags.entries())) {
      if (!aliveIds.has(droneId)) {
        safeNaverCall(() => flag.setMap(null));
        flags.delete(droneId);
      }
    }
  }, [drones, flightRuntimes, layers?.movementPath, layers?.movementTarget]);

  // 시나리오 교란(INS)/보정 폴리라인 + 현재 GPS/보정 위치 마커
  // (정상 경로는 아래 droneRoutes 전용 효과가 시나리오와 무관하게 그린다)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const gpsPathLines = gpsPathLinesRef.current;
    const correctedPathLines = correctedPathLinesRef.current;
    const gpsMarkers = gpsMarkersRef.current;
    const correctedMarkers = correctedMarkersRef.current;
    const showGps = layers?.gnssPosition !== false;
    const showCorrected = layers?.crossViewPosition !== false;
    const gpsAlive = new Set<string>();
    const correctedAlive = new Set<string>();

    // 폴리라인 동기화 헬퍼 (기존 재사용, 없으면 생성, 2점 미만이면 제거)
    const syncLine = (
      store: Map<string, naver.maps.Polyline>,
      alive: Set<string>,
      droneId: string,
      show: boolean,
      points: Coordinate[],
      options: {
        color: string;
        weight: number;
        opacity: number;
        style?: "solid" | "shortdash";
      },
    ) => {
      const usable = show
        ? points.filter((point) =>
            isUsableCoordinate(point.latitude, point.longitude),
          )
        : [];
      if (usable.length < 2) {
        const existing = store.get(droneId);
        if (existing) {
          safeNaverCall(() => existing.setMap(null));
          store.delete(droneId);
        }
        return;
      }
      alive.add(droneId);
      const path = usable.map(
        (point) => new maps.LatLng(point.latitude, point.longitude),
      );
      safeNaverCall(() => {
        const existing = store.get(droneId);
        if (existing) {
          existing.setPath(path);
        } else {
          store.set(
            droneId,
            new maps.Polyline({
              map,
              path,
              strokeColor: options.color,
              strokeOpacity: options.opacity,
              strokeWeight: options.weight,
              ...(options.style === "shortdash"
                ? { strokeStyle: "shortdash" }
                : {}),
              clickable: false,
            }),
          );
        }
      });
    };

    // 마커 동기화 헬퍼
    const syncMarker = (
      store: Map<string, naver.maps.Marker>,
      alive: Set<string>,
      droneId: string,
      show: boolean,
      position: Coordinate | null | undefined,
      html: string,
      zIndex: number,
    ) => {
      if (
        !show ||
        !position ||
        !isUsableCoordinate(position.latitude, position.longitude)
      ) {
        const existing = store.get(droneId);
        if (existing) {
          safeNaverCall(() => existing.setMap(null));
          store.delete(droneId);
        }
        return;
      }
      alive.add(droneId);
      const latLng = new maps.LatLng(position.latitude, position.longitude);
      safeNaverCall(() => {
        const existing = store.get(droneId);
        if (existing) {
          existing.setPosition(latLng);
          existing.setIcon({ content: html });
        } else {
          store.set(
            droneId,
            new maps.Marker({
              position: latLng,
              map,
              icon: { content: html },
              zIndex,
              clickable: false,
            }),
          );
        }
      });
    };

    for (const [droneId, track] of Object.entries(droneTracks)) {
      // INS 운용 경로(빨강 점선)
      syncLine(gpsPathLines, gpsAlive, droneId, showGps, track.gpsPath, {
        color: PATH_COLORS.gps,
        weight: 3,
        opacity: 0.85,
        style: "shortdash",
      });
      // 보정 경로(파랑 실선)
      syncLine(
        correctedPathLines,
        correctedAlive,
        droneId,
        showCorrected,
        track.correctedPath,
        { color: PATH_COLORS.corrected, weight: 3, opacity: 0.9 },
      );

      // 현재 GPS/보정 위치 마커는 교란 중일 때만 표시 (정상 시엔 경로가 겹치므로 생략)
      const showInterferenceMarkers =
        track.interferenceType !== null && track.interferenceType !== undefined;
      syncMarker(
        gpsMarkers,
        gpsAlive,
        droneId,
        showGps && showInterferenceMarkers,
        track.gpsCurrent,
        buildGpsMarkerHtml(
          track.interferenceType ?? "SPOOFING",
          hasActiveInterference,
        ),
        55,
      );
      syncMarker(
        correctedMarkers,
        correctedAlive,
        droneId,
        showCorrected && showInterferenceMarkers,
        track.correctedCurrent,
        buildCorrectedMarkerHtml(hasActiveInterference),
        56,
      );
    }

    // 사라진 드론의 오버레이 정리
    const prune = (
      store: Map<string, { setMap: (map: null) => void }>,
      alive: Set<string>,
    ) => {
      for (const [droneId, overlay] of Array.from(store.entries())) {
        if (!alive.has(droneId)) {
          safeNaverCall(() => overlay.setMap(null));
          store.delete(droneId);
        }
      }
    };
    prune(gpsPathLines, gpsAlive);
    prune(correctedPathLines, correctedAlive);
    prune(gpsMarkers, gpsAlive);
    prune(correctedMarkers, correctedAlive);
  }, [
    droneTracks,
    layers?.gnssPosition,
    layers?.crossViewPosition,
    hasActiveInterference,
  ]);

  // 정상(계획) 경로 — 드론별 route(출발→도착) 좌표를 시나리오와 무관하게 항상 초록
  // 실선으로 그린다. route 집합이 새로 나타나거나 바뀌면 그 경로 전체에 "한 번만" 시야를
  // 맞추고, 이후엔 사용자의 줌/이동을 방해하지 않는다(연속 auto-fit 제거로 줌 정상 동작).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const routeLines = routeLinesRef.current;
    const showRoute = layers?.actualPath !== false;
    const alive = new Set<string>();
    const allPoints: Coordinate[] = [];

    for (const [droneId, rawRoute] of Object.entries(droneRoutes)) {
      const usable = showRoute
        ? rawRoute.filter((point) =>
            isUsableCoordinate(point.latitude, point.longitude),
          )
        : [];
      if (usable.length < 2) {
        const existing = routeLines.get(droneId);
        if (existing) {
          safeNaverCall(() => existing.setMap(null));
          routeLines.delete(droneId);
        }
        continue;
      }
      alive.add(droneId);
      for (const point of usable) {
        allPoints.push(point);
      }
      const path = usable.map(
        (point) => new maps.LatLng(point.latitude, point.longitude),
      );
      safeNaverCall(() => {
        const existing = routeLines.get(droneId);
        if (existing) {
          existing.setPath(path);
        } else {
          routeLines.set(
            droneId,
            new maps.Polyline({
              map,
              path,
              strokeColor: PATH_COLORS.true,
              strokeOpacity: 0.9,
              strokeWeight: 4,
              clickable: false,
            }),
          );
        }
      });
    }
    // 사라진 드론의 경로 라인 정리
    for (const [droneId, line] of Array.from(routeLines.entries())) {
      if (!alive.has(droneId)) {
        safeNaverCall(() => line.setMap(null));
        routeLines.delete(droneId);
      }
    }

    // route 집합(드론별 길이)이 바뀌었을 때만 한 번 시야를 맞춘다.
    const signature = Object.entries(droneRoutes)
      .map(([id, route]) => `${id}:${route.length}`)
      .sort()
      .join("|");
    if (allPoints.length >= 2 && signature !== routeFittedSigRef.current) {
      routeFittedSigRef.current = signature;
      safeNaverCall(() => {
        let south = allPoints[0].latitude;
        let north = allPoints[0].latitude;
        let west = allPoints[0].longitude;
        let east = allPoints[0].longitude;
        for (const point of allPoints) {
          south = Math.min(south, point.latitude);
          north = Math.max(north, point.latitude);
          west = Math.min(west, point.longitude);
          east = Math.max(east, point.longitude);
        }
        const centerLat = (south + north) / 2;
        const latRad = (centerLat * Math.PI) / 180;
        const metersPerLng =
          METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
        const spanMeters = Math.max(
          (north - south) * METERS_PER_DEG_LAT,
          (east - west) * metersPerLng,
        );
        const marginMeters = Math.max(
          spanMeters * (TRACK_FIT_MARGIN_RATIO - 1),
          TRACK_FIT_MARGIN_MIN_METERS,
        );
        const dLat = marginMeters / METERS_PER_DEG_LAT;
        const dLng = marginMeters / metersPerLng;
        map.fitBounds(
          new maps.LatLngBounds(
            new maps.LatLng(south - dLat, west - dLng),
            new maps.LatLng(north + dLat, east + dLng),
          ),
        );
      });
    }
  }, [droneRoutes, layers?.actualPath]);

  // 표적 marker 동기화
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const markers = targetMarkersRef.current;
    const listeners = targetListenersRef.current;
    const showTargets = layers?.targets !== false;
    const aliveIds = new Set<string>();

    if (showTargets) {
      for (const target of targets) {
        const { latitude, longitude } = target.position;
        if (!isUsableCoordinate(latitude, longitude)) {
          continue;
        }
        aliveIds.add(target.id);
        const position = new maps.LatLng(latitude, longitude);
        const existing = markers.get(target.id);
        if (existing) {
          safeNaverCall(() => {
            existing.setPosition(position);
            existing.setIcon({
              content: buildTargetMarkerHtml(
                target.name,
                target.imageUrl,
                hasActiveInterference,
              ),
            });
          });
          continue;
        }
        safeNaverCall(() => {
          const marker = new maps.Marker({
            position,
            map,
            title: target.name,
            icon: {
              content: buildTargetMarkerHtml(
                target.name,
                target.imageUrl,
                hasActiveInterference,
              ),
            },
            zIndex: 45,
          });
          const listener = maps.Event.addListener(marker, "click", () => {
            onTargetSelectRef.current?.(target.id);
          });
          markers.set(target.id, marker);
          listeners.set(target.id, listener);
        });
      }
    }

    for (const [targetId, marker] of Array.from(markers.entries())) {
      if (!aliveIds.has(targetId)) {
        const listener = listeners.get(targetId);
        if (listener) {
          safeNaverCall(() => maps.Event.removeListener(listener));
          listeners.delete(targetId);
        }
        safeNaverCall(() => marker.setMap(null));
        markers.delete(targetId);
      }
    }
  }, [targets, layers?.targets, hasActiveInterference]);

  // 선택 드론 marker 강조 (상세 정보는 React 팝업 패널이 담당)
  useEffect(() => {
    if (!selectedDroneId) {
      return;
    }
    const marker = droneMarkersRef.current.get(selectedDroneId);
    if (marker) {
      safeNaverCall(() => marker.setZIndex(80));
    }
    return () => {
      if (marker) {
        safeNaverCall(() => marker.setZIndex(60));
      }
    };
  }, [selectedDroneId]);

  // 미니맵 클릭 등 외부 포커스 요청 → 지도 중심 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps || !focusRequest) {
      return;
    }
    const { latitude, longitude } = focusRequest.coordinate;
    if (!isUsableCoordinate(latitude, longitude)) {
      return;
    }
    safeNaverCall(() =>
      map.setCenter(new window.naver!.maps.LatLng(latitude, longitude)),
    );
  }, [focusRequest]);

  return (
    <div
      ref={containerRef}
      className="operation-naver-map"
      style={{ width: "100%", height: "100%" }}
      aria-label="작전지역 실지도"
    />
  );
}
