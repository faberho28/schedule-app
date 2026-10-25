import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * Opciones de `vite-plugin-pwa` (D8). El service worker precachea solo el shell (JS, CSS, HTML e
 * íconos) y no define caché en tiempo de ejecución: ninguna respuesta de la API se guarda, así que
 * sin conexión no hay datos de agenda. Las navegaciones caen en `index.html` y la propia
 * aplicación muestra la pantalla "Sin conexión".
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  strategies: 'generateSW',
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'Schedule App',
    short_name: 'Schedule App',
    description: 'Agenda de servicios para tu negocio',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#E31937',
    background_color: '#F3F4F6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api(\/|$)/],
    runtimeCaching: [],
    cleanupOutdatedCaches: true,
  },
};
