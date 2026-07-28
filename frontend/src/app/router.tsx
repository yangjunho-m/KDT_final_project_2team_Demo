import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "./App";
import { RequireAuth } from "./RequireAuth";

// 화면 3종은 독립 창으로 열리는 대형 페이지라 route 단위로 코드를 분리한다.
export const router = createBrowserRouter([
  {
    element: <App />,
    // lazy route 최초 로딩 동안 표시할 최소 fallback (경고 방지 포함)
    hydrateFallbackElement: <div className="app-shell" aria-busy="true" />,
    children: [
      {
        path: "/",
        element: <Navigate to="/operation" replace />,
      },
      {
        path: "/login",
        lazy: async () => ({
          Component: (await import("../pages/LoginPage/LoginPage")).LoginPage,
        }),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "/reports",
            lazy: async () => ({
              Component: (
                await import("../pages/CommandReportPage/CommandReportPage")
              ).CommandReportPage,
            }),
          },
          {
            path: "/operation",
            lazy: async () => ({
              Component: (await import("../pages/OperationPage/OperationPage"))
                .OperationPage,
            }),
          },
          {
            path: "/scenario",
            lazy: async () => ({
              Component: (await import("../pages/ScenarioPage/ScenarioPage"))
                .ScenarioPage,
            }),
          },
        ],
      },
      {
        // 드론뷰 독립 창 (관제 화면의 "드론뷰 크게 보기"가 window.open으로 연다).
        // 작은 팝업 창이라 RequireAuth로 감싸지 않는다 — 세션 만료 시 이 창까지
        // 전체 로그인 화면으로 튕기면 어색하므로, 인증 여부는 페이지 안에서 직접
        // 확인하고 안내만 표시한다 (RequireAuth.tsx 참고).
        path: "/drone-view",
        lazy: async () => ({
          Component: (
            await import("../pages/DroneViewWindowPage/DroneViewWindowPage")
          ).DroneViewWindowPage,
        }),
      },
    ],
  },
]);
