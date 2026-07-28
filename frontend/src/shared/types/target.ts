import type { Coordinate } from "./coordinate";

export type TargetStatus = "detected" | "tracking" | "lost" | "resolved";

export type Target = {
  id: string;
  areaId: string;
  name: string;
  position: Coordinate;
  status: TargetStatus;
  confidence: number;
  /** 표적 이미지 (드론 촬영 시뮬 — 발견 시 마커/패널에 표시) */
  imageUrl?: string;
  detectedAt: string;
  updatedAt: string;
};
