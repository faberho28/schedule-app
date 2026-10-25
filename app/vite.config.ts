import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // La API corre en http://localhost:3000 (ver `PORT` en api/.env.example).
  const apiTarget = env.API_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // Con `VITE_API_BASE_URL=/api` la aplicación llama a su propio origen y Vite reenvía a la API.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
