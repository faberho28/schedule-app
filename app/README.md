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

## Pantallas de configuración

Viven en `src/features/settings/`:

- `/settings/business`: la zona horaria es de solo lectura; se edita el buffer (0 a 240 minutos) y la hora de envío del seguimiento.
- `/settings/services`: alta, edición, desactivación y reactivación (no hay borrado). Pide `includeInactive=true`. Si un cambio de duración deja citas futuras con la duración anterior, muestra el aviso sin bloquear el guardado.
- `/settings/technicians` y `/settings/technicians/:id`: alta, nombre y teléfono, horario semanal, días libres, desactivar, reactivar y eliminar.

El horario semanal, los días libres, el estado `active` y la eliminación de un técnico se escriben solo por el flujo de cambio de horario (`use-schedule-change.ts`): vista previa, y aplicación si no hay citas afectadas. Si las hay, `ScheduleConflictDialog` lista las citas y la propuesta de reasignación (solo cambia el técnico, nunca el horario). Aceptar la aplica completa; las citas sin reemplazo bloquean el cambio hasta resolverlas a mano. Ante `proposal_stale`, `slot_taken` o `schedule_conflict` al aplicar, se vuelve a pedir la vista previa. Al aplicar se invalidan `['technicians']` y `['appointments']`.

Los límites de un día libre se envían como instantes calculados con `zonedInstant` (`src/shared/lib/dates.ts`) en la zona horaria del negocio.

## Agenda

Vive en `src/features/agenda/`. La ruta `/agenda?view=day|week&date=YYYY-MM-DD` guarda la vista y la fecha en la URL; un valor ausente o inválido se reemplaza por la vista de día y por hoy en la zona horaria del negocio.

- `AgendaPage.tsx`: carga el negocio, los técnicos (`includeAnonymized=true`) y las citas del rango con `GET /appointments?from&to` (fechas locales, ambas incluidas). Ofrece Día/Semana, anterior/siguiente, "Hoy" y un selector de fecha. Muestra las columnas de los técnicos activos y, además, las de los inactivos o eliminados que tengan citas en el rango. Solo los activos ofrecen citas nuevas.
- `AgendaGrid.tsx`: grilla con CSS propio, sin librería de calendario y sin arrastrar y soltar. La vista de día tiene una columna por técnico; la de semana, una sección por día con un carril por técnico. El filtro "Técnico" limita las columnas a una (útil en móvil). Cada cita es un `button` con `aria-label` (hora, cliente, servicio, estado, técnico, cambio de técnico y traslado). El estado se indica con ícono, texto y el color del token `--status-*`. El buffer se dibuja como una cola rayada. Las canceladas se muestran atenuadas y tachadas, sin cola de buffer. Props: ver `AgendaGridProps` (contrato de D8; `technicians[].active` es opcional).
- `agenda-layout.ts`: funciones puras con las posiciones (`blockGeometry`), el reparto de ancho de bloques solapados (`packOverlaps`) y la ventana horaria (`visibleHoursFor`: 07:00 a 19:00, ampliada a horas en punto para que quepan todas las citas). Mide en hora de pared de la zona del negocio: en un día con cambio de horario la hora que no existe queda como hueco y la repetida se superpone.
- `agenda-params.ts`: lectura de `view` y `date` de la URL y navegación entre fechas.
- Las consultas usan la clave `['appointments', ...]` (`agenda-api.ts`), así que `invalidateQueries({ queryKey: ['appointments'] })` refresca la agenda. `AgendaPage` abre los diálogos de cita por defecto; sus props opcionales `onAppointmentSelect` y `onEmptyCellSelect` sustituyen esa apertura (las usan las pruebas de la pantalla).

## Diálogos de cita

Viven en `src/features/appointments/` y se abren desde la agenda: tocar una cita abre su ficha (`AppointmentDetailDialog`) con Mover, Reasignar y Cancelar cita; el botón "+" de la columna de un técnico y el botón "Nueva cita" abren `CreateAppointmentDialog`. El diálogo abierto es estado local de `AgendaPage` (`AppointmentFlows.tsx`). Tras cada comando se muestra un aviso (`role="status"`) y se invalidan `['appointments']` y `['slots']`, así que la agenda se actualiza sin recargar.

- **Nueva cita**: se elige cliente (búsqueda por nombre o teléfono con `GET /customers?search=`, o alta inline con `+57` precargado; los eliminados no se pueden elegir), servicio activo y un cupo de `GET /slots` (ventana de 7 días desde una fecha editable). No existe un campo para escribir la hora: cada cupo es un botón de radio, operable con flechas. La dirección es siempre obligatoria, se precarga con la guardada del cliente y se puede editar. El técnico lo asigna la API; la persona puede elegir otro de `available_technician_ids` del cupo (si se abrió desde la columna de un técnico, arranca elegido). La cita queda `confirmed`.
- **Mover**: pide los cupos de todos los técnicos con `excludeAppointmentId` y `preferredTechnicianId`. Al elegir un cupo indica si se mantiene el técnico o si cambia, y en ese caso avisa que el cliente se enterará en el futuro mensaje de reprogramación (en este sprint no se envía ningún mensaje).
- **Reasignar**: solo cambia el técnico, nunca la hora. Ofrece a los demás técnicos activos. La API no expone la disponibilidad de un técnico a una hora arbitraria (`GET /slots` solo devuelve cupos de su grilla y la reasignación no la exige), así que la comprobación la hace `POST /appointments/:id/reassign`: si el elegido está ocupado responde `slot_taken` y el diálogo queda abierto para elegir a otro.
- **Cancelar**: confirmación explícita con motivo opcional. Una cita cancelada no se reabre.
- Las citas `completed`, `no_show` y `cancelled` no se pueden mover, reasignar ni cancelar: las acciones quedan deshabilitadas con un texto que explica por qué (el cierre y la reapertura son de la fase 17).

Errores (`SubmitError.tsx`): `slot_taken` muestra "Cupo ocupado" y pide elegir otro cupo; `slot_not_offered` muestra su mensaje; ambos refrescan los cupos y limpian el cupo elegido. `invalid_transition` y `not_found` refrescan la agenda. `customer_anonymized` deselecciona al cliente. Los errores `validation_error` con campos se asocian al campo (`aria-describedby`). Un error de red ofrece "Reintentar".

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
