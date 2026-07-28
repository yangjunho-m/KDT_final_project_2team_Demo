import { useEffect, useRef } from "react";
import { useNaverMapsSdk } from "../../operation-map/naver/naverMapsLoader";
import {
  isUsableCoordinate,
  safeNaverCall,
  MARKER_BADGE_STYLE,
} from "../../operation-map/naver/naverMapUtils";
import type {
  InterferenceEpisodeAnalysis,
  InterferenceRangeEstimate,
} from "../domain";
import "./report-components.css";

export type InterferenceRangeMapProps = {
  analysis: InterferenceEpisodeAnalysis;
};

const METERS_PER_DEG_LAT = 111320;
// 예측 원이 프레임 안에 여유 있게 들어오도록 주는 배율/최소 여백
const FIT_MARGIN_RATIO = 1.5;
const FIT_MARGIN_MIN_METERS = 120;

function buildPointHtml(label: string, color: string) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%);">`,
    `<span style="${MARKER_BADGE_STYLE}background:${color};">${label}</span>`,
    `<span style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);"></span>`,
    `</div>`,
  ].join("");
}

function fitToRange(
  map: naver.maps.Map,
  maps: typeof naver.maps,
  range: InterferenceRangeEstimate,
) {
  const marginMeters = Math.max(
    range.radiusMeters * (FIT_MARGIN_RATIO - 1),
    FIT_MARGIN_MIN_METERS,
  );
  const spanMeters = range.radiusMeters + marginMeters;
  const latRad = (range.center.latitude * Math.PI) / 180;
  const metersPerLng = METERS_PER_DEG_LAT * Math.cos(latRad) || METERS_PER_DEG_LAT;
  const dLat = spanMeters / METERS_PER_DEG_LAT;
  const dLng = spanMeters / metersPerLng;
  map.fitBounds(
    new maps.LatLngBounds(
      new maps.LatLng(range.center.latitude - dLat, range.center.longitude - dLng),
      new maps.LatLng(range.center.latitude + dLat, range.center.longitude + dLng),
    ),
  );
}

/**
 * 교란 범위 예측 시각화 — 추정 원(중심+반경)을 실지도 위에 그리고,
 * 에피소드 동안의 실제 비행 경로와 시작/종료 지점을 함께 표시한다.
 * 지도 SDK가 준비되지 않은 환경에서는 아무것도 그리지 않는다(수치는 패널에 항상 표시).
 */
export function InterferenceRangeMap({ analysis }: InterferenceRangeMapProps) {
  const sdkStatus = useNaverMapsSdk();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const range = analysis.rangeEstimate;

  useEffect(() => {
    const container = containerRef.current;
    if (
      sdkStatus !== "ready" ||
      !container ||
      !window.naver?.maps ||
      !range ||
      !isUsableCoordinate(range.center.latitude, range.center.longitude)
    ) {
      return undefined;
    }
    const { maps } = window.naver;
    const map = safeNaverCall(
      () =>
        new maps.Map(container, {
          center: new maps.LatLng(range.center.latitude, range.center.longitude),
          zoom: 14,
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
    const overlays: Array<{ setMap: (m: null) => void }> = [];

    safeNaverCall(() => {
      overlays.push(
        new maps.Circle({
          map,
          center: new maps.LatLng(range.center.latitude, range.center.longitude),
          radius: Math.max(range.radiusMeters, 10),
          strokeColor: "#ef4444",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          strokeStyle: "shortdash",
          fillColor: "#ef4444",
          fillOpacity: 0.12,
          clickable: false,
        }),
      );
      // 에피소드 동안의 실제 비행 경로
      const path = analysis.timeline
        .filter((p) => isUsableCoordinate(p.position.latitude, p.position.longitude))
        .map((p) => new maps.LatLng(p.position.latitude, p.position.longitude));
      if (path.length >= 2) {
        overlays.push(
          new maps.Polyline({
            map,
            path,
            strokeColor: "#2563eb",
            strokeOpacity: 0.9,
            strokeWeight: 3,
            clickable: false,
          }),
        );
      }
      overlays.push(
        new maps.Marker({
          map,
          position: new maps.LatLng(
            analysis.startPosition.latitude,
            analysis.startPosition.longitude,
          ),
          icon: { content: buildPointHtml("시작", "#f59e0b") },
          clickable: false,
        }),
        new maps.Marker({
          map,
          position: new maps.LatLng(
            analysis.endPosition.latitude,
            analysis.endPosition.longitude,
          ),
          icon: { content: buildPointHtml("종료", "#10b981") },
          clickable: false,
        }),
      );
      fitToRange(map, maps, range);
    });

    return () => {
      for (const overlay of overlays) {
        safeNaverCall(() => overlay.setMap(null));
      }
      safeNaverCall(() => map.destroy());
    };
  }, [sdkStatus, analysis, range]);

  if (!range) {
    return null;
  }
  if (sdkStatus !== "ready") {
    return (
      <p className="report-analysis__hint">
        지도 SDK를 사용할 수 없어 범위 시각화를 표시하지 못했습니다.
      </p>
    );
  }
  return (
    <div className="report-range-map">
      <div ref={containerRef} className="report-range-map__canvas" />
      <p className="report-scatter__caption">
        빨간 점선 원: 예측 교란 범위 · 파란 선: 에피소드 동안의 실제 비행 경로
      </p>
    </div>
  );
}
