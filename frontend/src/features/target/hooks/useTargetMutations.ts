import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTarget,
  removeTarget,
  uploadTargetImage,
  type TargetCreateInput,
} from "../../../api";
import { queryKeys } from "../../../shared/constants/queryKeys";

export function useCreateTargetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TargetCreateInput) => createTarget(input),
    onSuccess: (_target, input) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.operationSnapshot(input.areaId),
      }),
  });
}

export function useUploadTargetImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetId, file }: { targetId: string; file: File; areaId: string }) =>
      uploadTargetImage(targetId, file),
    onSuccess: (_result, input) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.operationSnapshot(input.areaId),
      }),
  });
}

export function useRemoveTargetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetId }: { targetId: string; areaId: string }) =>
      removeTarget(targetId),
    onSuccess: (_void, input) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.operationSnapshot(input.areaId),
      }),
  });
}
