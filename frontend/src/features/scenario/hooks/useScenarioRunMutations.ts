import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createScenarioRun,
  stopScenarioRun,
} from "../../../api";
import type {
  CreateScenarioRunRequest,
  StopScenarioRunRequest,
} from "../domain";
import { queryKeys } from "../../../shared/constants/queryKeys";

export function useCreateScenarioRunMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateScenarioRunRequest) => createScenarioRun(input),
    onSuccess: (run, input) => {
      queryClient.setQueryData(queryKeys.scenarioRuns.detail(run.id), run);
      return queryClient.invalidateQueries({
        queryKey: queryKeys.scenarioRuns.active(input.areaId),
      });
    },
  });
}

export function useStopScenarioRunMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StopScenarioRunRequest) => stopScenarioRun(input),
    onSuccess: (run, input) => {
      queryClient.setQueryData(queryKeys.scenarioRuns.detail(run.id), run);
      return queryClient.invalidateQueries({
        queryKey: queryKeys.scenarioRuns.active(input.areaId),
      });
    },
  });
}
