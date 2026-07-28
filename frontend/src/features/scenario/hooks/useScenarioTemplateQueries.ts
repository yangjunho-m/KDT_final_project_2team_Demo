import { useQuery } from "@tanstack/react-query";
import { fetchScenarioTemplate, fetchScenarioTemplates } from "../../../api";
import { queryKeys } from "../../../shared/constants/queryKeys";
import type {
  RunnableScenarioTemplate,
  ScenarioRunType,
  ScenarioTemplate,
} from "../domain";

export function useScenarioTemplatesQuery(scenarioType?: ScenarioRunType) {
  return useQuery({
    queryKey: queryKeys.scenarioTemplates.list(scenarioType),
    queryFn: ({ signal }) => fetchScenarioTemplates(scenarioType, { signal }),
    staleTime: 30_000,
  });
}

// NORMAL 템플릿(STP-DATASET-NORMAL 등)은 /api/scenario-runs가 실행을 거부하므로
// 실행 선택 UI(OperationPage 헤더, ScenarioPage 불러오기)에서는 제외한다.
export function useRunnableScenarioTemplatesQuery() {
  return useQuery({
    queryKey: queryKeys.scenarioTemplates.list(undefined),
    queryFn: ({ signal }) => fetchScenarioTemplates(undefined, { signal }),
    staleTime: 30_000,
    select: (templates: ScenarioTemplate[]) =>
      templates.filter(
        (template): template is RunnableScenarioTemplate =>
          template.scenarioType !== "NORMAL",
      ),
  });
}

export function useScenarioTemplateQuery(templateId: string | null) {
  return useQuery({
    queryKey: templateId
      ? queryKeys.scenarioTemplates.detail(templateId)
      : ["scenarioTemplates", "detail", "none"],
    queryFn: ({ signal }) => fetchScenarioTemplate(templateId ?? "", { signal }),
    enabled: templateId !== null,
    staleTime: 30_000,
  });
}
