import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useCurrentUserQuery } from "./hooks";
import { useAuthStore } from "../../stores";

export function AuthBootstrap({ children }: PropsWithChildren) {
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const { isError } = useCurrentUserQuery();

  useEffect(() => {
    if (isError) {
      clearAuth();
    }
  }, [clearAuth, isError]);

  return children;
}
