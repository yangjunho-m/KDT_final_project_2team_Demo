import { useEffect, useRef } from "react";
import type { Coordinate } from "../../../shared/types";
import {
  escapeHtml,
  isUsableCoordinate,
  MARKER_BADGE_STYLE,
  safeNaverCall,
} from "../../operation-map/naver/naverMapUtils";
import type { ScenarioZoneMapProps, ScenarioZoneTone } from "./ScenarioZoneMap";
import { SCENARIO_ZONE_HINTS } from "./scenarioZoneHints";
import "./scenario-components.css";

const DEFAULT_ZOOM = 14;

const TONE_COLORS: Record<ScenarioZoneTone, string> = {
  jamming: "#f59e0b",
  spoofing: "#ef4444",
  neutral: "#64748b",
};

function buildAreaCenterHtml(name: string) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-50%);">`,
    `<span style="width:24px;height:24px;border:2.5px solid #dc2626;border-radius:50%;position:relative;background:rgba(220,38,38,.12);">`,
    `<span style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#dc2626;"></span>`,
    `</span>`,
    `<span style="${MARKER_BADGE_STYLE}background:#dc2626;">${escapeHtml(name)}</span>`,
    `</div>`,
  ].join("");
}

function buildZoneCenterHtml(zoneLabel: string, radiusMeters: number, color: string) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%);">`,
    `<span style="width:12px;height:12px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>`,
    `<span style="${MARKER_BADGE_STYLE}background:${color};">${escapeHtml(zoneLabel)} · ${Math.round(radiusMeters)}m</span>`,
    `</div>`,
  ].join("");
}

function buildSpoofHtml() {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%);">`,
    `<span style="width:12px;height:12px;border-radius:50%;border:2.5px dashed #ef4444;background:rgba(239,68,68,.25);"></span>`,
    `<span style="${MARKER_BADGE_STYLE}background:#ef4444;">허위 좌표</span>`,
    `</div>`,
  ].join("");
}

function buildDroneHtml(name: string) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%);">`,
    `<span style="${MARKER_BADGE_STYLE}background:#2563eb;">${escapeHtml(name)}</span>`,
    `<span style="width:12px;height:12px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>`,
    `</div>`,
  ].join("");
}

function buildTargetHtml(name: string) {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%);">`,
    `<span style="${MARKER_BADGE_STYLE}background:#b91c1c;">${escapeHtml(name)}</span>`,
    `<span style="width:12px;height:12px;background:#b91c1c;border:2px solid #fff;transform:rotate(45deg);box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>`,
    `</div>`,
  ].join("");
}

/**
 * NAVER Maps 기반 교란 구역 설정 지도.
 * ScenarioZoneMap(시뮬레이션 캔버스)과 동일한 props를 받아 그대로 대체하며,
 * SDK 미준비/실패 시 상위에서 기존 컴포넌트로 fallback한다.
 * 지도 클릭 → 실좌표를 onPointSet으로 전달 (편집 모드 라우팅은 상위 책임).
 */
export function ScenarioNaverZoneMap({
  area,
  drones = [],
  targets = [],
  zone = null,
  tone = "neutral",
  zoneLabel = "교란 구역",
  zoneCaption = null,
  editMode = null,
  allowSpoofMode = false,
  spoofedPosition = null,
  disabled = false,
  onEditModeChange,
  onPointSet,
  onTargetRemove,
  onReset,
}: ScenarioZoneMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const areaMarkerRef = useRef<naver.maps.Marker | null>(null);
  const zoneCircleRef = useRef<naver.maps.Circle | null>(null);
  const zoneMarkerRef = useRef<naver.maps.Marker | null>(null);
  const spoofMarkerRef = useRef<naver.maps.Marker | null>(null);
  const linkLineRef = useRef<naver.maps.Polyline | null>(null);
  const droneMarkersRef = useRef(new Map<string, naver.maps.Marker>());
  const targetMarkersRef = useRef(new Map<string, naver.maps.Marker>());
  const targetListenersRef = useRef(new Map<string, unknown>());
  const disabledRef = useRef(disabled);
  const editModeRef = useRef(editMode);
  const onPointSetRef = useRef(onPointSet);
  const onTargetRemoveRef = useRef(onTargetRemove);

  useEffect(() => {
    disabledRef.current = disabled;
    editModeRef.current = editMode;
    onPointSetRef.current = onPointSet;
    onTargetRemoveRef.current = onTargetRemove;
  }, [disabled, editMode, onPointSet, onTargetRemove]);

  // 지도 생성/파괴 + 클릭 리스너 (mount 1회)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.naver?.maps) {
      return undefined;
    }
    const droneMarkers = droneMarkersRef.current;
    const center = isUsableCoordinate(area.latitude, area.longitude)
      ? { latitude: area.latitude, longitude: area.longitude }
      : { latitude: 37.5665, longitude: 126.978 };
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
    const clickListener = safeNaverCall(() =>
      window.naver!.maps.Event.addListener(
        map,
        "click",
        (...args: unknown[]) => {
          if (disabledRef.current) {
            return;
          }
          const pointerEvent = args[0] as naver.maps.PointerEvent | undefined;
          const coord = pointerEvent?.coord;
          if (!coord) {
            return;
          }
          const point: Coordinate = safeNaverCall(() => ({
            latitude: coord.lat(),
            longitude: coord.lng(),
          })) ?? { latitude: NaN, longitude: NaN };
          if (isUsableCoordinate(point.latitude, point.longitude)) {
            onPointSetRef.current(point);
          }
        },
      ),
    );

    const targetMarkers = targetMarkersRef.current;
    const targetListeners = targetListenersRef.current;
    return () => {
      if (clickListener) {
        safeNaverCall(() =>
          window.naver?.maps.Event.removeListener(clickListener),
        );
      }
      for (const listener of targetListeners.values()) {
        safeNaverCall(() => window.naver?.maps.Event.removeListener(listener));
      }
      targetListeners.clear();
      for (const overlay of [
        areaMarkerRef.current,
        zoneCircleRef.current,
        zoneMarkerRef.current,
        spoofMarkerRef.current,
        linkLineRef.current,
        ...droneMarkers.values(),
        ...targetMarkers.values(),
      ]) {
        safeNaverCall(() => overlay?.setMap(null));
      }
      droneMarkers.clear();
      targetMarkers.clear();
      areaMarkerRef.current = null;
      zoneCircleRef.current = null;
      zoneMarkerRef.current = null;
      spoofMarkerRef.current = null;
      linkLineRef.current = null;
      safeNaverCall(() => map.destroy());
      mapRef.current = null;
    };
    // 지도 인스턴스는 1회 생성; area 이동은 아래 effect가 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 작전지역 중심 마커 + 지도 center
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
      map.setCenter(position);
      if (areaMarkerRef.current) {
        areaMarkerRef.current.setPosition(position);
        areaMarkerRef.current.setIcon({ content: buildAreaCenterHtml(area.name) });
      } else {
        areaMarkerRef.current = new maps.Marker({
          position,
          map,
          icon: { content: buildAreaCenterHtml(area.name) },
          zIndex: 40,
          clickable: false,
        });
      }
    });
  }, [area]);

  // 교란 구역 원 + 중심 마커
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const color = TONE_COLORS[tone];
    const usable =
      zone !== null &&
      isUsableCoordinate(zone.center.latitude, zone.center.longitude);

    safeNaverCall(() => {
      if (!usable) {
        zoneCircleRef.current?.setMap(null);
        zoneCircleRef.current = null;
        zoneMarkerRef.current?.setMap(null);
        zoneMarkerRef.current = null;
        return;
      }
      const center = new maps.LatLng(
        zone!.center.latitude,
        zone!.center.longitude,
      );
      if (zoneCircleRef.current) {
        zoneCircleRef.current.setOptions({
          center,
          radius: zone!.radiusMeters,
          strokeColor: color,
          fillColor: color,
        });
      } else {
        zoneCircleRef.current = new maps.Circle({
          map,
          center,
          radius: zone!.radiusMeters,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.14,
          clickable: false,
        });
      }
      const iconContent = buildZoneCenterHtml(zoneLabel, zone!.radiusMeters, color);
      if (zoneMarkerRef.current) {
        zoneMarkerRef.current.setPosition(center);
        zoneMarkerRef.current.setIcon({ content: iconContent });
      } else {
        zoneMarkerRef.current = new maps.Marker({
          position: center,
          map,
          icon: { content: iconContent },
          zIndex: 55,
          clickable: false,
        });
      }
    });
  }, [zone, tone, zoneLabel]);

  // 허위 좌표 마커 + 구역 중심과의 관계선
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const usableSpoof =
      spoofedPosition !== null &&
      isUsableCoordinate(spoofedPosition.latitude, spoofedPosition.longitude);

    safeNaverCall(() => {
      if (!usableSpoof) {
        spoofMarkerRef.current?.setMap(null);
        spoofMarkerRef.current = null;
        linkLineRef.current?.setMap(null);
        linkLineRef.current = null;
        return;
      }
      const spoofLatLng = new maps.LatLng(
        spoofedPosition!.latitude,
        spoofedPosition!.longitude,
      );
      if (spoofMarkerRef.current) {
        spoofMarkerRef.current.setPosition(spoofLatLng);
      } else {
        spoofMarkerRef.current = new maps.Marker({
          position: spoofLatLng,
          map,
          icon: { content: buildSpoofHtml() },
          zIndex: 55,
          clickable: false,
        });
      }

      const usableZone =
        zone !== null &&
        isUsableCoordinate(zone.center.latitude, zone.center.longitude);
      if (!usableZone) {
        linkLineRef.current?.setMap(null);
        linkLineRef.current = null;
        return;
      }
      const path = [
        new maps.LatLng(zone!.center.latitude, zone!.center.longitude),
        spoofLatLng,
      ];
      if (linkLineRef.current) {
        linkLineRef.current.setPath(path);
      } else {
        linkLineRef.current = new maps.Polyline({
          map,
          path,
          strokeColor: "#94a3b8",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          strokeStyle: "shortdash",
          clickable: false,
        });
      }
    });
  }, [spoofedPosition, zone]);

  // 배치된 표적 마커 (TARGET 모드에서 클릭 시 제거)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const markers = targetMarkersRef.current;
    const listeners = targetListenersRef.current;
    const aliveIds = new Set<string>();

    for (const target of targets) {
      const { latitude, longitude } = target.position;
      if (!isUsableCoordinate(latitude, longitude)) {
        continue;
      }
      aliveIds.add(target.id);
      const position = new maps.LatLng(latitude, longitude);
      const existing = markers.get(target.id);
      if (existing) {
        safeNaverCall(() => existing.setPosition(position));
        continue;
      }
      safeNaverCall(() => {
        const marker = new maps.Marker({
          position,
          map,
          icon: { content: buildTargetHtml(target.name) },
          zIndex: 52,
        });
        const listener = maps.Event.addListener(marker, "click", () => {
          if (!disabledRef.current && editModeRef.current === "TARGET") {
            onTargetRemoveRef.current?.(target.id);
          }
        });
        markers.set(target.id, marker);
        listeners.set(target.id, listener);
      });
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
  }, [targets]);

  // 배정 드론 마커 (읽기 전용)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }
    const { maps } = window.naver;
    const markers = droneMarkersRef.current;
    const aliveIds = new Set<string>();

    for (const drone of drones) {
      const { latitude, longitude } = drone.currentPosition;
      if (!isUsableCoordinate(latitude, longitude)) {
        continue;
      }
      aliveIds.add(drone.id);
      const position = new maps.LatLng(latitude, longitude);
      const existing = markers.get(drone.id);
      if (existing) {
        safeNaverCall(() => existing.setPosition(position));
        continue;
      }
      safeNaverCall(() => {
        markers.set(
          drone.id,
          new maps.Marker({
            position,
            map,
            icon: { content: buildDroneHtml(drone.name) },
            zIndex: 50,
            clickable: false,
          }),
        );
      });
    }

    for (const [droneId, marker] of Array.from(markers.entries())) {
      if (!aliveIds.has(droneId)) {
        safeNaverCall(() => marker.setMap(null));
        markers.delete(droneId);
      }
    }
  }, [drones]);

  const hintText = SCENARIO_ZONE_HINTS[editMode ?? "ZONE"];

  return (
    <div className="scenario-zone">
      <div
        className={`scenario-zone__stage scenario-zone__stage--${tone}${
          disabled ? " is-disabled" : ""
        }`}
        role="application"
        aria-label="교란 구역 설정 지도"
      >
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0 }}
          aria-hidden="true"
        />

        <div className="scenario-zone__hints" style={{ zIndex: 120, pointerEvents: "none" }}>
          <span className="scenario-zone__hint-top">{hintText}</span>
          {zoneCaption ? (
            <span className="scenario-zone__caption">{zoneCaption}</span>
          ) : null}
        </div>

        {editMode ? (
          <div
            className="scenario-zone__modes"
            role="group"
            aria-label="지도 편집 모드"
            style={{ zIndex: 120 }}
          >
            <button
              type="button"
              className={`scenario-zone__mode${editMode === "ZONE" ? " is-active" : ""}`}
              disabled={disabled}
              onClick={() => onEditModeChange?.("ZONE")}
            >
              교란 구역 지정
            </button>
            {allowSpoofMode ? (
              <button
                type="button"
                className={`scenario-zone__mode${editMode === "SPOOF" ? " is-active" : ""}`}
                disabled={disabled}
                onClick={() => onEditModeChange?.("SPOOF")}
              >
                허위 좌표 지정
              </button>
            ) : null}
            <button
              type="button"
              className={`scenario-zone__mode${editMode === "TARGET" ? " is-active" : ""}`}
              disabled={disabled}
              onClick={() => onEditModeChange?.("TARGET")}
            >
              표적 배치
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="scenario-zone__reset"
          aria-label="교란 구역 초기화"
          style={{ zIndex: 120 }}
          onClick={onReset}
          disabled={disabled || !zone}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 7h14M10 7V5h4v2M6 7l1 12h10l1-12"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="scenario-zone__footer">
        <span>
          {zone
            ? `구역 중심 ${zone.center.latitude.toFixed(5)}, ${zone.center.longitude.toFixed(5)}`
            : `작전지역 중심 ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`}
          {spoofedPosition
            ? ` · 허위 ${spoofedPosition.latitude.toFixed(5)}, ${spoofedPosition.longitude.toFixed(5)}`
            : ""}
        </span>
        <span className="scenario-zone__note">네이버 지도 · 클릭으로 좌표 지정</span>
      </div>
    </div>
  );
}
