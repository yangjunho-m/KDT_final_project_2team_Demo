import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createDrone,
  createEnemyArea,
  removeEnemyArea,
  setDroneMovementTarget,
  unassignDroneFromArea,
  updateEnemyArea,
} from "../../../api";
import type {
  DroneCreateInput,
  DroneMovementTargetInput,
  EnemyAreaCreateInput,
  EnemyAreaUpdateInput,
} from "../../../shared/types";
import { queryKeys } from "../../../shared/constants/queryKeys";

type UnassignOperationAreaDroneInput = {
  areaId: string;
  droneId: string;
};

function useInvalidateOperationData() {
  const queryClient = useQueryClient();

  return (areaId: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.operationSnapshot(areaId),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.drones }),
    ]);
}

export function useCreateOperationAreaDroneMutation() {
  const invalidateOperationData = useInvalidateOperationData();

  return useMutation({
    mutationFn: (input: DroneCreateInput) => createDrone(input),
    onSuccess: (_drone, input) => invalidateOperationData(input.areaId),
  });
}

export function useUnassignOperationAreaDroneMutation() {
  const invalidateOperationData = useInvalidateOperationData();

  return useMutation({
    mutationFn: ({ areaId, droneId }: UnassignOperationAreaDroneInput) =>
      unassignDroneFromArea(areaId, droneId),
    onSuccess: (_drone, input) => invalidateOperationData(input.areaId),
  });
}

export function useSetDroneMovementTargetMutation() {
  const invalidateOperationData = useInvalidateOperationData();

  return useMutation({
    mutationFn: (input: DroneMovementTargetInput) =>
      setDroneMovementTarget(input),
    onSuccess: (_drone, input) => invalidateOperationData(input.areaId),
  });
}

export function useCreateEnemyAreaMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EnemyAreaCreateInput) => createEnemyArea(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.enemyAreas }),
  });
}

export function useUpdateEnemyAreaMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EnemyAreaUpdateInput) => updateEnemyArea(input),
    onSuccess: (area) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.enemyAreas }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.operationSnapshot(area.id),
        }),
      ]),
  });
}

export function useRemoveEnemyAreaMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (areaId: string) => removeEnemyArea(areaId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.enemyAreas }),
  });
}
