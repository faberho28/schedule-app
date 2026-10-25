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

Rutas: `/` (Panel de control), `/agenda?view=day|week&date=YYYY-MM-DD`, `/customers`, `/customers/:id`, `/settings/business`, `/settings/services`, `/settings/technicians`, `/settings/technicians/:id` y `/profile`. `/settings` redirige a `/settings/business`.

### Shell adaptable

`useIsDesktop()` (`src/shared/lib/use-media-query.ts`) consulta `matchMedia('(min-width: 1024px)')` con `useSyncExternalStore`. `AppLayout` elige según ese valor:

- Desde 1024 px, `Sidebar`: barra lateral oscura con Panel de control, Agenda, Clientes, Técnicos, Tipos de servicio, Configuración y Perfil al pie. Entre 1024 y 1279 px se contrae a íconos (la etiqueta queda `sr-only`); desde 1280 px (`xl:`) muestra las etiquetas.
- Por debajo de 1024 px, `BottomNav`: Panel, Agenda, Clientes, Técnicos y "Más" (Tipos de servicio y Configuración). Perfil no está en la barra inferior: se abre desde el ícono del encabezado del Panel (`features/dashboard/ProfileLink.tsx`).
- `PageHeader` (`shared/ui`) reemplaza a `PageTitle` en las pantallas. En móvil y fuera de `/` muestra "Volver": `navigate(-1)` si hubo navegación dentro de la aplicación y, si no, `/`.

Las entradas de navegación están en `src/app/nav-items.ts`. Las medidas reales (objetivo táctil de 44 px, contracción de la barra lateral) no se miden en jsdom; las pruebas comprueban clases y atributos ARIA y el resto se revisa a mano.

### Perfil simulado

`/profile` muestra un Perfil de demostración ("Dueño del negocio") con un aviso visible, sin cierre de sesión. Sus datos están en `src/features/profile/profile.mock.ts`, marcado con `MOCK`. `profile-mock.guard.test.ts` falla si un archivo fuera de `features/profile` importa ese módulo o si el archivo pierde el marcador. La deuda de reemplazarlo por el usuario autenticado está en `openspec/changes/sprint-2-owner-panel/debts.md`.

El estado del servidor vive en TanStack Query, la vista y la fecha en la URL y los diálogos en estado local. No hay store global.

## Pantallas de configuración

Viven en `src/features/settings/`:

- `/settings/business`: la zona horaria es de solo lectura; se edita el buffer (0 a 240 minutos) y la hora de envío del seguimiento.
- `/settings/services` (en la interfaz, "Tipos de servicio"): alta, edición, desactivación y reactivación (no hay borrado). Pide `includeInactive=true`. Si un cambio de duración deja servicios futuros con la duración anterior, muestra el aviso sin bloquear el guardado.
- `/settings/technicians` y `/settings/technicians/:id`: alta, nombre y teléfono, horario semanal, días libres, desactivar, reactivar y eliminar.

El horario semanal, los días libres, el estado `active` y la eliminación de un técnico se escriben solo por el flujo de cambio de horario (`use-schedule-change.ts`): vista previa, y aplicación si no hay servicios afectados. Si los hay, `ScheduleConflictDialog` lista los servicios y la propuesta de reasignación (solo cambia el técnico, nunca el horario). Aceptar la aplica completa; los servicios sin reemplazo bloquean el cambio hasta resolverlas a mano. Ante `proposal_stale`, `slot_taken` o `schedule_conflict` al aplicar, se vuelve a pedir la vista previa. Al aplicar se invalidan `['technicians']` y `['appointments']`.

Los límites de un día libre se envían como instantes calculados con `zonedInstant` (`src/shared/lib/dates.ts`) en la zona horaria del negocio.

## Panel de control

Vive en `src/features/dashboard/` y es la pantalla de `/` en escritorio y móvil: cuatro tarjetas y la lista "Servicios de hoy". En móvil el encabezado lleva el ícono de Perfil (`ProfileLink.tsx`) y no "Volver".

- `dashboard-api.ts`: `useDashboardSummary()` hace una sola solicitud, `GET /dashboard/summary`, con la clave `['appointments','summary']`. Como cuelga de `['appointments']`, cerrar, cancelar, mover, reasignar o crear un servicio la refresca con el mismo `invalidateQueries` de la agenda. La zona horaria para las horas sale de `useBusiness()`.
- `dashboard-format.ts`: funciones puras con tablas de pruebas (`efficiencyPercentText`, `formatCutoffDate`, `formatWorkingOfTotal`, `formatCompletedOfDue`).
- `DashboardPage.tsx`: la interfaz no calcula nada del negocio; "hoy" es el campo `today` de la API y nunca el reloj del navegador.

  | Tarjeta                 | Campo                | Cómo se muestra                                                                                                                                                                                                     |
  | ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Servicios hoy           | `services_today`     | El número, 0 si no hay servicios. Excluye cancelados.                                                                                                                                                               |
  | Técnicos activos        | `active_technicians` | `working/total`, por ejemplo `3/5` o `0/0`.                                                                                                                                                                         |
  | Eficiencia de servicios | `efficiency`         | `rate` (fracción) × 100 redondeado al entero más cercano, por ejemplo `67 %`; "Sin datos" si `rate` es `null`. Siempre `completed de due servicios` y "Últimos 30 días, desde el dd/mm/aaaa" con `efficiency.from`. |
  | Servicios pendientes    | `pending_to_close`   | El número. Es un enlace a `/agenda?view=day&date=<today>&display=list&toClose=1` (lista "Por cerrar"); su nombre accesible incluye el conteo.                                                                       |

- "Servicios de hoy" usa `remaining_today` en el orden de la API (inicio, técnico, id). Cada fila es un enlace con hora de inicio y fin, cliente (`customerLabel`), tipo de servicio, técnico (`technicianLabel`) y estado con texto, ícono y color. Abre `/agenda?view=day&date=<today>&appointment=<id>`. Vacía muestra "No quedan servicios por atender hoy".
- Mientras carga solo se ve "Cargando el panel…", sin números. Si falla el resumen o el negocio se muestra "No se pudo cargar el panel. Reintenta." con el botón "Reintentar".

## Agenda

Vive en `src/features/agenda/`. La ruta `/agenda?view=day|week&date=YYYY-MM-DD` guarda la vista y la fecha en la URL; un valor ausente o inválido se reemplaza por la vista de día y por hoy en la zona horaria del negocio.

- `AgendaPage.tsx`: carga el negocio, los técnicos (`includeAnonymized=true`) y los servicios del rango con `GET /appointments?from&to` (fechas locales, ambas incluidas). Arma la barra (`AgendaToolbar.tsx`), decide entre la lista y la grilla de escritorio y, en escritorio, calcula los técnicos elegidos, sus colores y las horas visibles.
- `AgendaToolbar.tsx`: en escritorio, el alternador Día/Semana, anterior/siguiente, "Hoy", el selector de fecha, el campo de búsqueda global (la prop `search`), "Nuevo servicio" y, debajo, el selector de técnicos y el interruptor "Mostrar cancelados". En móvil la navegación de un día y "Nuevo servicio", con el campo de búsqueda en una fila propia debajo. Sin indicadores del Panel, sin vista Mes. Todos los controles miden al menos 44 px.
- `AgendaGrid.tsx`: grilla única al estilo de un calendario, con CSS propio, sin librería y sin arrastrar y soltar. Ver "Grilla de escritorio" más abajo.
- `agenda-layout.ts`: funciones puras con las posiciones (`blockGeometry`), el reparto de ancho de bloques solapados (`packOverlaps`), el reparto con desborde (`layoutDay`) y la ventana horaria (`visibleHoursFor`, `visibleMinutesOf`). Mide en hora de pared de la zona del negocio: en un día con cambio de horario la hora que no existe queda como hueco y la repetida se superpone.
- `agenda-params.ts`: `parseAgendaParams(params, today, isDesktop)` lee y normaliza los parámetros de la URL, `serializeAgendaParams` hace el camino inverso (solo emite lo que difiere del valor por defecto) y `daysOf`/`shiftDate` resuelven la navegación entre fechas. Cualquier valor inválido cae a su valor por defecto.

  | Parámetro                   | Valores                                                                                                        | Por defecto                |
  | --------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------- |
  | `view`                      | `day`, `week` (solo escritorio; por debajo de 1024 px siempre es `day`)                                        | `day`                      |
  | `date`                      | `YYYY-MM-DD` real                                                                                              | hoy en la zona del negocio |
  | `display`                   | `list`                                                                                                         | `grid`                     |
  | `from`, `to`                | `HH:MM`                                                                                                        | sin filtro                 |
  | `toClose`, `cancelled`      | `1`                                                                                                            | desactivado                |
  | `technician`, `serviceType` | ids, repetibles                                                                                                | sin filtro                 |
  | `status`                    | `pending`, `confirmed`, `completed`, `no_show`, `cancelled`, repetible; `cancelled` implica mostrar cancelados | sin filtro                 |
  | `appointment`               | id de un servicio                                                                                              | ninguno                    |

- Lista cronológica: por debajo de 1024 px la agenda muestra un solo día como lista (sin Día/Semana); en escritorio se llega a ella con `display=list`. `AgendaList.tsx` es una `ul` de filas-botón (hora, cliente, tipo de servicio, técnico y estado con ícono, texto y color; el nombre accesible las resume) y, con `groupByDay`, una sección por día. Sin resultados muestra "No hay servicios para estos filtros". En móvil la barra (anterior, siguiente, "Hoy", fecha) reemplaza la entrada del historial, así "Volver" regresa a la pantalla de origen y no recorre los días vistos.
- Filtros de la lista (`AgendaFilters.tsx`, funciones puras en `agenda-list.ts`): chips de técnico, estado y tipo de servicio (los tipos salen de los servicios cargados), más "Por cerrar" y el interruptor "Mostrar cancelados". Dentro de una categoría los chips se combinan con O y entre categorías con Y. Los cancelados se ocultan salvo que el interruptor (`cancelled=1`) o el chip "Cancelado" (`status=cancelled`) los pidan. Los cambios de filtro usan `replace`. "Limpiar filtros" quita chips y franja. El orden es por inicio y, en empate, por nombre del técnico y luego por id.
- "Por cerrar" (`toClose=1`) ignora la fecha: usa `useToClose()` (`GET /agenda/to-close`, clave `['appointments','to-close']`; los `confirmed` ya iniciados y sin cerrar, del más antiguo, hasta 200), agrupa por día y oculta la barra de fechas. Si `total` supera lo mostrado, avisa "Mostrando 200 de N".
- Franja (`from`, `to` en `HH:MM`, hora local): la lista de "+N más" de la grilla es esta misma lista de un día filtrada por franja. Entra un servicio si su bloque se solapa con la franja (empieza antes de `to` y termina después de `from`). Muestra la franja ("10:00-11:30") y, solo en escritorio, el enlace "Volver a la grilla", que quita `display`, `from` y `to`.
- Abrir un servicio por enlace: `/agenda?view=day&date=YYYY-MM-DD&appointment=<id>`. `AgendaPage` busca el servicio en el rango cargado y, si no está, lo pide con `useAppointment(id)` (`GET /appointments/:id`, clave `['appointments','detail',id]`). Si su día no está en la vista, reemplaza `date` por el día local del servicio con `replace`. Abre la ficha aunque el técnico no sea visible. Un id inexistente muestra "No se encontró el servicio" sin ficha. Cerrar la ficha quita `appointment` de la URL con `replace`; cambiar de día o de vista también lo suelta. El diálogo de eliminar datos de un cliente enlaza así a sus servicios futuros.
- Cliente anonimizado: toda pantalla que muestra el cliente de un servicio usa `customerLabel` (`shared/lib/people.ts`): "Cliente eliminado (alias)" o "Cliente eliminado" sin alias.
- Las consultas usan la clave `['appointments', ...]` (`agenda-api.ts`), así que `invalidateQueries({ queryKey: ['appointments'] })` refresca la agenda. `AgendaPage` abre los diálogos del servicio por defecto; sus props opcionales `onAppointmentSelect` y `onEmptySlotSelect(day)` sustituyen esa apertura (las usan las pruebas de la pantalla).

### Búsqueda global

El campo "Buscar servicio o cliente" (`GlobalSearch.tsx`, hook `search-api.ts`) está en la barra de la agenda, en escritorio y en móvil, con el mismo comportamiento.

| Aspecto                      | Comportamiento                                                                                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuándo consulta              | Con 2 a 100 caracteres (texto recortado), tras una pausa de 250 ms sin teclear. Con menos muestra "Escribe al menos 2 caracteres" y no envía nada. El campo admite 100 caracteres.                                                                                                       |
| Solicitud                    | Una sola, `GET /search?q=`, con clave `['appointments','search',q]`. La API ignora acentos y mayúsculas, ordena y limita a 10 por grupo; la interfaz no reordena ni filtra.                                                                                                              |
| Desplegable                  | Grupos "Clientes" y "Servicios"; un grupo vacío se oculta. Estados: "Buscando…", "Sin resultados" y el aviso de error con "Reintentar".                                                                                                                                                  |
| Fila de cliente              | Nombre y teléfono.                                                                                                                                                                                                                                                                       |
| Fila de servicio             | Fecha y hora en la zona del negocio, tipo de servicio, cliente (`Cliente eliminado (alias)` si fue anonimizado), técnico (`Técnico eliminado (alias)`) y estado con ícono y texto; los cancelados muestran "Cancelado".                                                                  |
| Al elegir un cliente         | Abre `/customers/:id`.                                                                                                                                                                                                                                                                   |
| Al elegir un servicio        | Abre `/agenda?view=day&date=<día del servicio en la zona del negocio>&appointment=<id>`; la agenda carga ese día y abre la ficha.                                                                                                                                                        |
| Después de elegir            | Cierra el desplegable y vacía el campo.                                                                                                                                                                                                                                                  |
| Teclado y lector de pantalla | Patrón combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `listbox` con grupos y opciones). Flechas mueven la opción activa, Enter la abre, Escape cierra y deja el foco en el campo. Una región `role="status"` anuncia la cantidad de resultados. |

La pantalla Clientes y el selector de cliente de "Nuevo servicio" envían el texto tal cual a `GET /customers?search=` y muestran lo que responde la API: la coincidencia sin acentos ("maria" encuentra a "María") la hace la API, no el navegador.

### Grilla de escritorio

Desde 1024 px la agenda es una sola grilla de tiempo (`AgendaGrid.tsx`) con la vista de día (una columna) o la de semana (siete columnas con el mismo modelo). No hay vista Mes, ni arrastrar y soltar, ni franja de almuerzo, ni sombreado de horas no laborables: mover un servicio requiere el diálogo de cupos.

- **Estructura y accesibilidad:** la región desplazable se llama "Agenda del día" o "Agenda de la semana"; cada día es una `section` con un `h2`, una `ul` en orden cronológico (el orden de tabulación sigue al tiempo aunque la posición sea absoluta) y el eje de horas con `aria-hidden`. Cada servicio es un `button` con un nombre como "10:00 a 11:00, María Pérez, Instalación, técnico Juan Gómez, Confirmado" (más "técnico cambiado", "cierre anticipado" y el traslado si corresponden). La tarjeta muestra hora, cliente (`customerLabel`), tipo de servicio, las iniciales y el nombre del técnico, y el estado con ícono y texto. El buffer ocupado se dibuja como una cola rayada; los cancelados quedan atenuados y no suman buffer. Cada día tiene un botón "Nuevo servicio el vie 6 nov" que abre el alta con ese día.
- **Color:** cada técnico tiene un color de la paleta `--tech-1` a `--tech-10` (`technician-colors.ts`, `technician-view.ts`). Se asigna por antigüedad en la lista completa (`includeAnonymized=true`), así que eliminar o desactivar a otro técnico no cambia los colores. El mismo color se usa en la casilla del selector y en las tarjetas del día y de la semana (`data-color-index`). El color nunca es la única señal: la tarjeta lleva iniciales y nombre.
- **Solapes y "+N más":** los servicios que coinciden en el tiempo se reparten el ancho de la columna (`layoutDay`). Caben 6 columnas en el día y 2 en la semana (`maxColumns`). Si un grupo necesita más, se dibujan las primeras `maxColumns - 1` y la última lleva el botón "+N más" (nombre accesible "Ver 3 servicios más entre 10:00 y 11:30"), con N igual a los servicios ocultos. Con exactamente `maxColumns` servicios no hay botón.

  | Vista  | Columnas | 5 simultáneos | 6 simultáneos | 12 simultáneos |
  | ------ | -------- | ------------- | ------------- | -------------- |
  | Día    | 6        | 5, sin botón  | 6, sin botón  | 5 y "+7 más"   |
  | Semana | 2        | 1 y "+4 más"  | 1 y "+5 más"  | 1 y "+11 más"  |

  El botón abre la lista de ese día y franja: `display=list&view=day&date=D&from=HH:MM&to=HH:MM&technician=<elegidos>`. La franja va de la hora de inicio más temprana a la de fin más tardía de los servicios ocultos, redondeada a la fila de 15 minutos, y la lista incluye los servicios de los técnicos elegidos que se solapan con ella. "Volver a la grilla" quita `display`, `from`, `to` y los chips de técnico que puso el botón.

- **Selector de técnicos (`TechnicianSelector.tsx`):** un grupo de casillas "Técnicos", cada una con el color del técnico. Se pueden marcar hasta 10; al llegar al tope las demás se deshabilitan y aparece "Máximo 10 técnicos visibles". Lista a los técnicos activos y, además, a los desactivados o eliminados que tengan servicios (no cancelados, salvo que el interruptor los muestre) en el rango, con la marca "Inactivo". Sin selección guardada están marcados los 10 activos más antiguos. Si se desmarcan todos, la grilla muestra "Selecciona al menos un técnico".
- **Selección recordada (`technician-selection.ts`, `use-technician-selection.ts`):** se guarda en `localStorage['schedule-app.agenda.technicians']` como `{ "version": 1, "ids": [...] }`, por navegador y sin el negocio en la clave (hoy hay uno solo). `reconcileSelection(stored, technicians, idsWithServices, max = 10)` descarta los ids desconocidos, conserva a un técnico recordado que se desactivó o eliminó mientras tenga servicios en el rango visible, lo suelta cuando deja de tenerlos y vuelve a los 10 activos más antiguos si no queda nadie o el JSON, la versión o la lista no son válidos. Si el almacenamiento falla (modo privado, cuota), la selección sigue en memoria. Una selección vacía hecha por el dueño vale solo durante la sesión.
- **Horas visibles:** `useVisibleHours` (`visible-hours-api.ts`) hace una sola solicitud `GET /agenda/visible-hours?from&to&technicianIds=...` (el parámetro se repite, los ids van ordenados, clave `['technicians','visible-hours',{from,to,ids}]`) para los técnicos elegidos y el rango. `visibleMinutesOf` une los días que devuelve (el inicio más temprano y el fin más tardío, ignorando los `null`) y `visibleHoursFor(appointments, days, tz, base)` redondea el inicio hacia abajo y el fin hacia arriba a horas completas y amplía la ventana para que quepa todo servicio con su buffer. Sin disponibilidad en ningún día la base es 07:00-19:00. Mientras llega una ventana nueva la grilla conserva la anterior.
- **Cancelados:** ocultos por defecto en la grilla; el interruptor "Mostrar cancelados" (`cancelled=1`) los muestra. Los chips de la lista (estado, tipo de servicio) no aplican a la grilla.
- **Rendimiento:** solo se dibujan los servicios de los técnicos elegidos, `layoutDay` se memoriza por día y no hay solicitudes por técnico. El peor caso realista (10 técnicos por 8 servicios por 7 días, unos 560 botones) tiene una prueba de humo en `AgendaGrid.test.tsx`.

## Diálogos del servicio

Viven en `src/features/appointments/` y se abren desde la agenda: tocar un servicio abre su ficha (`AppointmentDetailDialog`) con Mover, Reasignar, Cancelar servicio, Cerrar servicio y Corregir cierre; el botón "+" de la columna de un técnico y el botón "Nuevo servicio" abren `CreateAppointmentDialog`. El diálogo abierto es estado local de `AgendaPage` (`AppointmentFlows.tsx`). Tras cada comando se muestra un aviso (`role="status"`) y se invalidan `['appointments']` y `['slots']`, así que la agenda se actualiza sin recargar.

- **Nuevo servicio**: se elige cliente (búsqueda por nombre o teléfono con `GET /customers?search=`, o alta inline con `+57` precargado; los eliminados no se pueden elegir), tipo de servicio activo y un cupo de `GET /slots` (ventana de 7 días desde una fecha editable). No existe un campo para escribir la hora: cada cupo es un botón de radio, operable con flechas. La dirección es siempre obligatoria, se precarga con la guardada del cliente y se puede editar. El técnico lo asigna la API; la persona puede elegir otro de `available_technician_ids` del cupo (si se abrió desde la columna de un técnico, arranca elegido). El servicio queda `confirmed`.
- **Mover**: pide los cupos de todos los técnicos con `excludeAppointmentId` y `preferredTechnicianId`. Al elegir un cupo indica si se mantiene el técnico o si cambia, y en ese caso avisa que el cliente se enterará en el futuro mensaje de reprogramación (en este sprint no se envía ningún mensaje).
- **Reasignar**: solo cambia el técnico, nunca la hora. Al abrirse pide `GET /appointments/:id/free-technicians` (`useFreeTechnicians`, clave `['appointments','free-technicians',id]`, sin caché entre aperturas) y ofrece como opciones de radio solo a los técnicos libres en el horario exacto del servicio; el técnico actual nunca aparece. Estados: "Buscando técnicos libres…" mientras carga, error con "Reintentar" si falla la consulta, y "No hay técnicos libres en este horario" (sin acción de confirmar) si la lista está vacía. Si otro ocupa el horario antes de confirmar, `POST /appointments/:id/reassign` responde `slot_taken`: el diálogo queda abierto con "Cupo ocupado", la lista se vuelve a pedir y la selección se descarta si ese técnico ya no está libre. `invalid_transition` y `not_found` refrescan la agenda.
- **Cancelar**: confirmación explícita con motivo opcional. Un servicio cancelado no se reabre.
- Los servicios `completed`, `no_show` y `cancelled` no se pueden mover, reasignar ni cancelar: las acciones quedan deshabilitadas con un texto que explica por qué. Para reabrir una cerrada se usa "Corregir cierre" (ver "Cierre del servicio").

## Cierre del servicio

La ficha del servicio (`AppointmentDetailDialog`) ofrece "Cerrar servicio" y "Corregir cierre". Cada botón se deshabilita con un texto visible según el estado: un servicio abierto (`pending`, `confirmed`) se cierra y no tiene cierre que corregir; una cerrada (`completed`, `no_show`) se corrige y no se vuelve a cerrar; uno cancelado no admite ninguna de las dos y el texto indica crear un servicio nuevo. Nada se cierra por el paso del tiempo: siempre hay una persona que confirma. Un servicio cerrado conserva su bloque de tiempo en la agenda (solo cancelar lo libera); el bloque muestra el estado en texto y color y, si se cerró antes de su hora, el marcador "Cierre anticipado" (`closed_early`).

- **Cierre normal** (`ClosureDialog.tsx`, `POST /appointments/:id/close`): desde la hora de inicio, paso 1 elige "Completado" o "No asistió" y una nota opcional; paso 2 pide confirmar y envía `confirm: true`. La nota se guarda en la auditoría.
- **Cierre anticipado**: si el servicio aún no empieza (la pantalla compara `starts_at` con la hora actual), el motivo es obligatorio y el paso 2 añade una advertencia y una casilla de confirmación reforzada; envía `confirm_early: true` y `reason`, sin `confirm`. La API decide al final: si responde `early_closure_reason_required` o `early_closure_confirmation_required`, el diálogo vuelve al paso 1 en modo anticipado. `closure_confirmation_required`, `invalid_transition`, `not_found` y los errores de campo (`validation_error`) se muestran en el diálogo; `invalid_transition` y `not_found` además refrescan la agenda; un error de red ofrece "Reintentar".
- **Corrección** (`CorrectionDialog.tsx`, `POST /appointments/:id/correct-closure`): desde Completado se puede cambiar a No asistió, cambiar la fecha y hora de completado (se envía `completed_at` como instante calculado con la zona horaria del negocio; no puede ser futura ni igual a la actual) o devolver el servicio a Confirmado; desde No asistió, cambiar a Completado o devolver a Confirmado. Todas exigen un motivo (`reason`). Devolver a Confirmado explica que se anula el seguimiento programado y se borra la fecha de completado, exige una casilla de confirmación reforzada y envía `confirm_reopen: true`.
- **Seguimiento**: la respuesta de la API no incluye la fecha del seguimiento, y que exista depende del consentimiento del cliente, del intervalo del tipo de servicio y de los servicios futuros. Por eso el aviso tras completar es genérico ("si el cliente autorizó seguimientos y el tipo de servicio tiene intervalo, se programa un mensaje de seguimiento") y aclara que en esta versión no se envían mensajes. Al reabrir se avisa que el seguimiento se anuló.
- Tras cada éxito se invalidan `['appointments']`, `['slots']` y `['customers']` (el historial del cliente cambia) y se muestra un aviso con `role="status"`.

Errores (`SubmitError.tsx`): `slot_taken` muestra "Cupo ocupado" y pide elegir otro cupo; `slot_not_offered` muestra su mensaje; ambos refrescan los cupos y limpian el cupo elegido. `invalid_transition` y `not_found` refrescan la agenda. `customer_anonymized` deselecciona al cliente. Los errores `validation_error` con campos se asocian al campo (`aria-describedby`). Un error de red ofrece "Reintentar".

## Clientes

Viven en `src/features/customers/`. Las consultas cuelgan de `['customers']` (`customers-api.ts`); crear, editar, registrar consentimiento o eliminar invalidan esa clave y, cuando cambia el nombre o la dirección que ven los servicios (editar y eliminar), también `['appointments']`.

- `/customers`: lista con búsqueda por nombre o teléfono (`GET /customers?search=`, con pausa de 250 ms al escribir; la API ignora acentos y mayúsculas) y la opción "Mostrar clientes eliminados" (`includeAnonymized`). Un cliente eliminado se muestra como "Cliente eliminado (alias)" y sin teléfono. "Nuevo cliente" abre el alta con `+57` precargado, dirección guardada y notas; el teléfono se normaliza a E.164 en la API y un duplicado (`customer_phone_taken`) se muestra en el campo del teléfono.
- `/customers/:id` (`CustomerDetailPage.tsx`): datos editables (solo se envía lo que cambió; vaciar la dirección o las notas las borra), estado del consentimiento (Pendiente, Otorgado o Revocado) con lo que implica para los mensajes, auditoría de autorizaciones (`GET /customers/:id/consents`: fecha declarada, medio, origen, quién la registró y notas) e historial de servicios del más reciente al más antiguo, con tipo de servicio, técnico (o "Técnico eliminado (alias)"), estado, dirección y precio copiados y el resultado de los servicios cerrados o cancelados. El historial es solo lectura: cerrar y corregir servicios se hace desde la ficha del servicio en la agenda.
- **Registrar autorización** (`ConsentDialog.tsx`): fecha (no futura, hoy por defecto), medio y notas. Los medios se muestran como "En persona", "Llamada telefónica", "WhatsApp", "Formulario o documento escrito" y "Otro" (`in_person`, `phone_call`, `whatsapp`, `written`, `other`). Sin medio no se envía. La fecha se envía como el inicio de ese día en la zona del negocio. Si la autorización tardía programa seguimientos, el aviso indica cuántos.
- **Revocar consentimiento**: mismo diálogo con `kind: revoked`. Explica que los mensajes pendientes se cancelan y que la ficha y el historial se conservan. Solo se ofrece con el consentimiento otorgado; con Pendiente o Revocado se ofrece registrar una autorización (un cliente puede volver a consentir).
- **Eliminar datos personales** (`EraseCustomerDialog.tsx`): `DELETE /customers/:id` anonimiza en sitio. El diálogo dice que el identificador y el historial se conservan, que nombre, teléfono, dirección y notas pasan a valores neutros, que los mensajes pendientes se cancelan y que no se puede deshacer. Después la ficha queda en solo lectura con "Cliente eliminado (alias)": sin edición, sin consentimiento y sin servicios nuevos.
- **Cliente con servicios futuros activos**: la API rechaza la eliminación con 409 `customer_has_future_appointments` y `affected`. El diálogo muestra "No se puede eliminar: el cliente tiene servicios futuros. Cancélalos primero.", lista cada servicio (fecha y hora en la zona del negocio, tipo de servicio, estado y técnico) y explica que los datos no se eliminarán hasta que el dueño los cancele; nunca cancela nada por su cuenta. Cada servicio enlaza a la agenda de su día (`/agenda?view=day&date=YYYY-MM-DD`), donde se abre y se cancela con el flujo habitual: la agenda no abre un servicio por su identificador, así que el enlace lleva al día y no a la ficha del servicio. Tras cancelar, el dueño vuelve a la ficha y repite la eliminación. Antes de pulsar el botón, la ficha avisa cuántos servicios `pending` o `confirmed` futuros hay, a partir del historial ya cargado (`future-appointments.ts`; es solo un aviso, la decisión es de la API).
- La API deja el alias también en `name` de un cliente anonimizado, así que la etiqueta se decide por `anonymized_at` (`customerRecordLabel` en `shared/lib/people.ts`).
- Errores: `customer_has_future_appointments` (409) lista los servicios en el diálogo y deja intentar de nuevo; `customer_anonymized` (409) y `not_found` recargan la ficha, que pasa a solo lectura; un error de red ofrece "Reintentar"; un cliente inexistente muestra el mensaje y un enlace a la lista.

## Sistema visual

Los tokens vienen del brief de diseño y se usan tal cual. Son variables CSS en `src/index.css` (convención de shadcn/ui), registradas en `@theme inline` como utilidades de Tailwind (`bg-card`, `text-brand`, `bg-event-blue-bg`...). Hay tema claro y oscuro con los mismos nombres (clase `.dark`, que `index.html` activa según `prefers-color-scheme`).

- Capas: `app-bg` (#F3F4F6, fondo general), `background` (#F9FAFB, contenido), `card` (#FFFFFF), `border` (#ECEDEF).
- Texto: `foreground`, `muted-foreground` (labels y subtítulos) y `text-subtle` (metadatos).
- Color: `primary` #4F7CF7 (estado activo y datos), `accent` (fondo suave del ítem activo), `brand` #E31937 (logo, toggle activo, CTA), `success`, `destructive`, `warning-from`/`warning-to` y sus fondos suaves.
- Eventos: `--event-{blue,purple,amber,red,green}-{bg,border,text}`. Los usan las variantes del `Badge` y, en la Fase 3, los bloques de la agenda.
- Forma: `--radius` 0,75 rem; tarjetas `rounded-xl` con `shadow-xs`; pills y botones de 8 px.
- Tipografía: Inter variable, autoalojada con `@fontsource-variable/inter` (solo subconjunto latino, sin CDN: la app funciona sin conexión).
- Componentes base: `Card`, `Badge` (variantes blue, purple, amber, red, green), `Sidebar` y `ToggleGroup` de shadcn/ui en `src/components/ui`, y `SegmentedControl` (`src/components/SegmentedControl.tsx`), que envuelve a `ToggleGroup`.

### Contraste

`src/theme/tokens.test.ts` mide el contraste de cada par texto/fondo en ambos temas. Algunos pares de la paleta del brief no llegan a AA (4,5:1) y se aceptan de forma explícita en `ACCEPTED_AA_EXCEPTIONS`: texto blanco sobre `primary` (3,78:1) y sobre `destructive` (3,76:1), `text-subtle` sobre blanco (2,54:1), `muted-foreground` sobre `muted` (4,39:1), `accent-foreground` sobre `accent` (4,05:1) y el texto verde de evento (4,49:1). La prueba falla si un par declarado empeora, si uno no declarado incumple o si uno declarado ya cumple y debe salir de la lista. El rojo de marca con texto blanco (4,71:1) sí cumple.

### Colores de técnicos

`--tech-1` a `--tech-10` definen el fondo tenue de la tarjeta; `--tech-N-foreground` es el texto y `--tech-N-accent` la franja izquierda. Tema claro: fondo 100, texto 900 y acento 600 de la escala de Tailwind; tema oscuro: fondo 950, texto 100 y acento 400. Los tonos son blue, emerald, amber, rose, violet, cyan, orange, lime, fuchsia y stone. Las pruebas exigen texto sobre fondo con 4,5:1 o más, acento contra `--card` con 3:1 o más y 10 acentos distintos. El color nunca es la única señal: la tarjeta muestra también el nombre del técnico.

`assignTechnicianColors` (`src/features/agenda/technician-colors.ts`) es una función pura. Recibe todos los técnicos del negocio (eliminados incluidos, `includeAnonymized=true`) y los ids visibles. El color preferido es el rango por antigüedad (`created_at`, luego `id`) módulo 10. Los visibles se recorren por antigüedad y, si el preferido ya está tomado dentro de la selección, se usa el siguiente libre. Con 10 técnicos o menos los colores no cambian nunca, y borrar a uno no mueve a los demás. Con más de 10, solo cambian ante un choque; si los 10 colores están tomados, el color se repite.

## PWA

Solo el shell es instalable. El service worker precachea JS, CSS, HTML e íconos, y **no guarda respuestas de la API**: sin conexión no hay datos de agenda. Cuando no hay red, la aplicación muestra la pantalla "Sin conexión" con el botón "Reintentar", que comprueba la conexión con una petición real a la API. Las opciones están en `pwa.config.ts`.

Para probarlo: `npm run build && npm run preview`, abre la aplicación, instálala desde el navegador y, en DevTools, activa "Offline" en la pestaña Network.

## Pruebas

Se escriben primero (TDD estricto, ver `openspec/config.yaml`). `src/test/setup.ts` levanta MSW con `onUnhandledFrame: 'error'`: una petición sin handler hace fallar la prueba. Cada prueba registra sus respuestas con `server.use(...)` de `src/test/server.ts`.

jsdom no implementa `matchMedia`. `src/test/viewport.ts` lo simula, se instala en `setup.ts` y arranca en ancho móvil (390 px) en cada prueba. Una prueba de escritorio llama a `setDesktopViewport()` (1280 px por defecto) y vuelve a móvil con `setMobileViewport()`; ambos disparan el evento `change` de los oyentes. Las pruebas de la grilla y de la agenda se ejecutan explícitamente como escritorio.

Las fechas que muestra la interfaz se formatean con `Intl.DateTimeFormat` en la zona horaria del negocio (`src/shared/lib/dates.ts`). La interfaz no calcula cupos ni horarios: eso lo hace la API.

## Texto de la interfaz

Todo el texto visible va en español neutro con tuteo, sin voseo. Los identificadores de código van en inglés.

### Vocabulario

Lo que se agenda para un cliente es un **servicio**; lo que el negocio ofrece es un **tipo de servicio**. Los identificadores, las rutas, las claves de consulta y la API siguen en inglés y no cambian.

| Texto de la interfaz                                                     | Código y API                                 |
| ------------------------------------------------------------------------ | -------------------------------------------- |
| Servicio ("Nuevo servicio", "Cancelar servicio", "Servicios pendientes") | `appointment`, `/appointments`               |
| Tipo de servicio ("Tipos de servicio", "Nuevo tipo de servicio")         | `service`, `/services`, `/settings/services` |

Los estados concuerdan en masculino con "servicio": Pendiente, Confirmado, Completado, No asistió y Cancelado (`features/agenda/appointment-status.ts`).

La palabra "cita" no se usa en ningún texto visible. `src/vocabulary.test.ts` lo comprueba con el compilador de TypeScript (`src/test/vocabulary-scan.ts`): recorre los literales de cadena, las plantillas y el texto JSX de `src/` (sin pruebas ni `schema.d.ts`), más `pwa.config.ts` e `index.html`, y falla ante "cita"/"citas" como palabra completa, ante voseo frecuente y ante "servicio" con el sentido de catálogo en los contextos listados en `CATALOG_CONTEXTS` (menú, pantallas y formulario del catálogo, mensaje `service_name_taken` y campo de tipo de servicio al crear un servicio). La lista de excepciones `VOCABULARY_EXCEPTIONS` está vacía.
