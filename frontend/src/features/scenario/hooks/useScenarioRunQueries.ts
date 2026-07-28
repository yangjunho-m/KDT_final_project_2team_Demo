import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveScenarioRuns,
  fetchScenarioRun,
} from "../../../api";
import { queryKeys } from "../../../shared/constants/queryKeys";

export function useActiveScenarioRunsQuery(areaId: string | null) {
  return useQuery({
    queryKey: areaId
      ? queryKeys.scenarioRuns.active(areaId)
      : ["scenarioRuns", "active", "none"],
    queryFn: ({ signal }) => fetchActiveScenarioRuns(areaId ?? "", { signal }),
    enabled: areaId !== null,
    staleTime: 3_000,
  });
}

export function useScenarioRunQuery(runId: string | null) {
  return useQuery({
    queryKey: runId
      ? queryKeys.scenarioRuns.detail(runId)
      : ["scenarioRuns", "detail", "none"],
    queryFn: ({ signal }) => fetchScenarioRun(runId ?? "", { signal }),
    enabled: runId !== null,
    staleTime: 3_000,
  });
}
