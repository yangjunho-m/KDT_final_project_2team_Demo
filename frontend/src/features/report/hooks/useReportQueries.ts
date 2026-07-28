import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSituationReport, fetchReports } from "../../../api";
import type { SituationReportCreateInput } from "../../../shared/types";
import { queryKeys } from "../../../shared/constants/queryKeys";

export function useReportsQuery() {
  return useQuery({
    queryKey: queryKeys.reports,
    queryFn: ({ signal }) => fetchReports({ signal }),
    staleTime: 5_000,
  });
}

export function useCreateSituationReportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SituationReportCreateInput) =>
      createSituationReport(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.reports }),
  });
}
