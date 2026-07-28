import { useEffect, useRef } from "react";
import type { Coordinate } from "../../../shared/types";
import { escapeHtml, isUsableCoordinate, safeNaverCall } from "../naver/naverMapUtils";
import type { DroneMarkerTone } from "./OperationNaverMap";

export type DroneFocusMapProps = {
  center: Coordinate;
  droneName: string;
  tone?: DroneMarkerTone;
  /** 드론 출발위치 — 경로 시작점으로 항상 표시한다(사라지면 안 됨). */
  departurePosition: Coordinate;
  /** 드론이 향하는 방향(도, 북=0/시계방향) — 이동 목표가 없을 때 회전 기준으로 대체 사용 */
  headingDegrees?: number | null;
  /** 드론이 지나온(또는 지나갈) 경로 — 지도 위에 선으로 표시 */
  path?: Coordinate[];
  /** 이동 목표 좌표 — 있으면 현재 위치에서 점선으로 이어 표시하고, 회전 기준(진행 방향)이 된다 */
  movementTarget?: Coordinate | null;
  /** 작전지역 중심/반경 — 있으면 경계 원을 함께 표시 */
  area?: { center: Coordinate; radiusMeters: number } | null;
  /** 교란 중 GPS 보고(왜곡) 위치 */
  gpsPosition?: Coordinate | null;
  /** 교란 중 AI 보정 위치 */
  correctedPosition?: Coordinate | null;
  width?: number;
  height?: number;
};

const METERS_PER_DEG_LAT = 111320;
// 출발위치·이동목표·작전지역까지 항상 시야에 들어오도록 주는 최소/배율 여백.
const FIT_MARGIN_RATIO = 1.4;
const FIT_MARGIN_MIN_METERS = 80;
// 지도를 회전시켜도(heading-up) 네 모서리가 비지 않도록 실제 표시 영역보다 크게 그린다.
const STAGE_BUFFER_PX = 60;

const TONE_COLORS: Record<DroneMarkerTone, string> = {
  normal: "#2563eb",
  jamming: "#f59e0b",
  spoofing: "#ef4444",
  crossview: "#8b5cf6",
  corrected: "#10b981",
};

/** 두 좌표 사이의 방위각(도, 북=0/시계방향) — 목표 방향으로 지도를 회전시킬 때 쓴다. */
function bearingDegrees(from: Coordinate, to: Coordinate): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// heading-up 회전 시 지도 콘텐츠(타일+오버레이)는 -heading만큼 돌아간다. 그 안의
// 라벨/화살표가 화면에서 계속 똑바로(진행방향=위) 보이도록 +heading으로 되돌린다.
// 위치 고정(translate)과 회전(rotate)을 같은 transform에 함께 쓰면 회전축이
// 엉뚱한 지점(요소 중심)이 되어 각도가 바뀔 때마다 마커가 실제 좌표에서 벗어나
// 보인다 — 바깥 div는 위치만(무회전), 안쪽 div는 그 자리(하단 중앙)를 축으로만
// 회전하도록 두 겹으로 분리해야 좌표가 항상 정확히 고정된다.
function counterRotate(html: string, headingDegrees: number, anchorTransform = "") {
  return (
    `<div style="transform:${anchorTransform};">` +
    `<div style="transform:rotate(${headingDegrees}deg);transform-origin:50% 100%;">${html}</div>` +
    `</div>`
  );
}

function buildDroneDotHtml(name: string, color: string, hasHeading: boolean) {
  const glyph = hasHeading
    ? `<svg width="22" height="22" viewBox="0 0 22 22" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.45));">` +
      `<polygon points="11,1 19,20 11,15 3,20" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
      `</svg>`
    : `<span style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>`;
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">`,
    `<span style="padding:1px 6px;border-radius:9px;background:${color};color:#fff;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35);">${escapeHtml(name)}</span>`,
    glyph,
    `</div>`,
  ].join("");
}

function buildBadgeHtml(label: string, color: string, glyph: string) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;">`,
    `<span style="padding:0 5px;border-radius:8px;background:${color};color:#fff;font-size:9px;font-weight:800;white-space:nowrap;">${escapeHtml(label)}</span>`,
    `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid ${color};color:${color};font-size:9px;font-weight:800;">${glyph}</span>`,
    `</div>`,
  ].join("");
}

/**
 * 드론 상세 팝업용 소형 실지도 — 선택 드론을 중심으로 출발위치·경로·이동 목표·
 * 작전지역 경계를 함께 보여준다. 항상 출발위치~현재 위치가 화면에 들어오도록
 * fitBounds로 줌을 계산하며(고정 줌 아님 — 멀리 이동해도 출발점이 화면 밖으로
 * 사라지지 않는다), 이동 목표 방향(없으면 드론 헤딩)을 "위"로 두는 heading-up
 * 회전을 지원한다. 네이버 지도 SDK가 타일 자체 회전을 지원하지 않으므로, 실제
 * 지도를 감싸는 레이어를 CSS로 회전시키고 오버레이(마커) 라벨은 반대로
 * 되돌려(counter-rotate) 항상 똑바로 보이게 한다.
 */
export function DroneFocusMap({
  center,
  droneName,
  tone = "normal",
  departurePosition,
  headingDegrees = null,
  path = [],
  movementTarget = null,
  area = null,
  gpsPosition = null,
  correctedPosition = null,
  width = 420,
  height = 420,
}: DroneFocusMapProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const droneMarkerRef = useRef<naver.maps.Marker | null>(null);
  const departureMarkerRef = useRef<naver.maps.Marker | null>(null);
  const gpsMarkerRef = useRef<naver.maps.Marker | null>(null);
  const correctedMarkerRef = useRef<naver.maps.Marker | null>(null);
  const pathLineRef = useRef<naver.maps.Polyline | null>(null);
  const targetLineRef = useRef<naver.maps.Polyline | null>(null);
  const areaCircleRef = useRef<naver.maps.Circle | null>(null);
  const areaLineRef = useRef<naver.maps.Polyline | null>(null);

  const stageSize = Math.ceil(Math.sqrt(width * width + height * height)) + STAGE_BUFFER_PX;

  // 회전 기준: 이동 목표가 있으면 그 방향, 없으면 드론 헤딩, 둘 다 없으면 회전하지 않는다(0=북쪽 위).
  const rotationHeadingDegrees = (() => {
    if (
      movementTarget &&
      isUsableCoordinate(movementTarget.latitude, movementTarget.longitude) &&
      isUsableCoordinate(center.latitude, center.longitude) &&
      (Math.abs(movementTarget.latitude - center.latitude) > 1e-9 ||
        Math.abs(movementTarget.longitude - center.longitude) > 1e-9)
    ) {
      return bearingDegrees(center, movementTarget);
    }
    if (headingDegrees !== null && Number.isFinite(headingDegrees)) {
      return headingDegrees;
    }
    return 0;
  })();

  // 지도 생성/파괴 (팝업 표시 동안만) — 오버사이즈 stage 안에 실제 맵을 심는다.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || !window.naver?.maps) {
      return undefined;
    }
    const start = isUsableCoordinate(center.latitude, center.longitude)
      ? center
      : { latitude: 37.5665, longitude: 126.978 };
    const map = safeNaverCall(
      () =>
        new window.naver!.maps.Map(container, {
          center: new window.naver!.maps.LatLng(start.latitude, start.longitude),
          zoom: 16,
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
    return () => {
      for (const marker of [
        droneMarkerRef.current,
        departureMarkerRef.current,
        gpsMarkerRef.current,
        correctedMarkerRef.current,
      ]) {
        safeNaverCall(() => marker?.setMap(null));
      }
      for (const line of [pathLineRef.current, targetLineRef.current, areaLineRef.current]) {
        safeNaverCall(() => line?.setMap(null));
      }
      safeNaverCall(() => areaCircleRef.current?.setMap(null));
      droneMarkerRef.current = null;
      departureMarkerRef.current = null;
      gpsMarkerRef.current = null;
      correctedMarkerRef.current = null;
      pathLineRef.current = null;
      targetLineRef.current = null;
      areaLineRef.current = null;
      areaCircleRef.current = null;
      safeNaverCall(() => map.destroy());
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // heading-up 회전: stage를 -heading만큼 돌리고, 오버사이즈로 잡아 모서리가 비지 않게 한다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    stage.style.transform = `rotate(${-rotationHeadingDegrees}deg)`;
  }, [rotationHeadingDegrees]);

  // 드론/출발위치 마커 + 경로/목표선 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    if (!isUsableCoordinate(center.latitude, center.longitude)) {
      return;
    }
    const droneLatLng = new maps.LatLng(center.latitude, center.longitude);
    safeNaverCall(() => map.setCenter(droneLatLng));

    const color = TONE_COLORS[tone];
    const hasHeading = movementTarget !== null || (headingDegrees !== null && Number.isFinite(headingDegrees));
    safeNaverCall(() => {
      const html = counterRotate(
        buildDroneDotHtml(droneName, color, hasHeading),
        rotationHeadingDegrees,
        "translate(-50%,-100%)",
      );
      if (droneMarkerRef.current) {
        droneMarkerRef.current.setPosition(droneLatLng);
        droneMarkerRef.current.setIcon({ content: html });
      } else {
        droneMarkerRef.current = new maps.Marker({
          position: droneLatLng,
          map,
          icon: { content: html },
          zIndex: 60,
          clickable: false,
        });
      }
    });

    // 출발위치 — 시나리오가 끝나거나 실시간 궤적이 비어도 항상 표시한다.
    if (isUsableCoordinate(departurePosition.latitude, departurePosition.longitude)) {
      const departureLatLng = new maps.LatLng(
        departurePosition.latitude,
        departurePosition.longitude,
      );
      const html = counterRotate(
        buildBadgeHtml("출발", "#64748b", "◎"),
        rotationHeadingDegrees,
        "translate(-50%,-100%)",
      );
      safeNaverCall(() => {
        if (departureMarkerRef.current) {
          departureMarkerRef.current.setPosition(departureLatLng);
          departureMarkerRef.current.setIcon({ content: html });
        } else {
          departureMarkerRef.current = new maps.Marker({
            position: departureLatLng,
            map,
            icon: { content: html },
            zIndex: 50,
            clickable: false,
          });
        }
      });
    }

    const syncBadge = (
      ref: { current: naver.maps.Marker | null },
      position: Coordinate | null,
      html: string,
      zIndex: number,
    ) => {
      if (!position || !isUsableCoordinate(position.latitude, position.longitude)) {
        safeNaverCall(() => ref.current?.setMap(null));
        ref.current = null;
        return;
      }
      const latLng = new maps.LatLng(position.latitude, position.longitude);
      const rotatedHtml = counterRotate(html, rotationHeadingDegrees, "translate(-50%,-100%)");
      safeNaverCall(() => {
        if (ref.current) {
          ref.current.setPosition(latLng);
          ref.current.setIcon({ content: rotatedHtml });
        } else {
          ref.current = new maps.Marker({
            position: latLng,
            map,
            icon: { content: rotatedHtml },
            zIndex,
            clickable: false,
          });
        }
      });
    };

    syncBadge(gpsMarkerRef, gpsPosition, buildBadgeHtml("GPS", "#ef4444", "⚠"), 55);
    syncBadge(correctedMarkerRef, correctedPosition, buildBadgeHtml("AI", "#2563eb", "✓"), 56);
  }, [
    center,
    droneName,
    tone,
    departurePosition,
    headingDegrees,
    movementTarget,
    gpsPosition,
    correctedPosition,
    rotationHeadingDegrees,
  ]);

  // 지나온(또는 지나갈) 경로 선 — 항상 실제 출발위치를 시작점으로 포함한다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    safeNaverCall(() => {
      const points = [departurePosition, ...path].filter((point) =>
        isUsableCoordinate(point.latitude, point.longitude),
      );
      if (points.length < 2) {
        pathLineRef.current?.setMap(null);
        pathLineRef.current = null;
        return;
      }
      const linePath = points.map((point) => new maps.LatLng(point.latitude, point.longitude));
      if (pathLineRef.current) {
        pathLineRef.current.setPath(linePath);
      } else {
        pathLineRef.current = new maps.Polyline({
          map,
          path: linePath,
          strokeColor: TONE_COLORS[tone],
          strokeOpacity: 0.85,
          strokeWeight: 3,
          clickable: false,
        });
      }
    });
  }, [departurePosition, path, tone]);

  // 이동 목표까지 실선 — 드론이 지금 향하고 있는 방향/거리를 뚜렷하게 보여준다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    safeNaverCall(() => {
      if (
        !movementTarget ||
        !isUsableCoordinate(movementTarget.latitude, movementTarget.longitude) ||
        !isUsableCoordinate(center.latitude, center.longitude)
      ) {
        targetLineRef.current?.setMap(null);
        targetLineRef.current = null;
        return;
      }
      const linePath = [
        new maps.LatLng(center.latitude, center.longitude),
        new maps.LatLng(movementTarget.latitude, movementTarget.longitude),
      ];
      if (targetLineRef.current) {
        targetLineRef.current.setPath(linePath);
      } else {
        targetLineRef.current = new maps.Polyline({
          map,
          path: linePath,
          strokeColor: TONE_COLORS[tone],
          strokeOpacity: 0.9,
          strokeWeight: 2.5,
          clickable: false,
        });
      }
    });
  }, [center, movementTarget, tone]);

  // 작전지역 중심↔드론 현재 위치까지 점선 — 드론이 움직일 때마다 매 위치 갱신마다
  // 함께 다시 그려져 항상 "지금" 거리를 따라간다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    safeNaverCall(() => {
      if (
        !area ||
        !isUsableCoordinate(area.center.latitude, area.center.longitude) ||
        !isUsableCoordinate(center.latitude, center.longitude)
      ) {
        areaLineRef.current?.setMap(null);
        areaLineRef.current = null;
        return;
      }
      const linePath = [
        new maps.LatLng(area.center.latitude, area.center.longitude),
        new maps.LatLng(center.latitude, center.longitude),
      ];
      if (areaLineRef.current) {
        areaLineRef.current.setPath(linePath);
      } else {
        areaLineRef.current = new maps.Polyline({
          map,
          path: linePath,
          strokeColor: "#dc2626",
          strokeOpacity: 0.65,
          strokeWeight: 1.5,
          strokeStyle: "shortdash",
          clickable: false,
        });
      }
    });
  }, [center, area]);

  // 작전지역 경계 원 — 드론이 구역을 벗어나는지 한눈에 보이게 참고용으로 표시
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    safeNaverCall(() => {
      if (!area || !isUsableCoordinate(area.center.latitude, area.center.longitude)) {
        areaCircleRef.current?.setMap(null);
        areaCircleRef.current = null;
        return;
      }
      const position = new maps.LatLng(area.center.latitude, area.center.longitude);
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
          fillOpacity: 0.05,
          clickable: false,
        });
      }
    });
  }, [area]);

  // 줌/센터: 출발위치·현재위치·이동목표·작전지역이 모두 화면에 들어오도록 fitBounds로
  // 계산한다(고정 줌이면 멀리 이동했을 때 출발위치가 화면 밖으로 사라진다).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const points = [departurePosition, center, movementTarget, area?.center]
      .filter((point): point is Coordinate => Boolean(point))
      .filter((point) => isUsableCoordinate(point.latitude, point.longitude));
    if (points.length === 0) {
      return;
    }
    safeNaverCall(() => {
      let south = points[0].latitude;
      let north = points[0].latitude;
      let west = points[0].longitude;
      let east = points[0].longitude;
      for (const point of points) {
        south = Math.min(south, point.latitude);
        north = Math.max(north, point.latitude);
        west = Math.min(west, point.longitude);
        east = Math.max(east, point.longitude);
      }
      if (area) {
        const latRad = (area.center.latitude * Math.PI) / 180;
        const metersPerLng = METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
        const dLat = area.radiusMeters / METERS_PER_DEG_LAT;
        const dLng = area.radiusMeters / metersPerLng;
        south = Math.min(south, area.center.latitude - dLat);
        north = Math.max(north, area.center.latitude + dLat);
        west = Math.min(west, area.center.longitude - dLng);
        east = Math.max(east, area.center.longitude + dLng);
      }
      const centerLat = (south + north) / 2;
      const latRad = (centerLat * Math.PI) / 180;
      const metersPerLng = METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
      const spanMeters = Math.max(
        (north - south) * METERS_PER_DEG_LAT,
        (east - west) * metersPerLng,
      );
      const marginMeters = Math.max(spanMeters * (FIT_MARGIN_RATIO - 1), FIT_MARGIN_MIN_METERS);
      const dLat = marginMeters / METERS_PER_DEG_LAT;
      const dLng = marginMeters / metersPerLng;
      const bounds = new maps.LatLngBounds(
        new maps.LatLng(south - dLat, west - dLng),
        new maps.LatLng(north + dLat, east + dLng),
      );
      map.fitBounds(bounds);
    });
  }, [departurePosition, center, movementTarget, area]);

  return (
    <div
      ref={outerRef}
      className="drone-focus-map"
      style={{ width, height, borderRadius: 8, overflow: "hidden", position: "relative" }}
      aria-label={`${droneName} 중심 지도`}
    >
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          left: (width - stageSize) / 2,
          top: (height - stageSize) / 2,
          width: stageSize,
          height: stageSize,
          transition: "transform 0.35s ease",
          transformOrigin: "50% 50%",
        }}
      >
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
