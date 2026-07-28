import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createScenarioTemplate,
  removeScenarioTemplate,
  updateScenarioTemplate,
} from "../../../api";
import type {
  CreateScenarioTemplateInput,
  UpdateScenarioTemplateInput,
} from "../domain";
import { queryKeys } from "../../../shared/constants/queryKeys";

export function useCreateScenarioTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateScenarioTemplateInput) => createScenarioTemplate(input),
    onSuccess: (template) => {
      queryClient.setQueryData(queryKeys.scenarioTemplates.detail(template.id), template);
      return queryClient.invalidateQueries({
        queryKey: ["scenarioTemplates", "list"],
      });
    },
  });
}

export function useUpdateScenarioTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateScenarioTemplateInput) => updateScenarioTemplate(input),
    onSuccess: (template) => {
      queryClient.setQueryData(queryKeys.scenarioTemplates.detail(template.id), template);
      return queryClient.invalidateQueries({
        queryKey: ["scenarioTemplates", "list"],
      });
    },
  });
}

export function useRemoveScenarioTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (templateId: string) => removeScenarioTemplate(templateId),
    onSuccess: (_void, templateId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.scenarioTemplates.detail(templateId),
      });
      return queryClient.invalidateQueries({
        queryKey: ["scenarioTemplates", "list"],
      });
    },
  });
}
