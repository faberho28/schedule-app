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

## Agenda

Vive en `src/features/agenda/`. La ruta `/agenda?view=day|week&date=YYYY-MM-DD` guarda la vista y la fecha en la URL; un valor ausente o inválido se reemplaza por la vista de día y por hoy en la zona horaria del negocio.

- `AgendaPage.tsx`: carga el negocio, los técnicos (`includeAnonymized=true`) y los servicios del rango con `GET /appointments?from&to` (fechas locales, ambas incluidas). Ofrece Día/Semana, anterior/siguiente, "Hoy" y un selector de fecha. Muestra las columnas de los técnicos activos y, además, las de los inactivos o eliminados que tengan servicios en el rango. Solo los activos ofrecen servicios nuevos.
- `AgendaGrid.tsx`: grilla con CSS propio, sin librería de calendario y sin arrastrar y soltar. La vista de día tiene una columna por técnico; la de semana, una sección por día con un carril por técnico. El filtro "Técnico" limita las columnas a una (útil en móvil). Cada servicio es un `button` con `aria-label` (hora, cliente, tipo de servicio, estado, técnico, cambio de técnico y traslado). El estado se indica con ícono, texto y el color del token `--status-*`. El buffer se dibuja como una cola rayada. Los cancelados se muestran atenuados y tachados, sin cola de buffer. Props: ver `AgendaGridProps` (contrato de D8; `technicians[].active` es opcional).
- `agenda-layout.ts`: funciones puras con las posiciones (`blockGeometry`), el reparto de ancho de bloques solapados (`packOverlaps`) y la ventana horaria (`visibleHoursFor`: 07:00 a 19:00, ampliada a horas en punto para que quepan todos los servicios). Mide en hora de pared de la zona del negocio: en un día con cambio de horario la hora que no existe queda como hueco y la repetida se superpone.
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
- Las consultas usan la clave `['appointments', ...]` (`agenda-api.ts`), así que `invalidateQueries({ queryKey: ['appointments'] })` refresca la agenda. `AgendaPage` abre los diálogos del servicio por defecto; sus props opcionales `onAppointmentSelect` y `onEmptyCellSelect` sustituyen esa apertura (las usan las pruebas de la pantalla).

## Diálogos del servicio

Viven en `src/features/appointments/` y se abren desde la agenda: tocar un servicio abre su ficha (`AppointmentDetailDialog`) con Mover, Reasignar, Cancelar servicio, Cerrar servicio y Corregir cierre; el botón "+" de la columna de un técnico y el botón "Nuevo servicio" abren `CreateAppointmentDialog`. El diálogo abierto es estado local de `AgendaPage` (`AppointmentFlows.tsx`). Tras cada comando se muestra un aviso (`role="status"`) y se invalidan `['appointments']` y `['slots']`, así que la agenda se actualiza sin recargar.

- **Nuevo servicio**: se elige cliente (búsqueda por nombre o teléfono con `GET /customers?search=`, o alta inline con `+57` precargado; los eliminados no se pueden elegir), tipo de servicio activo y un cupo de `GET /slots` (ventana de 7 días desde una fecha editable). No existe un campo para escribir la hora: cada cupo es un botón de radio, operable con flechas. La dirección es siempre obligatoria, se precarga con la guardada del cliente y se puede editar. El técnico lo asigna la API; la persona puede elegir otro de `available_technician_ids` del cupo (si se abrió desde la columna de un técnico, arranca elegido). El servicio queda `confirmed`.
- **Mover**: pide los cupos de todos los técnicos con `excludeAppointmentId` y `preferredTechnicianId`. Al elegir un cupo indica si se mantiene el técnico o si cambia, y en ese caso avisa que el cliente se enterará en el futuro mensaje de reprogramación (en este sprint no se envía ningún mensaje).
- **Reasignar**: solo cambia el técnico, nunca la hora. Ofrece a los demás técnicos activos. La API no expone la disponibilidad de un técnico a una hora arbitraria (`GET /slots` solo devuelve cupos de su grilla y la reasignación no la exige), así que la comprobación la hace `POST /appointments/:id/reassign`: si el elegido está ocupado responde `slot_taken` y el diálogo queda abierto para elegir a otro.
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

- `/customers`: lista con búsqueda por nombre o teléfono (`GET /customers?search=`, con pausa de 250 ms al escribir; la API no ignora acentos) y la opción "Mostrar clientes eliminados" (`includeAnonymized`). Un cliente eliminado se muestra como "Cliente eliminado (alias)" y sin teléfono. "Nuevo cliente" abre el alta con `+57` precargado, dirección guardada y notas; el teléfono se normaliza a E.164 en la API y un duplicado (`customer_phone_taken`) se muestra en el campo del teléfono.
- `/customers/:id` (`CustomerDetailPage.tsx`): datos editables (solo se envía lo que cambió; vaciar la dirección o las notas las borra), estado del consentimiento (Pendiente, Otorgado o Revocado) con lo que implica para los mensajes, auditoría de autorizaciones (`GET /customers/:id/consents`: fecha declarada, medio, origen, quién la registró y notas) e historial de servicios del más reciente al más antiguo, con tipo de servicio, técnico (o "Técnico eliminado (alias)"), estado, dirección y precio copiados y el resultado de los servicios cerrados o cancelados. El historial es solo lectura: cerrar y corregir servicios se hace desde la ficha del servicio en la agenda.
- **Registrar autorización** (`ConsentDialog.tsx`): fecha (no futura, hoy por defecto), medio y notas. Los medios se muestran como "En persona", "Llamada telefónica", "WhatsApp", "Formulario o documento escrito" y "Otro" (`in_person`, `phone_call`, `whatsapp`, `written`, `other`). Sin medio no se envía. La fecha se envía como el inicio de ese día en la zona del negocio. Si la autorización tardía programa seguimientos, el aviso indica cuántos.
- **Revocar consentimiento**: mismo diálogo con `kind: revoked`. Explica que los mensajes pendientes se cancelan y que la ficha y el historial se conservan. Solo se ofrece con el consentimiento otorgado; con Pendiente o Revocado se ofrece registrar una autorización (un cliente puede volver a consentir).
- **Eliminar datos personales** (`EraseCustomerDialog.tsx`): `DELETE /customers/:id` anonimiza en sitio. El diálogo dice que el identificador y el historial se conservan, que nombre, teléfono, dirección y notas pasan a valores neutros, que los mensajes pendientes se cancelan y que no se puede deshacer. Después la ficha queda en solo lectura con "Cliente eliminado (alias)": sin edición, sin consentimiento y sin servicios nuevos.
- **Cliente con servicios futuros activos**: la API rechaza la eliminación con 409 `customer_has_future_appointments` y `affected`. El diálogo muestra "No se puede eliminar: el cliente tiene servicios futuros. Cancélalos primero.", lista cada servicio (fecha y hora en la zona del negocio, tipo de servicio, estado y técnico) y explica que los datos no se eliminarán hasta que el dueño los cancele; nunca cancela nada por su cuenta. Cada servicio enlaza a la agenda de su día (`/agenda?view=day&date=YYYY-MM-DD`), donde se abre y se cancela con el flujo habitual: la agenda no abre un servicio por su identificador, así que el enlace lleva al día y no a la ficha del servicio. Tras cancelar, el dueño vuelve a la ficha y repite la eliminación. Antes de pulsar el botón, la ficha avisa cuántos servicios `pending` o `confirmed` futuros hay, a partir del historial ya cargado (`future-appointments.ts`; es solo un aviso, la decisión es de la API).
- La API deja el alias también en `name` de un cliente anonimizado, así que la etiqueta se decide por `anonymized_at` (`customerRecordLabel` en `shared/lib/people.ts`).
- Errores: `customer_has_future_appointments` (409) lista los servicios en el diálogo y deja intentar de nuevo; `customer_anonymized` (409) y `not_found` recargan la ficha, que pasa a solo lectura; un error de red ofrece "Reintentar"; un cliente inexistente muestra el mensaje y un enlace a la lista.

## Tema

Los colores son variables CSS en `src/index.css` (convención de shadcn/ui): azul primario `#2563EB`, neutros slate y un par fondo/texto por cada estado del servicio (`pending`, `confirmed`, `completed`, `no_show`, `cancelled`). Hay tema claro y oscuro (clase `.dark`, que `index.html` activa según `prefers-color-scheme`). `src/theme/tokens.test.ts` verifica que todos los pares cumplan contraste AA (4,5:1).

### Colores de técnicos

`--tech-1` a `--tech-10` definen el fondo tenue de la tarjeta; `--tech-N-foreground` es el texto y `--tech-N-accent` la franja izquierda. Tema claro: fondo 100, texto 900 y acento 600 de la escala de Tailwind; tema oscuro: fondo 950, texto 100 y acento 400. Los tonos son blue, emerald, amber, rose, violet, cyan, orange, lime, fuchsia y stone. Las pruebas exigen texto sobre fondo con 4,5:1 o más, acento contra `--card` con 3:1 o más y 10 acentos distintos. El color nunca es la única señal: la tarjeta muestra también el nombre del técnico.

`assignTechnicianColors` (`src/features/agenda/technician-colors.ts`) es una función pura. Recibe todos los técnicos del negocio (eliminados incluidos, `includeAnonymized=true`) y los ids visibles. El color preferido es el rango por antigüedad (`created_at`, luego `id`) módulo 10. Los visibles se recorren por antigüedad y, si el preferido ya está tomado dentro de la selección, se usa el siguiente libre. Con 10 técnicos o menos los colores no cambian nunca, y borrar a uno no mueve a los demás. Con más de 10, solo cambian ante un choque; si los 10 colores están tomados, el color se repite.

### Barra lateral

`--sidebar`, `--sidebar-foreground`, `--sidebar-muted-foreground`, `--sidebar-accent` (elemento activo, azul primario), `--sidebar-accent-foreground`, `--sidebar-hover` y `--sidebar-border` forman una barra oscura con la escala slate, en ambos temas. Cada par texto/fondo cumple AA en `tokens.test.ts`.

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
