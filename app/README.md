# Schedule App: PWA del dueño (`app/`)

Aplicación web instalable (PWA) con la que el dueño configura el negocio y opera la agenda. Es un proyecto independiente de `api/`: tiene su propio `package.json`, TypeScript, ESLint y Prettier, y no hay workspace en la raíz.

Stack: React 19, Vite 8, TypeScript, React Router 7, TanStack Query, Tailwind v4 y shadcn/ui, `openapi-typescript` y `openapi-fetch` para el cliente de la API, `vite-plugin-pwa` para el shell instalable. Pruebas con Vitest, React Testing Library y MSW.

## Requisitos

- Node 24 (`.nvmrc`).
- La API de `api/` en `http://localhost:3000` para trabajar con datos reales.

## Puesta en marcha

```bash
npm install --prefix app
npm run dev --prefix app        # http://localhost:5173
```

## Comandos

| Comando                 | Qué hace                                                                |
| ----------------------- | ----------------------------------------------------------------------- |
| `npm run dev`           | Servidor de desarrollo de Vite en el puerto 5173, con proxy de `/api`.  |
| `npm run build`         | Verifica tipos y genera `dist/` con el service worker y el manifest.    |
| `npm run preview`       | Sirve `dist/` para probar la PWA instalada.                             |
| `npm test`              | Ejecuta todas las pruebas con Vitest (no necesita Docker ni la API).    |
| `npm run test:watch`    | Pruebas en modo observación.                                            |
| `npm run lint`          | ESLint.                                                                 |
| `npm run typecheck`     | `tsc --noEmit`.                                                         |
| `npm run format`        | Prettier (`format:check` solo verifica).                                |
| `npm run gen:api`       | Regenera `src/shared/api/schema.d.ts` desde `../api/openapi.json`.      |
| `npm run gen:api:check` | Falla si `schema.d.ts` no coincide con `../api/openapi.json`.           |
| `npm run icons`         | Regenera los íconos de `public/` (solo al cambiar el diseño del ícono). |

## Variables de entorno

Crea `app/.env` si necesitas cambiar algo. Todas son opcionales en desarrollo y tienen estos valores por defecto:

```
VITE_API_BASE_URL=/api
# API_PROXY_TARGET=http://localhost:3000
```

| Variable            | Uso                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | URL base de la API. Por defecto `/api`. En producción, la URL pública de la API (incluida en `CORS_ORIGIN` de `api/`). |
| `API_PROXY_TARGET`  | Solo desarrollo: destino del proxy de `/api`. Por defecto `http://localhost:3000`.                                     |

En desarrollo la aplicación llama a `/api/...` en su propio origen y Vite reenvía la petición a la API quitando el prefijo `/api`. Así no depende de CORS.

## Cliente de la API

El contrato es `api/openapi.json`. De él se genera `src/shared/api/schema.d.ts`, que **se versiona**:

```bash
npm run gen:api --prefix app
```

Ejecútalo cada vez que cambie `api/openapi.json` (después de `npm run openapi:export --prefix api`) y confirma el archivo generado. `npm run gen:api:check` falla si quedó desactualizado.

- `src/shared/api/client.ts`: cliente `openapi-fetch` tipado con `paths`.
- `src/shared/api/errors.ts`: `ApiError` y `unwrap()`, que convierte el resultado del cliente en una promesa que rechaza con el problema de la API; sirve directo como `queryFn` o `mutationFn`.
- `src/shared/lib/error-messages.ts`: traduce cada código de error a español (`slot_taken` pasa a "Cupo ocupado"). Está tipado con `Record<ErrorCode, string>`: si el contrato agrega un código, `npm run typecheck` falla hasta que se traduzca.

## Estructura

```
src/
  app/          layout, rutas, proveedores
  features/     agenda, appointments, customers, settings, closure
  shared/       api/ (cliente), lib/ (fechas, errores, conectividad), ui/
  components/ui componentes de shadcn/ui
  test/         arnés de pruebas (setup de Vitest y servidor MSW)
```

Rutas: `/agenda?view=day|week&date=YYYY-MM-DD`, `/customers`, `/customers/:id`, `/settings/business`, `/settings/services`, `/settings/technicians` y `/settings/technicians/:id`.

El estado del servidor vive en TanStack Query, la vista y la fecha en la URL y los diálogos en estado local. No hay store global.

## Tema

Los colores son variables CSS en `src/index.css` (convención de shadcn/ui): azul primario `#2563EB`, neutros slate y un par fondo/texto por cada estado de la cita (`pending`, `confirmed`, `completed`, `no_show`, `cancelled`). Hay tema claro y oscuro (clase `.dark`, que `index.html` activa según `prefers-color-scheme`). `src/theme/tokens.test.ts` verifica que todos los pares cumplan contraste AA (4,5:1).

## PWA

Solo el shell es instalable. El service worker precachea JS, CSS, HTML e íconos, y **no guarda respuestas de la API**: sin conexión no hay datos de agenda. Cuando no hay red, la aplicación muestra la pantalla "Sin conexión" con el botón "Reintentar", que comprueba la conexión con una petición real a la API. Las opciones están en `pwa.config.ts`.

Para probarlo: `npm run build && npm run preview`, abre la aplicación, instálala desde el navegador y, en DevTools, activa "Offline" en la pestaña Network.

## Pruebas

Se escriben primero (TDD estricto, ver `openspec/config.yaml`). `src/test/setup.ts` levanta MSW con `onUnhandledFrame: 'error'`: una petición sin handler hace fallar la prueba. Cada prueba registra sus respuestas con `server.use(...)` de `src/test/server.ts`.

Las fechas que muestra la interfaz se formatean con `Intl.DateTimeFormat` en la zona horaria del negocio (`src/shared/lib/dates.ts`). La interfaz no calcula cupos ni horarios: eso lo hace la API.

## Texto de la interfaz

Todo el texto visible va en español neutro con tuteo, sin voseo. Los identificadores de código van en inglés.
