import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 프론트는 상대경로(/api, /ws)로 호출하고, 개발 서버에서는 아래 프록시가
// 백엔드(Nginx)로 전달한다. 배포 시에는 같은 Nginx 뒤에 두면 프록시 없이 동작한다.
const DEFAULT_BACKEND = "http://localhost:8000";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_DEV_PROXY_TARGET?.trim() || DEFAULT_BACKEND;

  return {
    plugins: [react()],
    server: {
      // IPv4/IPv6 loopback 모두 바인딩 (127.0.0.1 접속 허용)
      host: true,
      proxy: {
        "/api": { target: backend, changeOrigin: true },
        "/ws": {
          target: backend.replace(/^http/, "ws"),
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
