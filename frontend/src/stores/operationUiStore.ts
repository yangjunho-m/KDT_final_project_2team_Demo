import { create } from "zustand";

type OperationUiState = {
  currentAreaId: string | null;
  selectedDroneId: string | null;
  selectedTargetId: string | null;
  isDroneAddModalOpen: boolean;
  isReportModalOpen: boolean;
  setCurrentAreaId: (areaId: string | null) => void;
  selectDrone: (droneId: string | null) => void;
  selectTarget: (targetId: string | null) => void;
  openDroneAddModal: () => void;
  closeDroneAddModal: () => void;
  openReportModal: () => void;
  closeReportModal: () => void;
  resetAreaUi: () => void;
};

const initialAreaUiState = {
  selectedDroneId: null,
  selectedTargetId: null,
  isDroneAddModalOpen: false,
  isReportModalOpen: false,
};

export const useOperationUiStore = create<OperationUiState>((set) => ({
  currentAreaId: null,
  ...initialAreaUiState,
  setCurrentAreaId: (areaId) =>
    set((state) => {
      if (state.currentAreaId === areaId) {
        return state;
      }

      return {
        currentAreaId: areaId,
        ...initialAreaUiState,
      };
    }),
  selectDrone: (droneId) => set({ selectedDroneId: droneId }),
  selectTarget: (targetId) => set({ selectedTargetId: targetId }),
  openDroneAddModal: () => set({ isDroneAddModalOpen: true }),
  closeDroneAddModal: () => set({ isDroneAddModalOpen: false }),
  openReportModal: () => set({ isReportModalOpen: true }),
  closeReportModal: () => set({ isReportModalOpen: false }),
  resetAreaUi: () => set(initialAreaUiState),
}));
