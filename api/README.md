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

## Migraciones, siembra y tipos

Las migraciones usan el migrador de Kysely con SQL crudo (`up` y `down`) en `src/database/migrations/`. Kysely es solo el constructor de consultas; los `EXCLUDE`, rangos, índices parciales y triggers se escriben en SQL. La lista ordenada vive en `src/database/migrations/index.ts`.

| Comando               | Qué hace                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| `npm run db:migrate`  | Aplica las migraciones pendientes                                                  |
| `npm run db:rollback` | Revierte solo la última migración aplicada                                         |
| `npm run db:seed`     | Siembra el negocio con `DEFAULT_BUSINESS_ID` y zona `America/Bogota` (idempotente) |
| `npm run db:codegen`  | Regenera `src/database/db.generated.ts` desde la base migrada                      |

Los comandos leen `.env` si existe y, si no, las variables del entorno. Flujo local:

```bash
docker compose up -d --wait     # desde la raíz del repositorio
npm run db:migrate
npm run db:seed
npm run db:codegen              # solo cuando cambia el esquema; versionar el resultado
```

Para agregar una migración: crear `src/database/migrations/NNN_nombre.ts` con `up` y `down`, registrarla en `index.ts`, escribir antes la prueba de la restricción en `src/database/schema/*.int-spec.ts` y regenerar los tipos.

### Esquema

| Migración                | Contenido                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `001_core_schema`        | `btree_gist`, tipo `timerange`, `businesses`, `services`, `technicians`, `availability`, `time_off` |
| `002_customers_consent`  | `customers`, `consent_events` (solo inserción) y la función `audit_rows_append_only`                |
| `003_appointments`       | `appointments` (con `appointments_no_overlap`) y `appointment_closures` (solo inserción)            |
| `004_scheduled_messages` | `scheduled_messages`, unicidad de seguimientos y trigger de consentimiento                          |

Reglas que garantiza la base de datos:

- **Negocio**: `travel_buffer_min` entre 0 y 240; la zona horaria se valida al sembrar (zona IANA).
- **Aislamiento por negocio**: todas las tablas hijas llevan `business_id` y claves foráneas compuestas `(business_id, x_id)`; no se puede referenciar un registro de otro negocio.
- **Cruces**: `availability_no_overlap` y `time_off_no_overlap` (ignoran filas con `deleted_at`) y `appointments_no_overlap` sobre el bloque `[starts_at, ends_at + buffer_min)` de toda cita distinta de `cancelled`. Solo `cancelled` libera el bloque.
- **Clientes**: teléfono único por negocio, E.164 salvo anonimizados (marcador `anon-` más hexadecimales), alias único y `granted` exige `consent_at`.
- **Auditoría**: `consent_events` y `appointment_closures` rechazan `UPDATE` y `DELETE` (SQLSTATE `23000`), salvo vaciar el texto libre (`notes` y `reason`) para poder anonimizar.
- **Mensajes**: un mensaje por cita y tipo, un seguimiento pendiente por cliente y servicio, y un trigger impide filas `pending` si el cliente no está en `granted`.
- **Cierre anticipado**: `closed_early` exige `closure_reason`. Al anonimizar un cliente (fase 9) se debe usar texto neutro, no `NULL`, en esas citas.

### Errores de Postgres a errores de dominio

`DomainError` (`src/scheduling/domain/errors.ts`) lleva un `code` estable. `translatePgError` (`src/scheduling/infrastructure/persistence/pg-error-translator.ts`) convierte:

| Postgres                                    | Error de dominio       |
| ------------------------------------------- | ---------------------- |
| `23P01` sobre `appointments_no_overlap`     | `slot_taken`           |
| `23505` sobre `uq_customers_business_phone` | `customer_phone_taken` |
| `23505` sobre `uq_services_business_name`   | `service_name_taken`   |

Cualquier otro error se devuelve sin cambios; el uso previsto es `throw translatePgError(error)`.

## API HTTP

### Errores (`application/problem+json`)

El filtro global `ProblemDetailsFilter` (`src/shared/http/problem-details.filter.ts`) responde todo error como `application/problem+json` con los campos `type`, `title`, `status`, `detail` y `code`. Los errores de validación agregan `errors: [{ field, messages }]`.

| `code`                                                                                                                                           | Estado |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `validation_error`, `bad_request`                                                                                                                | 400    |
| `not_found` (incluye rutas inexistentes)                                                                                                         | 404    |
| `slot_taken`, `schedule_conflict`, `schedule_overlap`, `proposal_stale`, `customer_phone_taken`, `service_name_taken`                            | 409    |
| `invalid_transition`, `slot_not_offered`, `early_closure_reason_required`, `early_closure_confirmation_required`, `reopen_confirmation_required` | 422    |
| `internal_error` (y cualquier `DomainError` sin estado asignado)                                                                                 | 500    |

Los errores inesperados no exponen su mensaje interno; solo se registran en el log del servidor. La validación de cuerpos usa `class-validator` con `whitelist` y `forbidNonWhitelisted`: una propiedad desconocida (por ejemplo `timezone` en `PATCH /business`) se rechaza con 400.

### Negocio y servicios

`BusinessContext` resuelve siempre `DEFAULT_BUSINESS_ID` hasta que exista autenticación. Los repositorios reciben el `businessId` en cada método y filtran por él. Los campos del cuerpo y de las respuestas usan `snake_case` (como en las especificaciones) y los parámetros de consulta usan `camelCase`.

| Método y ruta         | Descripción                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /business`       | `id`, `name`, `timezone` (solo lectura), `travel_buffer_min` y `followup_send_time` (por defecto `09:00`).          |
| `PATCH /business`     | Edita `travel_buffer_min` (entero 0 a 240) y `followup_send_time` (`HH:MM`). Cualquier otro campo se rechaza (400). |
| `GET /services`       | Servicios activos. `?includeInactive=true` suma los inactivos. Los servicios con `deleted_at` nunca se listan.      |
| `GET /services/:id`   | Un servicio (activo o inactivo); 404 si no existe o tiene `deleted_at`.                                             |
| `POST /services`      | Crea un servicio (`name`, `duration_min`, `price`, `followup_interval_days` opcional). 409 si el nombre se repite.  |
| `PATCH /services/:id` | Edita campos y reactiva o desactiva con `active`. Si cambia `duration_min`, la respuesta incluye `warning`.         |

No existe `DELETE` de servicios: se desactivan con `PATCH { "active": false }`. Editar un servicio nunca modifica las citas existentes, que conservan sus copias de precio, nombre y duración.

La advertencia de `PATCH /services/:id` es informativa y no bloquea el cambio: `warning: { code: 'future_appointments_keep_previous_duration', count }` cuando hay `count` citas futuras `pending` o `confirmed`, o `warning: null` si no las hay.

### Técnicos

| Método y ruta                       | Descripción                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /technicians`                  | Técnicos del negocio, activos e inactivos. Los anonimizados se excluyen; `?includeAnonymized=true` los suma.  |
| `GET /technicians/:id`              | Un técnico (también anonimizado, con `alias` y sin `name` ni `phone`); 404 si no existe en el negocio.        |
| `POST /technicians`                 | Crea un técnico activo (`name` obligatorio, `phone` opcional).                                                |
| `PATCH /technicians/:id`            | Edita `name` y `phone` (`null` borra el teléfono). 404 si el técnico está anonimizado.                        |
| `GET /technicians/:id/availability` | Franjas semanales `{ id, weekday (1 a 7, ISO), start_time, end_time }` en hora local `HH:MM`, por día y hora. |
| `GET /technicians/:id/time-off`     | Días libres `{ id, starts_at, ends_at, reason }` con instantes ISO 8601 UTC, por fecha de inicio.             |

`active`, la disponibilidad y los días libres son de solo lectura en estos endpoints: un `PATCH` que incluya `active` (o cualquier campo no declarado) responde 400 `validation_error`. Se escriben únicamente por el flujo de cambios de horario (ver "Cambios de horario y eliminación de técnicos"), que valida las citas afectadas. Las pruebas preparan técnicos, franjas, días libres y citas con las fábricas de `test/support/factories.ts`.

Las rutas de escritura de horario viven en `ScheduleChangesController` (`scheduling/infrastructure/http`) bajo el mismo prefijo `/technicians`:

| Método y ruta                                    | Descripción                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `POST /technicians/:id/schedule-changes/preview` | Solo lectura: citas afectadas por un cambio y propuesta de reasignación (200).                                 |
| `POST /technicians/:id/schedule-changes`         | Aplica un cambio (200): día libre, quitar día libre, reemplazar disponibilidad, desactivar o reactivar.        |
| `DELETE /technicians/:id`                        | Elimina al técnico por anonimización (200). Mismo flujo con `change = erase`; cuerpo opcional `reassignments`. |

### Transacciones por negocio

`TransactionRunner.run(businessId, work)` abre una transacción `READ COMMITTED` y fija `app.business_id` solo para esa transacción (`set_config(..., true)`, equivalente a `SET LOCAL`). Hoy no hay Row Level Security; la variable deja lista esa política como una migración aislada.

## Dominio de agendamiento

`src/scheduling/domain/` contiene funciones puras de TypeScript, sin Nest, Kysely ni Postgres (una prueba lo verifica). Los instantes son milisegundos desde la época Unix y los rangos son semiabiertos `[start, end)`.

| Archivo                               | Responsabilidad                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `time/zoned-clock.ts`                 | Único lugar donde se convierte fecha y hora locales de una zona IANA a instantes (Luxon). Hora inexistente avanza; hora ambigua toma la primera ocurrencia.        |
| `services/generate-slots.ts`          | `generateSlots`: cupos adaptativos por técnico y franja, agrupados por inicio. Recibe los bloques ocupados ya calculados.                                          |
| `services/occupied-blocks.ts`         | Bloque ocupado de una cita `[starts_at, ends_at + buffer_min)`. Solo `cancelled` lo libera. `excludeAppointmentId` libera el bloque propio al mover.               |
| `services/assign-technician.ts`       | `assignTechnician`: técnico preferido si está libre; si no, el de menos minutos agendados. Devuelve `null` si no hay técnicos libres.                              |
| `services/technician-load.ts`         | Minutos de servicio por técnico en un día local (sin buffer, sin canceladas).                                                                                      |
| `services/appointment-status.ts`      | Máquina de estados de la cita (D11) y `invalid_transition`.                                                                                                        |
| `services/book-slot.ts`               | `bookSlot`: técnico que atiende una hora pedida, o `slot_taken` / `slot_not_offered` si no se puede. Acepta un técnico pedido (restringe) o preferido (prioridad). |
| `services/technician-availability.ts` | `isTechnicianFree`: el técnico trabaja en un horario exacto y su bloque ocupado no choca con el de la cita (reasignación manual).                                  |
| `services/schedule-change.ts`         | `findAffectedAppointments`: citas `pending`/`confirmed` desde `now` que un `ScheduleChange` (modelo en `model/schedule-change.ts`) deja sin cobertura.             |
| `services/plan-reassignments.ts`      | `planReassignments` (propuesta cronológica con carga y ocupación en memoria) y `findUnavailableTargets` (verifica los destinos al aplicar).                        |
| `services/availability-windows.ts`    | `validateAvailabilityWindows`: día 1 a 7, horas `HH:MM` hasta 23:59, fin posterior al inicio y sin solapes por día.                                                |
| `services/alias.ts`                   | `generateAlias`: alias aleatorio `palabra_número` que no esté ya usado en el negocio.                                                                              |
| `ports/`                              | Interfaces de persistencia (`AppointmentRepository`, `ScheduleReader`, `CustomerDirectory`) y `CommandExecutor`. Solo tipos: el dominio no importa adaptadores.    |

Reglas de `generateSlots`:

- El primer cupo de cada franja empieza al inicio de la franja; el siguiente, al terminar el bloque anterior (servicio más buffer).
- El servicio debe caber completo en la franja y no cruzar un día libre. El buffer final puede salirse de la franja o invadir un día libre, pero no cruzar la cita siguiente.
- Los cupos anteriores a `now` se omiten sin mover la cadena; un cupo que empieza exactamente en `now` se ofrece.
- `SlotCandidate.technicianIds` lista a los técnicos libres en ese inicio, ordenados por antigüedad (`createdAt`, luego `id`). `assignTechnician` desempata por esa posición.
- Las franjas se convierten a instantes reales: en el retroceso de otoño una franja `00:00-03:00` dura cuatro horas reales y cada instante se ofrece una sola vez.

## Cupos y citas

Estructura hexagonal de `src/scheduling/`: `domain/` (funciones puras y puertos), `application/` (casos de uso sin Nest: `ListSlots`, `CreateAppointment`, `CancelAppointment`, `MoveAppointment`, `ReassignAppointment`, `PreviewScheduleChange`, `ApplyScheduleChange`, `QueryAppointments` y `loadDaySchedule`), `infrastructure/` (adaptadores de Kysely, controladores, DTO) y `scheduling.module.ts`, que cablea todo con los tokens de `application/tokens.ts` (`CLOCK`, `COMMAND_EXECUTOR`, `READ_PORTS`). Las pruebas fijan el reloj con `createTestApp({ now })`.

### Ejecutor de comandos y bloqueo del negocio

`BusinessLockExecutor` (`infrastructure/persistence/business-lock-executor.ts`) ejecuta cada comando de agenda en una transacción `READ COMMITTED` que empieza con `SELECT id FROM businesses WHERE id = $1 FOR UPDATE`. Dos comandos del mismo negocio se serializan; negocios distintos no se bloquean entre sí. Si el comando falla, la transacción se revierte y el bloqueo se libera. `appointments_no_overlap` sigue siendo la última defensa: aun sin el bloqueo, una colisión falla con `23P01` y se traduce a `slot_taken`. El bloqueo evita además el falso conflicto entre dos solicitudes automáticas que elegirían al mismo técnico libre.

### Endpoints

| Método y ruta                     | Descripción                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /slots`                      | Cupos de un servicio. Consulta: `serviceId`, `from` (`AAAA-MM-DD`, día local), `days` (1 a 31, por defecto 1), `excludeAppointmentId` y `preferredTechnicianId` opcionales. Responde `{ slots, has_availability }`. |
| `POST /appointments`              | Crea una cita `confirmed` (201). Cuerpo: `customer_id`, `service_id`, `starts_at` (ISO 8601 con zona), `address` (obligatoria) y `technician_id` opcional.                                                          |
| `POST /appointments/:id/cancel`   | Cancela una cita `pending` o `confirmed` (200). Cuerpo opcional: `reason`. Libera el bloque y anula sus mensajes programados pendientes.                                                                            |
| `POST /appointments/:id/move`     | Mueve una cita `pending` o `confirmed` a un cupo generado (200). Cuerpo: `starts_at` (ISO 8601 con zona). Ver "Mover y reasignar".                                                                                  |
| `POST /appointments/:id/reassign` | Cambia solo el técnico de una cita `pending` o `confirmed` (200). Cuerpo: `technician_id`. Ver "Mover y reasignar".                                                                                                 |
| `GET /appointments`               | Citas de cualquier estado con técnico, cliente y servicio. Consulta: `from` y `to` (días locales, ambos incluidos, hasta 62 días), ordenadas por inicio.                                                            |
| `GET /appointments/:id`           | Detalle de una cita (404 si no existe en el negocio).                                                                                                                                                               |

Cada cupo de `GET /slots` es `{ starts_at, ends_at, occupied_until, technician_id, available_technician_ids }`: un inicio aparece una sola vez con el técnico asignado, y `available_technician_ids` (por antigüedad) alimenta la reasignación manual. Sin técnicos, con un servicio inactivo o sin huecos, `slots` es `[]` y `has_availability` es `false`. Los instantes se devuelven en ISO 8601 UTC.

Con `excludeAppointmentId` (mover una cita) su bloque y su carga no cuentan: `loadDaySchedule` retira la cita antes de calcular ocupación y minutos agendados, porque `bookedMinutesByTechnician` del dominio no conoce ese parámetro. `MoveAppointment` y `ReassignAppointment` usan esa misma función y no calculan la carga por su cuenta; `day-schedule.spec.ts` verifica que los minutos de la cita movida no se cuentan a nadie. Como el técnico actual tiene prioridad cuando está libre, esta exclusión solo cambia el resultado cuando se consultan cupos sin `preferredTechnicianId`.

### Flujo de `POST /appointments`

```
BEGIN (READ COMMITTED); SELECT ... FROM businesses WHERE id = $1 FOR UPDATE
  leer zona horaria y buffer del negocio, servicio y cliente  (404 si no existen)
  servicio inactivo                                         -> slot_not_offered (422)
  cargar técnicos reservables, días libres y bloques ocupados del día local
  bookSlot: regenerar los cupos del día con la agenda ya confirmada
    la hora es un cupo y hay técnico libre                   -> asignar (menos cargado; técnico pedido si está libre)
    no es un cupo y choca con el bloque de una cita          -> slot_taken (409)
    cualquier otro caso                                      -> slot_not_offered (422)
  INSERT appointments (confirmed, snapshots, buffer_min, slot = [inicio, fin + buffer))
  UPDATE customers SET address = <dirección usada> si cambió
COMMIT
```

La colisión se evalúa antes que la pertenencia a la grilla. "Choca" significa que todos los técnicos relevantes (los que trabajan a esa hora o tienen un bloque que se solapa) tienen una cita no cancelada encima; con `technician_id` solo cuenta ese técnico. El bloque de `completed`, `no_show` y las citas cerradas antes de tiempo se conserva; solo `cancelled` lo libera. La dirección se copia en `address_snapshot` y la última dirección usada reemplaza a `customers.address`; el precio, el nombre del servicio y el buffer también se copian y no cambian con ediciones posteriores.

### Mover y reasignar

Ambos comandos corren bajo el mismo bloqueo del negocio que la creación. Solo aplican a citas `pending` o `confirmed`; una `completed` o `no_show` debe reabrirse antes y una `cancelled` no se reabre. Los dos responden `invalid_transition` (422) y no modifican la cita.

**`POST /appointments/:id/move`**

```
BEGIN; SELECT ... FROM businesses WHERE id = $1 FOR UPDATE
  leer la cita (404) y exigir pending|confirmed                -> invalid_transition (422)
  cargar el día destino sin el bloque ni la carga de la cita   (excludeAppointmentId)
  bookSlot con el técnico actual como preferido                -> el mismo flujo que crear
    la hora es un cupo: gana el técnico actual si está libre; si no, el menos cargado
    no es un cupo y choca con una cita                          -> slot_taken (409)
    cualquier otro caso                                         -> slot_not_offered (422)
  UPDATE appointments SET technician_id, starts_at, ends_at, buffer_min, slot
         [, technician_changed = true si el técnico cambió]
COMMIT
```

- Se ofrecen cupos de todos los técnicos. La cita no choca con su propio bloque anterior, así que un cupo que lo solapa (por ejemplo 09:15 para una cita de 10:00 con buffer 15) es válido.
- La duración sale de la propia cita, no del servicio, que pudo cambiar después de crearla. Servicio, dirección y precio se conservan. Solo `buffer_min` se toma de nuevo del negocio (D1), y con él se recalcula el bloque.
- `technician_changed` pasa a `true` cuando cambia el técnico. Si no cambia, la marca queda como estaba: mover no la borra. Esta marca servirá para que el mensaje de reprogramación del bot mencione el cambio; en este sprint no se envía nada.
- Si otra solicitud ocupó el cupo entre listarlo y confirmar, la respuesta es `slot_taken` y la cita conserva su horario. La actualización es una sola sentencia: no existe un estado intermedio sin bloque.
- La especificación no dice qué pasa con los mensajes programados de una cita movida, así que no se tocan.
- Mover una cita cuyo servicio se desactivó después sí se permite: la desactivación solo evita citas nuevas.

**`POST /appointments/:id/reassign`**

- Cambia solo el técnico; la hora no cambia y la cita queda con `technician_changed = true`.
- El destino debe ser un técnico activo y no anonimizado, trabajar en ese horario exacto (franja semanal que contiene el servicio, sin día libre encima) y no tener un bloque ocupado que se solape con el de la cita, buffer incluido. No se exige que la hora pertenezca a su grilla de cupos.
- Un destino que existe pero no cumple (ocupado, sin franja ese día u hora, con día libre, inactivo o anonimizado) responde `slot_taken` (409) y la cita no cambia. Un técnico que no existe en el negocio responde `not_found`.
- Reasignar al técnico que ya tiene la cita responde 200 sin cambios y sin marcar `technician_changed`.
- Este endpoint también sirve para resolver a mano las citas sin reemplazo de una propuesta de reasignación (fase 8).

### Códigos de error del flujo

| Código               | Estado | Cuándo                                                                                                                         |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `validation_error`   | 400    | Dirección ausente o vacía, UUID o fecha inválidos, `starts_at` sin zona, rango de agenda inválido.                             |
| `not_found`          | 404    | Cliente, servicio, cita o técnico de la ruta inexistente en el negocio.                                                        |
| `slot_taken`         | 409    | La hora pedida choca con el bloque (duración más buffer) de una cita no cancelada, incluida una concurrente.                   |
| `slot_not_offered`   | 422    | La hora no es un cupo generado y no choca con ninguna cita; también servicio o técnico pedido no reservable.                   |
| `invalid_transition` | 422    | Cancelar, mover o reasignar una cita `cancelled`, `completed` o `no_show`. Una cancelada no se reabre: se crea una cita nueva. |

## Cambios de horario y eliminación de técnicos

Toda escritura de disponibilidad, días libres o `active` de un técnico, y su eliminación, pasa por `ApplyScheduleChange`. `PreviewScheduleChange` calcula lo mismo sin escribir. Los dos comparten `evaluateScheduleChange` (`application/schedule-change-evaluation.ts`).

### Cambios admitidos

Cuerpo de ambos `POST` (`snake_case`): `{ "change": { ... }, "reassignments": [{ "appointment_id", "technician_id" }] }`. La vista previa solo recibe `change`.

| `change.type`          | Campos                                                                               | Cita afectada                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `add_time_off`         | `starts_at`, `ends_at` (ISO 8601 con zona, fin posterior al inicio), `reason`        | El servicio de la cita (sin buffer) se solapa con el período.               |
| `remove_time_off`      | `time_off_id`                                                                        | Ninguna. Es baja lógica (`deleted_at`); 404 si no existe o ya se quitó.     |
| `replace_availability` | `windows: [{ weekday (1 a 7), start_time, end_time }]` (reemplaza todas las franjas) | El servicio no cabe completo en una franja nueva (el buffer puede salirse). |
| `deactivate`           | ninguno                                                                              | Toda cita activa futura.                                                    |
| `activate`             | ninguno                                                                              | Ninguna. No necesita `reassignments`.                                       |
| `erase`                | ninguno (solo por `DELETE /technicians/:id` y en la vista previa)                    | Toda cita activa futura.                                                    |

Una cita afectada es `pending` o `confirmed` con `starts_at >= now`. Los campos que no corresponden al `type` se rechazan con 400. Un técnico inexistente, de otro negocio o ya anonimizado responde 404 en todos los casos, incluida una segunda eliminación.

### Flujo

```mermaid
sequenceDiagram
  participant UI as app
  participant C as ScheduleChangesController
  participant P as PreviewScheduleChange
  participant A as ApplyScheduleChange
  participant DB as Postgres
  UI->>C: POST /technicians/:id/schedule-changes/preview {change}
  C->>P: execute (solo lectura, sin bloqueo)
  P->>DB: citas activas futuras, técnicos reservables y su ocupación
  P-->>UI: {affected[], proposal[], fully_resolvable}
  UI->>C: POST /technicians/:id/schedule-changes {change, reassignments[]}
  C->>A: execute
  A->>DB: BEGIN; SELECT ... FROM businesses FOR UPDATE
  A->>A: recalcular afectadas
  alt hay afectadas y reassignments vacío
    A-->>UI: 409 schedule_conflict {affected, proposal, fully_resolvable}
  else las citas reasignadas no son exactamente las afectadas
    A-->>UI: 409 proposal_stale {affected, proposal, fully_resolvable}
  else un destino no puede atender su cita
    A-->>UI: 409 slot_taken
  else ok
    A->>DB: UPDATE appointments SET technician_id, technician_changed = true
    A->>DB: aplicar el cambio (time_off / availability / active / anonimizar)
    A->>DB: COMMIT
    A-->>UI: 200 {technician, reassignments}
  end
```

- La propuesta cambia solo el técnico, nunca el horario. Para cada cita afectada, en orden cronológico, busca técnicos activos y no anonimizados libres en ese horario exacto (el bloque de la cita con su propio buffer no choca con su ocupación) y aplica la regla de `slot-availability`: menos minutos agendados ese día, desempate por `created_at` y luego `id`. El técnico que cambia nunca es destino. Cada cita propuesta suma su bloque y sus minutos para las siguientes.
- Es todo o nada. Una cita sin reemplazo queda con `to_technician_id: null` y `fully_resolvable: false`; el cambio sigue bloqueado hasta que el dueño la resuelva a mano (`POST /appointments/:id/reassign`, mover o cancelar) y repita el cambio. Rechazar la propuesta es no enviarla: no se guarda nada.
- `reassignments` vacío con citas afectadas es `schedule_conflict`. Con citas afectadas y un conjunto de `reassignments` distinto del afectado (cita nueva, cancelada o faltante) es `proposal_stale`, con la propuesta recalculada. Un destino que existe pero no puede atender la cita (ocupado, sin franja, con día libre, inactivo, anonimizado o el mismo técnico) es `slot_taken`; uno inexistente es `not_found`. Cualquier error revierte todo.
- Los 409 `schedule_conflict` y `proposal_stale` agregan al problema `affected` (citas con la forma de `GET /appointments/:id`), `proposal` (`{ appointment_id, from_technician_id, to_technician_id | null }`) y `fully_resolvable`.
- La respuesta de éxito es `{ technician: { id, name, phone, active, alias, anonymized_at }, reassignments: [{ appointment_id, technician_id }] }`.
- Al bloquear la fila del negocio, un día libre, una desactivación o una eliminación nunca coexisten con una reserva del mismo horario: gana el que llega primero y el otro recibe el error (`schedule_conflict` para el cambio, `slot_not_offered` o `slot_taken` para la reserva). Las pruebas de `schedule-changes-concurrency.http.int-spec.ts` lo verifican con conexiones reales.

### Validación de disponibilidad

`start_time` y `end_time` son `HH:MM` hasta `23:59`; `24:00` (que Postgres acepta, pero la hora local del dominio no) se rechaza con 400 antes de llegar a la base. El fin debe ser posterior al inicio y las franjas del mismo día no pueden solaparse (se tocan en el borde sin problema). Cada error indica el campo, por ejemplo `change.windows.0.end_time`. Si la base detecta un solape que la validación no vio (dos días libres que se solapan), el error de exclusión se traduce a `schedule_overlap` (409).

### Eliminación de técnicos

`DELETE /technicians/:id` invoca el mismo caso de uso con `change = erase`. Con citas futuras activas responde `schedule_conflict` (409) y el técnico conserva su nombre y teléfono. Cuando no queda ninguna (el cuerpo trae las `reassignments` de la propuesta, aplicadas en la misma transacción), anonimiza en sitio: `name` y `phone` en nulo, `anonymized_at`, `active = false` y un alias aleatorio único por negocio (por ejemplo `tiger_1`), que la interfaz muestra como "Técnico eliminado (tiger_1)". Las citas y el historial se conservan atribuidos al alias. El alias sale de `crypto.randomInt` y de una lista fija de palabras, nunca de datos de la persona, y no se guarda ninguna correspondencia persona-alias (una prueba revisa que el nombre y el teléfono originales no queden en ninguna tabla). El registro de supresiones con HMAC es deuda técnica fuera del sprint 1.

## Pruebas

- Runner: Vitest con `unplugin-swc` (conserva los metadatos de decoradores de Nest).
- Dos proyectos de Vitest: `unit` (dominio puro, sin Docker) e `integration`.
- Integración: `test/support/postgres-container.ts` actúa como `globalSetup`. Levanta un único contenedor `postgres:16-alpine` con Testcontainers por ejecución, aplica todas las migraciones y publica la URL con `inject('databaseUrl')`. Las pruebas de migraciones usan una base vacía propia (`test/support/scratch-database.ts`) y las de restricciones insertan con SQL crudo (`test/support/schema-fixtures.ts`). Entre pruebas se usa `truncateAll(pool)`; no hay rollback por prueba porque las pruebas de concurrencia necesitan conexiones reales.
- La primera ejecución descarga la imagen de Postgres y puede tardar más.
