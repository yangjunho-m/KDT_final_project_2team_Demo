import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "../../../shared/types";
import {
  ModalShell,
  PrimaryButton,
  SecondaryButton,
} from "../../../shared/components";
import {
  isUsableCoordinate,
  MARKER_BADGE_STYLE,
  safeNaverCall,
} from "../naver/naverMapUtils";

export type MapPointPickerModalProps = {
  title: string;
  description?: string;
  /** 지도 초기 중심 (보통 작전지역 중심) */
  center: Coordinate;
  initial?: Coordinate | null;
  onConfirm: (coordinate: Coordinate) => void;
  onClose: () => void;
};

function buildPickedHtml() {
  return [
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%);">`,
    `<span style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);"></span>`,
    `<span style="${MARKER_BADGE_STYLE}background:#2563eb;">선택 좌표</span>`,
    `</div>`,
  ].join("");
}

/**
 * 지도 클릭으로 좌표를 고르는 공용 픽커.
 * 드론 출발 좌표 / 이동 좌표 입력에서 재사용한다. (SDK ready일 때만 열 것)
 */
export function MapPointPickerModal({
  title,
  description,
  center,
  initial = null,
  onConfirm,
  onClose,
}: MapPointPickerModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRef = useRef<naver.maps.Marker | null>(null);
  const [picked, setPicked] = useState<Coordinate | null>(initial);
  const pickedRef = useRef(picked);

  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.naver?.maps) {
      return undefined;
    }
    const start =
      pickedRef.current &&
      isUsableCoordinate(pickedRef.current.latitude, pickedRef.current.longitude)
        ? pickedRef.current
        : isUsableCoordinate(center.latitude, center.longitude)
          ? center
          : { latitude: 37.5665, longitude: 126.978 };
    const map = safeNaverCall(
      () =>
        new window.naver!.maps.Map(container, {
          center: new window.naver!.maps.LatLng(start.latitude, start.longitude),
          zoom: 15,
          mapDataControl: false,
        }),
    );
    if (!map) {
      return undefined;
    }
    mapRef.current = map;

    const placeMarker = (coordinate: Coordinate) => {
      safeNaverCall(() => {
        const latLng = new window.naver!.maps.LatLng(
          coordinate.latitude,
          coordinate.longitude,
        );
        if (markerRef.current) {
          markerRef.current.setPosition(latLng);
        } else {
          markerRef.current = new window.naver!.maps.Marker({
            position: latLng,
            map,
            icon: { content: buildPickedHtml() },
            zIndex: 60,
            clickable: false,
          });
        }
      });
    };
    if (pickedRef.current) {
      placeMarker(pickedRef.current);
    }

    const listener = safeNaverCall(() =>
      window.naver!.maps.Event.addListener(map, "click", (...args: unknown[]) => {
        const pointerEvent = args[0] as naver.maps.PointerEvent | undefined;
        const coord = pointerEvent?.coord;
        if (!coord) {
          return;
        }
        const point = safeNaverCall(() => ({
          latitude: coord.lat(),
          longitude: coord.lng(),
        }));
        if (point && isUsableCoordinate(point.latitude, point.longitude)) {
          setPicked(point);
          placeMarker(point);
        }
      }),
    );

    return () => {
      if (listener) {
        safeNaverCall(() => window.naver?.maps.Event.removeListener(listener));
      }
      safeNaverCall(() => markerRef.current?.setMap(null));
      markerRef.current = null;
      safeNaverCall(() => map.destroy());
      mapRef.current = null;
    };
    // 픽커 지도는 모달이 열릴 때 1회 생성한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModalShell
      title={title}
      description={description ?? "지도를 클릭해 좌표를 지정하세요."}
      wide
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>취소</SecondaryButton>
          <PrimaryButton
            disabled={!picked}
            onClick={() => {
              if (picked) {
                onConfirm(picked);
              }
            }}
          >
            이 좌표 사용
          </PrimaryButton>
        </>
      }
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: 420, borderRadius: 10, overflow: "hidden" }}
        aria-label="좌표 선택 지도"
      />
      <p style={{ marginTop: 10, fontSize: 13 }}>
        선택 좌표:{" "}
        {picked
          ? `${picked.latitude.toFixed(6)}, ${picked.longitude.toFixed(6)}`
          : "지도를 클릭하세요"}
      </p>
    </ModalShell>
  );
}
