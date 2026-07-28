import { useQuery } from "@tanstack/react-query";
import {
  fetchDrones,
  fetchDroneViewRoutes,
  fetchEnemyAreas,
  fetchOperationSnapshot,
} from "../../../api";
import { queryKeys } from "../../../shared/constants/queryKeys";

export function useOperationAreasQuery() {
  return useQuery({
    queryKey: queryKeys.enemyAreas,
    queryFn: ({ signal }) => fetchEnemyAreas({ signal }),
    staleTime: 10_000,
  });
}

/** 전체 드론 목록 (지휘화면 통계/보고 연계용). */
export function useAllDronesQuery() {
  return useQuery({
    queryKey: queryKeys.drones,
    queryFn: ({ signal }) => fetchDrones(undefined, { signal }),
    staleTime: 10_000,
  });
}

export function useOperationSnapshotQuery(areaId: string | null) {
  return useQuery({
    queryKey: areaId ? queryKeys.operationSnapshot(areaId) : ["operationSnapshot", "none"],
    queryFn: ({ signal }) => fetchOperationSnapshot(areaId ?? "", { signal }),
    enabled: areaId !== null,
    staleTime: 3_000,
  });
}

/**
 * 드론뷰 데이터셋의 정상(계획) 경로 목록. 데이터셋은 정적이라 오래 캐시한다 —
 * 작전지역/드론이 이 경로(출발↔도착)를 매칭해 지도에 정상 경로로 그린다.
 */
export function useDroneViewRoutesQuery() {
  return useQuery({
    queryKey: queryKeys.droneViewRoutes,
    queryFn: ({ signal }) => fetchDroneViewRoutes({ signal }),
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
