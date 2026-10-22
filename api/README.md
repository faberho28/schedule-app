# api

Backend de Schedule App: NestJS (adaptador Express), TypeScript estricto, Kysely sobre Postgres 16. Es un proyecto independiente (su propio `package.json`).

## Requisitos

- Node 24 (`.nvmrc`).
- Docker en ejecución (para Postgres local y para las pruebas de integración).

## Configuración

```bash
cp .env.example .env
npm install
```

Variables (validadas con zod al iniciar; si falta alguna obligatoria el proceso falla):

| Variable              | Descripción                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`        | Cadena de conexión a Postgres                                    |
| `PORT`                | Puerto HTTP (por defecto 3000)                                   |
| `CORS_ORIGIN`         | Origen permitido de la PWA (por defecto `http://localhost:5173`) |
| `DEFAULT_BUSINESS_ID` | UUID del negocio por defecto hasta que exista autenticación      |

## Comandos

| Comando                    | Qué hace                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run start:dev`        | Inicia la API en modo observación                                |
| `npm run build`            | Compila a `dist/`                                                |
| `npm test`                 | Ejecuta todas las pruebas (unidad e integración)                 |
| `npm run test:unit`        | Solo pruebas de unidad (`src/**/*.spec.ts`), no requieren Docker |
| `npm run test:integration` | Solo pruebas de integración (`*.int-spec.ts`), requieren Docker  |
| `npm run lint`             | ESLint                                                           |
| `npm run typecheck`        | `tsc --noEmit`                                                   |
| `npm run format`           | Prettier                                                         |

## Base de datos de desarrollo

Desde la raíz del repositorio:

```bash
docker compose up -d      # Postgres 16 con volumen con nombre `postgres_data`
docker compose ps         # el healthcheck debe pasar a `healthy`
docker compose down       # detiene el contenedor y conserva los datos
```

## Pruebas

- Runner: Vitest con `unplugin-swc` (conserva los metadatos de decoradores de Nest).
- Dos proyectos de Vitest: `unit` (dominio puro, sin Docker) e `integration`.
- Integración: `test/support/postgres-container.ts` actúa como `globalSetup`. Levanta un único contenedor `postgres:16-alpine` con Testcontainers por ejecución y publica la URL con `inject('databaseUrl')`. Entre pruebas se usa `truncateAll(pool)`; no hay rollback por prueba porque las pruebas de concurrencia necesitan conexiones reales.
- La primera ejecución descarga la imagen de Postgres y puede tardar más.
