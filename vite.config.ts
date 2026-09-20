import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_CIRCA_PORT ?? 3600),
      strictPort: true,
      allowedHosts: [".trycloudflare.com"],
      proxy: {
        "/nodics/commsApi": {target:env.VITE_CIRCA_COMMUNICATION_TARGET ?? "http://127.0.0.1:4340",changeOrigin:true},
        "/nodics/locationMap": {
          target: env.VITE_CIRCA_LOCATION_TARGET ?? "http://127.0.0.1:4380",
          changeOrigin: true,
        },
        "/nodics/profile": {
          target: env.VITE_CIRCA_PROFILE_TARGET ?? "http://127.0.0.1:4300",
          changeOrigin: true,
        },
        "/nodics/cms": {
          target: env.VITE_CIRCA_WCMS_ONLINE_TARGET ?? "http://127.0.0.1:4314",
          changeOrigin: true,
        },
        "/nodics/media/v0/content": {
          target: env.VITE_CIRCA_WCMS_ONLINE_TARGET ?? "http://127.0.0.1:4314",
          changeOrigin: true,
        },
        "/nodics/media": {
          target: env.VITE_CIRCA_MEDIA_TARGET ?? "http://127.0.0.1:4312",
          changeOrigin: true,
        },
        "/nodics": {
          target:
            env.VITE_CIRCA_BACKEND_PROXY_TARGET ?? "http://127.0.0.1:4370",
          changeOrigin: true,
        },
      },
    },
    build: { outDir: "dist", emptyOutDir: true },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./test/setup.ts",
    },
  };
});
