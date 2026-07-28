import { create } from "zustand";

/**
 * 표적 발견 시뮬레이션 상태 (프론트 로컬).
 * 시나리오 화면에서 배치한 표적은 관제 화면에서 기본 숨김이며,
 * 드론이 근접 통과하면 "발견"되어 지도/패널에 나타난다.
 */
type TargetDiscoveryState = {
  discovered: Record<string, true>;
  markDiscovered: (areaId: string, targetId: string) => void;
};

export function targetDiscoveryKey(areaId: string, targetId: string) {
  return `${areaId}:${targetId}`;
}

export const useTargetDiscoveryStore = create<TargetDiscoveryState>((set) => ({
  discovered: {},
  markDiscovered: (areaId, targetId) =>
    set((state) => {
      const key = targetDiscoveryKey(areaId, targetId);
      if (state.discovered[key]) {
        return state;
      }
      return { discovered: { ...state.discovered, [key]: true } };
    }),
}));
