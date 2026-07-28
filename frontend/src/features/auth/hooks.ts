import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, login, logout, type LoginRequest } from "../../api";
import { queryKeys } from "../../shared/constants/queryKeys";
import { useAuthStore } from "../../stores";

export function useCurrentUserQuery() {
  const accessToken = useAuthStore((state) => state.accessToken);

  // 조회 실패 시 인증 해제는 AuthBootstrap의 isError 처리에서 수행한다.
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: getCurrentUser,
    enabled: accessToken !== null,
    retry: false,
    staleTime: 60_000,
    throwOnError: false,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

  return useMutation({
    mutationFn: (input: LoginRequest) => login(input),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(queryKeys.auth.me, data.user);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((state) => state.clearAuth);

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearAuth();
      queryClient.removeQueries({ queryKey: queryKeys.auth.me });
    },
  });
}
