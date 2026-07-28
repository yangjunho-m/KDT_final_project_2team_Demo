import { create } from "zustand";

export type MapMode = "normal" | "satellite";

export type MapLayers = {
  enemyAreaCenter: boolean;
  enemyAreaRadius: boolean;
  drones: boolean;
  movementPath: boolean;
  actualPath: boolean;
  movementTarget: boolean;
  targets: boolean;
  gnssPosition: boolean;
  crossViewPosition: boolean;
  scenarioEffectRadius: boolean;
};

// 기본으로 켜 두는 레이어: 지도만 봐도 작전 상황이 읽히도록
// 작전지역 중심·이동 경로/목표·실제 경로·GPS/Cross-view 위치·교란지역 범위는 항상 표시한다.
// 작전지역 반경은 기본 해제(교란지역 범위와 겹쳐 혼동을 줄 수 있어 필요할 때만 켠다).
// (drones/targets는 데이터 존재 시 OperationPage가 자동으로 켠다)
export const initialMapLayers: MapLayers = {
  enemyAreaCenter: true,
  enemyAreaRadius: false,
  drones: false,
  movementPath: true,
  actualPath: true,
  movementTarget: true,
  targets: false,
  gnssPosition: true,
  crossViewPosition: true,
  scenarioEffectRadius: false,
};

type MapUiState = {
  mapMode: MapMode;
  activePopupId: string | null;
  layers: MapLayers;
  setMapMode: (mode: MapMode) => void;
  toggleLayer: (layer: keyof MapLayers) => void;
  setLayer: (layer: keyof MapLayers, isActive: boolean) => void;
  setActivePopupId: (popupId: string | null) => void;
  closePopup: () => void;
  resetMapUi: () => void;
};

export const useMapUiStore = create<MapUiState>((set) => ({
  mapMode: "normal",
  activePopupId: null,
  layers: initialMapLayers,
  setMapMode: (mode) => set({ mapMode: mode }),
  toggleLayer: (layer) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layer]: !state.layers[layer],
      },
    })),
  setLayer: (layer, isActive) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layer]: isActive,
      },
    })),
  setActivePopupId: (popupId) => set({ activePopupId: popupId }),
  closePopup: () => set({ activePopupId: null }),
  resetMapUi: () =>
    set({
      mapMode: "normal",
      activePopupId: null,
      layers: initialMapLayers,
    }),
}));
