import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores";

/**
 * 로그인 없이는 화면 진입을 막는다. 401 발생 시 authStore가 비워지므로
 * 이 컴포넌트가 다시 렌더되며 자동으로 /login으로 이동한다.
 */
export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
