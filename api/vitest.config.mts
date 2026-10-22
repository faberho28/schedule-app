import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC conserva los metadatos de decoradores que necesita la inyección de Nest.
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        plugins,
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts', 'src/**/*.int-spec.ts'],
          environment: 'node',
          globalSetup: ['./test/support/postgres-container.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
          // Un solo contenedor compartido: los archivos corren en serie.
          fileParallelism: false,
        },
      },
    ],
  },
});
