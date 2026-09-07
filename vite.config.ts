import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_CIRCA_PORT ?? 5176),
      proxy: {
        '/nodics': {
          target: env.VITE_CIRCA_BACKEND_PROXY_TARGET ?? 'http://localhost:4520',
          changeOrigin: true,
        },
      },
    },
    build: { outDir: 'dist', emptyOutDir: true },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './test/setup.ts',
    },
  };
});
