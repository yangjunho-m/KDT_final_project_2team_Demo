import { useEffect, useMemo, useRef } from "react";
import type { Coordinate, Drone, EnemyArea, Target } from "../../../shared/types";
import { isUsableCoordinate, safeNaverCall } from "../naver/naverMapUtils";
import type { DroneMarkerTone, OperationNaverMapZone } from "./OperationNaverMap";

export type OperationNaverMiniMapProps = {
  area: EnemyArea;
  drones: Drone[];
  targets?: Target[];
  interferenceZone?: OperationNaverMapZone | null;
  droneTones?: Record<string, DroneMarkerTone>;
  /** 메인 지도가 현재 보여주는 영역(SW/NE) — 미니맵 위에 사각형으로 표시 */
  viewportBounds?: { sw: Coordinate; ne: Coordinate } | null;
  /** 미니맵 클릭 → 메인 지도 해당 좌표로 이동 */
  onFocus?: (coordinate: Coordinate) => void;
};

// 작전지역 데이터가 아직 없을 때(마운트 직후)만 쓰는 초기 줌 — 이후엔 fitBounds가 대체한다.
const MINI_ZOOM_FALLBACK = 15;
const METERS_PER_DEG_LAT = 111320;
// 작전지역 반경 원이 미니맵 안에 여유 있게 들어오도록 주는 배율/최소 여백.
const FIT_MARGIN_RATIO = 1.6;
const FIT_MARGIN_MIN_METERS = 150;
// 뷰포트 표시 사각형: "현재 보는 위치"만 알려주는 항상 고정 크기 사각형.
// 고정 '미터' 반경으로 그리면 미니맵 줌(작전지역 반경에 따라 fitBounds로 결정)에 따라
// 화면상 크기가 지역마다 달라진다 — 반경 수 km 지역에선 몇 px로 줄어 안 보인다.
// 그래서 화면 '픽셀' 기준 고정 크기로 잡고, 그릴 때마다 현재 줌으로 미터를 역산한다.
const VIEWPORT_INDICATOR_HALF_PX = 16;
// Web Mercator 줌 0의 적도 해상도(m/px) — 픽셀↔미터 환산에 쓴다.
const WEB_MERCATOR_BASE_RESOLUTION = 156543.03392;
// 드론 출발위치를 fitBounds에 포함하되, 작전지역에서 비정상적으로 멀리 떨어진(오입력 등)
// 좌표까지 포함하면 미니맵이 수백 km 밖까지 줌아웃되어 쓸모없어진다 — 상한을 둔다.
const MAX_DRONE_FIT_DISTANCE_METERS = 50000;

const DOT_COLORS: Record<DroneMarkerTone, string> = {
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

function buildDotHtml(color: string) {
  return (
    `<span style="display:block;width:10px;height:10px;border-radius:50%;` +
    `background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);` +
    `transform:translate(-50%,-50%);"></span>`
  );
}

function buildTargetDotHtml() {
  return (
    `<span style="display:block;width:9px;height:9px;background:#b91c1c;` +
    `border:1.5px solid #fff;transform:translate(-50%,-50%) rotate(45deg);"></span>`
  );
}

/**
 * 게임식 미니맵 — 실지도 축소판. 드래그/휠 없이 고정 뷰로 전체 상황을 요약하고,
 * 클릭하면 메인 지도가 해당 좌표로 이동한다.
 */
export function OperationNaverMiniMap({
  area,
  drones,
  targets = [],
  interferenceZone = null,
  droneTones = {},
  viewportBounds = null,
  onFocus,
}: OperationNaverMiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const areaCircleRef = useRef<naver.maps.Circle | null>(null);
  const zoneCircleRef = useRef<naver.maps.Circle | null>(null);
  const viewportRectRef = useRef<naver.maps.Polyline | null>(null);
  const droneDotsRef = useRef(new Map<string, naver.maps.Marker>());
  const targetDotsRef = useRef(new Map<string, naver.maps.Marker>());
  const onFocusRef = useRef(onFocus);
  // 드래그 중에는 실제 메인 지도 뷰포트(prop) 대신 커서를 따라가는 임시 중심을 그린다.
  const isDraggingRectRef = useRef(false);
  const dragCenterRef = useRef<Coordinate | null>(null);

  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

  // 뷰포트 사각형을 주어진 중심 좌표로 그리거나 옮긴다 (화면 픽셀 기준 고정 크기 정사각형).
  const drawViewportRectAt = (centerLat: number, centerLng: number) => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const latRad = (centerLat * Math.PI) / 180;
    const metersPerLng =
      METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
    // 현재 미니맵 줌에서 1px가 몇 m인지 역산해, 화면상 항상 같은 크기가 되게 한다.
    const zoom = safeNaverCall(() => map.getZoom()) ?? MINI_ZOOM_FALLBACK;
    const metersPerPixel =
      (WEB_MERCATOR_BASE_RESOLUTION * Math.cos(latRad)) / 2 ** zoom;
    const halfMeters = VIEWPORT_INDICATOR_HALF_PX * metersPerPixel;
    const dLat = halfMeters / METERS_PER_DEG_LAT;
    const dLng = halfMeters / metersPerLng;
    const path = [
      new maps.LatLng(centerLat - dLat, centerLng - dLng),
      new maps.LatLng(centerLat - dLat, centerLng + dLng),
      new maps.LatLng(centerLat + dLat, centerLng + dLng),
      new maps.LatLng(centerLat + dLat, centerLng - dLng),
      new maps.LatLng(centerLat - dLat, centerLng - dLng),
    ];
    safeNaverCall(() => {
      if (viewportRectRef.current) {
        viewportRectRef.current.setPath(path);
      } else {
        viewportRectRef.current = new maps.Polyline({
          map,
          path,
          strokeColor: "#2563eb",
          strokeOpacity: 0.95,
          strokeWeight: 2,
          clickable: false,
        });
      }
    });
  };

  // 지도 생성/파괴 — 뷰포트 사각형을 클릭 후 드래그로 옮길 수 있다(mousedown~mouseup).
  // 드래그 없이 짧게 누르고 떼면(클릭) 그 지점으로 바로 이동한다.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.naver?.maps) {
      return undefined;
    }
    const droneDots = droneDotsRef.current;
    const targetDots = targetDotsRef.current;
    const center = isUsableCoordinate(area.latitude, area.longitude)
      ? area
      : { latitude: 37.5665, longitude: 126.978 };
    const map = safeNaverCall(
      () =>
        new window.naver!.maps.Map(container, {
          center: new window.naver!.maps.LatLng(center.latitude, center.longitude),
          zoom: MINI_ZOOM_FALLBACK,
          mapDataControl: false,
          draggable: false,
          scrollWheel: false,
          pinchZoom: false,
          keyboardShortcuts: false,
          disableDoubleClickZoom: true,
        }),
    );
    if (!map) {
      return undefined;
    }
    mapRef.current = map;

    const extractPoint = (args: unknown[]): Coordinate | null => {
      const pointerEvent = args[0] as naver.maps.PointerEvent | undefined;
      const coord = pointerEvent?.coord;
      if (!coord) {
        return null;
      }
      const point = safeNaverCall(() => ({
        latitude: coord.lat(),
        longitude: coord.lng(),
      }));
      return point && isUsableCoordinate(point.latitude, point.longitude) ? point : null;
    };

    const mouseDownListener = safeNaverCall(() =>
      window.naver!.maps.Event.addListener(map, "mousedown", (...args: unknown[]) => {
        const point = extractPoint(args);
        if (!point) {
          return;
        }
        isDraggingRectRef.current = true;
        dragCenterRef.current = point;
        drawViewportRectAt(point.latitude, point.longitude);
      }),
    );
    const mouseMoveListener = safeNaverCall(() =>
      window.naver!.maps.Event.addListener(map, "mousemove", (...args: unknown[]) => {
        if (!isDraggingRectRef.current) {
          return;
        }
        const point = extractPoint(args);
        if (!point) {
          return;
        }
        dragCenterRef.current = point;
        drawViewportRectAt(point.latitude, point.longitude);
      }),
    );
    const mouseUpListener = safeNaverCall(() =>
      window.naver!.maps.Event.addListener(map, "mouseup", (...args: unknown[]) => {
        if (!isDraggingRectRef.current) {
          return;
        }
        isDraggingRectRef.current = false;
        const point = extractPoint(args) ?? dragCenterRef.current;
        dragCenterRef.current = null;
        if (point) {
          onFocusRef.current?.(point);
        }
      }),
    );
    // 안전망: 커서가 미니맵 밖으로 나간 채 버튼을 놓으면 지도 자체의 mouseup은
    // 발생하지 않는다 — window 레벨에서 드래그 상태를 강제로 정리해 "멈춘 드래그"를 막는다.
    const handleWindowMouseUp = () => {
      if (!isDraggingRectRef.current) {
        return;
      }
      isDraggingRectRef.current = false;
      const point = dragCenterRef.current;
      dragCenterRef.current = null;
      if (point) {
        onFocusRef.current?.(point);
      }
    };
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      for (const listener of [mouseDownListener, mouseMoveListener, mouseUpListener]) {
        if (listener) {
          safeNaverCall(() => window.naver?.maps.Event.removeListener(listener));
        }
      }
      for (const overlay of [
        areaCircleRef.current,
        zoneCircleRef.current,
        viewportRectRef.current,
        ...droneDots.values(),
        ...targetDots.values(),
      ]) {
        safeNaverCall(() => overlay?.setMap(null));
      }
      droneDots.clear();
      targetDots.clear();
      areaCircleRef.current = null;
      zoneCircleRef.current = null;
      viewportRectRef.current = null;
      safeNaverCall(() => map.destroy());
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 메인 지도 뷰포트를 사각형 외곽선으로 표시 ("비치고 있는 공간") — 드래그 중에는
  // 커서를 따라가는 임시 위치가 우선이므로 prop 기반 갱신을 건너뛴다.
  useEffect(() => {
    if (isDraggingRectRef.current) {
      return;
    }
    if (
      !viewportBounds ||
      !isUsableCoordinate(viewportBounds.sw.latitude, viewportBounds.sw.longitude) ||
      !isUsableCoordinate(viewportBounds.ne.latitude, viewportBounds.ne.longitude)
    ) {
      safeNaverCall(() => viewportRectRef.current?.setMap(null));
      viewportRectRef.current = null;
      return;
    }
    const { sw, ne } = viewportBounds;
    // 실제 뷰포트 bounds를 그대로 쓰면 메인 지도를 줌인/줌아웃할 때마다 사각형
    // 크기가 계속 바뀌어 산만하다. 중심만 취하고, 크기는 항상 고정 반경으로 그린다.
    drawViewportRectAt((sw.latitude + ne.latitude) / 2, (sw.longitude + ne.longitude) / 2);
  }, [viewportBounds]);

  // 드론 출발위치는 "출발 후 어디로 갈 수 있는지"의 기준점이라 fitBounds 범위에도
  // 포함한다. 다만 드론이 움직일 때마다(currentPosition) 매번 재계산하면 화면이
  // 계속 흔들리므로, 위치가 아니라 "출발위치·드론 목록"만 안정적인 키로 구독한다.
  const droneDepartureSignature = useMemo(
    () =>
      drones
        .map(
          (drone) =>
            `${drone.id}:${drone.departurePosition.latitude.toFixed(6)},${drone.departurePosition.longitude.toFixed(6)}`,
        )
        .sort()
        .join("|"),
    [drones],
  );

  // 작전지역 반경 + 드론 출발위치를 모두 포함하도록 fitBounds로 "적합한" 줌을 계산한다.
  // (반경이 100m인 지역과 700m인 지역에 같은 고정 줌을 쓰면 한쪽은 너무 좁고 한쪽은 너무 넓어 보인다.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    if (!isUsableCoordinate(area.latitude, area.longitude)) {
      return;
    }
    const position = new maps.LatLng(area.latitude, area.longitude);
    safeNaverCall(() => {
      if (areaCircleRef.current) {
        areaCircleRef.current.setCenter(position);
        areaCircleRef.current.setRadius(Math.max(area.radiusMeters, 1));
      } else {
        areaCircleRef.current = new maps.Circle({
          map,
          center: position,
          radius: Math.max(area.radiusMeters, 1),
          strokeColor: "#dc2626",
          strokeOpacity: 0.7,
          strokeWeight: 1.5,
          strokeStyle: "shortdash",
          fillColor: "#dc2626",
          fillOpacity: 0.06,
          clickable: false,
        });
      }
    });
    safeNaverCall(() => {
      const marginMeters = Math.max(
        area.radiusMeters * FIT_MARGIN_RATIO,
        FIT_MARGIN_MIN_METERS,
      );
      const latRad = (area.latitude * Math.PI) / 180;
      const metersPerLng =
        METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
      const dLat = marginMeters / METERS_PER_DEG_LAT;
      const dLng = marginMeters / metersPerLng;
      let south = area.latitude - dLat;
      let north = area.latitude + dLat;
      let west = area.longitude - dLng;
      let east = area.longitude + dLng;
      for (const drone of drones) {
        const { latitude, longitude } = drone.departurePosition;
        if (!isUsableCoordinate(latitude, longitude)) {
          continue;
        }
        // 오입력 등으로 작전지역과 동떨어진 출발위치는 제외한다 — 안 그러면 그 한
        // 지점 때문에 미니맵 전체가 수백 km 밖까지 줌아웃되어 쓸모없어진다.
        const droneNorth = (latitude - area.latitude) * METERS_PER_DEG_LAT;
        const droneEast = (longitude - area.longitude) * metersPerLng;
        const distanceMeters = Math.sqrt(droneNorth * droneNorth + droneEast * droneEast);
        if (distanceMeters > MAX_DRONE_FIT_DISTANCE_METERS) {
          continue;
        }
        south = Math.min(south, latitude);
        north = Math.max(north, latitude);
        west = Math.min(west, longitude);
        east = Math.max(east, longitude);
      }
      const bounds = new maps.LatLngBounds(
        new maps.LatLng(south, west),
        new maps.LatLng(north, east),
      );
      map.fitBounds(bounds);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, droneDepartureSignature]);

  // 교란 구역
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    safeNaverCall(() => {
      if (
        !interferenceZone ||
        !isUsableCoordinate(
          interferenceZone.center.latitude,
          interferenceZone.center.longitude,
        )
      ) {
        zoneCircleRef.current?.setMap(null);
        zoneCircleRef.current = null;
        return;
      }
      const color = ZONE_COLORS[interferenceZone.tone];
      const center = new maps.LatLng(
        interferenceZone.center.latitude,
        interferenceZone.center.longitude,
      );
      if (zoneCircleRef.current) {
        zoneCircleRef.current.setOptions({
          center,
          radius: interferenceZone.radiusMeters,
          strokeColor: color,
          fillColor: color,
        });
      } else {
        zoneCircleRef.current = new maps.Circle({
          map,
          center,
          radius: interferenceZone.radiusMeters,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 1.5,
          fillColor: color,
          fillOpacity: 0.15,
          clickable: false,
        });
      }
    });
  }, [interferenceZone]);

  // 드론/표적 점 마커
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;

    const syncDots = <TItem extends { id: string }>(
      items: TItem[],
      dots: Map<string, naver.maps.Marker>,
      getPosition: (item: TItem) => Coordinate,
      getHtml: (item: TItem) => string,
    ) => {
      const alive = new Set<string>();
      for (const item of items) {
        const { latitude, longitude } = getPosition(item);
        if (!isUsableCoordinate(latitude, longitude)) {
          continue;
        }
        alive.add(item.id);
        const position = new maps.LatLng(latitude, longitude);
        const existing = dots.get(item.id);
        if (existing) {
          safeNaverCall(() => {
            existing.setPosition(position);
            existing.setIcon({ content: getHtml(item) });
          });
        } else {
          safeNaverCall(() => {
            dots.set(
              item.id,
              new maps.Marker({
                position,
                map,
                icon: { content: getHtml(item) },
                clickable: false,
              }),
            );
          });
        }
      }
      for (const [id, marker] of Array.from(dots.entries())) {
        if (!alive.has(id)) {
          safeNaverCall(() => marker.setMap(null));
          dots.delete(id);
        }
      }
    };

    syncDots(
      drones,
      droneDotsRef.current,
      (drone) => drone.currentPosition,
      (drone) => buildDotHtml(DOT_COLORS[droneTones[drone.id] ?? "normal"]),
    );
    syncDots(
      targets,
      targetDotsRef.current,
      (target) => target.position,
      () => buildTargetDotHtml(),
    );
  }, [drones, targets, droneTones]);

  return (
    <div
      ref={containerRef}
      className="operation-naver-minimap"
      style={{ width: "100%", height: 300, borderRadius: 10, overflow: "hidden", cursor: "grab" }}
      aria-label="미니맵 (클릭 또는 사각형을 드래그하면 메인 지도가 그 위치로 이동)"
    />
  );
}
