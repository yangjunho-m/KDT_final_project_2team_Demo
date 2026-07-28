import type { StatusTone } from "../../../shared/components";
import type { DroneMarkerTone } from "../../operation-map/components";

export type DroneRuntimeToneView = {
  label: string;
  tone: StatusTone;
  /** 카드 경고 배너 등 짧은 상황 설명이 필요한 곳에서만 쓰는 선택 필드 */
  detail?: string;
};

/**
 * 드론 교란/보정 상태(tone) → 표시용 라벨·배지 톤·상세 설명.
 * 드론 상세 팝업의 교란 상태 배지, 드론 카드의 강조 색상·경고 배너가 함께 쓴다.
 */
export const droneRuntimeToneViews: Record<DroneMarkerTone, DroneRuntimeToneView> = {
  normal: { label: "교란 없음", tone: "success" },
  jamming: {
    label: "재밍 감지",
    tone: "warning",
    detail: "GNSS 신호 상실 — INS로 항법 전환 중",
  },
  spoofing: {
    label: "스푸핑 감지",
    tone: "danger",
    detail: "GPS 좌표 왜곡 감지 — Cross-view 보정 적용 중",
  },
  crossview: { label: "Cross-view 작동", tone: "ai" },
  corrected: { label: "Cross-view 보정 완료", tone: "success" },
};
