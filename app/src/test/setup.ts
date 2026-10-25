import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';
import { installViewport, resetViewport } from './viewport';

// jsdom no implementa `matchMedia`; el ancho por defecto es móvil (ver `viewport.ts`).
installViewport();

// Con la suite completa en paralelo, la primera carga de una pantalla con varias peticiones en
// cadena (negocio, técnicos y citas) puede superar el plazo de 1 s por defecto de `findBy*`.
configure({ asyncUtilTimeout: 4000 });

// Cualquier petición sin handler falla la prueba: ninguna prueba debe salir a la red real.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  resetViewport();
  // La selección de técnicos de la agenda vive en `localStorage`: no debe pasar de una prueba a otra.
  localStorage.clear();
  server.resetHandlers();
});

afterAll(() => server.close());
