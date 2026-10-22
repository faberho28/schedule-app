import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Configuración de pruebas separada de `vite.config.ts` para no cargar el plugin de PWA ni
// Tailwind: las pruebas verifican comportamiento visible, no estilos.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // URL absoluta de la API para que `fetch` de Node acepte las rutas y MSW las intercepte.
    env: { VITE_API_BASE_URL: 'http://localhost:3000/api' },
  },
});
