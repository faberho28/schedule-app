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
| `slot_taken`, `schedule_conflict`, `proposal_stale`, `customer_phone_taken`, `service_name_taken`                                                | 409    |
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

`active`, la disponibilidad y los días libres son de solo lectura en estos endpoints: un `PATCH` que incluya `active` (o cualquier campo no declarado) responde 400 `validation_error`. Se escriben únicamente por el flujo de cambios de horario, que valida las citas afectadas. Las pruebas preparan técnicos, franjas, días libres y citas con las fábricas de `test/support/factories.ts`.

### Transacciones por negocio

`TransactionRunner.run(businessId, work)` abre una transacción `READ COMMITTED` y fija `app.business_id` solo para esa transacción (`set_config(..., true)`, equivalente a `SET LOCAL`). Hoy no hay Row Level Security; la variable deja lista esa política como una migración aislada.

## Dominio de agendamiento

`src/scheduling/domain/` contiene funciones puras de TypeScript, sin Nest, Kysely ni Postgres (una prueba lo verifica). Los instantes son milisegundos desde la época Unix y los rangos son semiabiertos `[start, end)`.

| Archivo                          | Responsabilidad                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time/zoned-clock.ts`            | Único lugar donde se convierte fecha y hora locales de una zona IANA a instantes (Luxon). Hora inexistente avanza; hora ambigua toma la primera ocurrencia.     |
| `services/generate-slots.ts`     | `generateSlots`: cupos adaptativos por técnico y franja, agrupados por inicio. Recibe los bloques ocupados ya calculados.                                       |
| `services/occupied-blocks.ts`    | Bloque ocupado de una cita `[starts_at, ends_at + buffer_min)`. Solo `cancelled` lo libera. `excludeAppointmentId` libera el bloque propio al mover.            |
| `services/assign-technician.ts`  | `assignTechnician`: técnico preferido si está libre; si no, el de menos minutos agendados. Devuelve `null` si no hay técnicos libres.                           |
| `services/technician-load.ts`    | Minutos de servicio por técnico en un día local (sin buffer, sin canceladas).                                                                                   |
| `services/appointment-status.ts` | Máquina de estados de la cita (D11) y `invalid_transition`.                                                                                                     |
| `services/book-slot.ts`          | `bookSlot`: técnico que atiende una hora pedida, o `slot_taken` / `slot_not_offered` si no se puede.                                                            |
| `ports/`                         | Interfaces de persistencia (`AppointmentRepository`, `ScheduleReader`, `CustomerDirectory`) y `CommandExecutor`. Solo tipos: el dominio no importa adaptadores. |

Reglas de `generateSlots`:

- El primer cupo de cada franja empieza al inicio de la franja; el siguiente, al terminar el bloque anterior (servicio más buffer).
- El servicio debe caber completo en la franja y no cruzar un día libre. El buffer final puede salirse de la franja o invadir un día libre, pero no cruzar la cita siguiente.
- Los cupos anteriores a `now` se omiten sin mover la cadena; un cupo que empieza exactamente en `now` se ofrece.
- `SlotCandidate.technicianIds` lista a los técnicos libres en ese inicio, ordenados por antigüedad (`createdAt`, luego `id`). `assignTechnician` desempata por esa posición.
- Las franjas se convierten a instantes reales: en el retroceso de otoño una franja `00:00-03:00` dura cuatro horas reales y cada instante se ofrece una sola vez.

## Cupos y citas

Estructura hexagonal de `src/scheduling/`: `domain/` (funciones puras y puertos), `application/` (casos de uso sin Nest: `ListSlots`, `CreateAppointment`, `CancelAppointment`, `QueryAppointments` y `loadDaySchedule`), `infrastructure/` (adaptadores de Kysely, controladores, DTO) y `scheduling.module.ts`, que cablea todo con los tokens de `application/tokens.ts` (`CLOCK`, `COMMAND_EXECUTOR`, `READ_PORTS`). Las pruebas fijan el reloj con `createTestApp({ now })`.

### Ejecutor de comandos y bloqueo del negocio

`BusinessLockExecutor` (`infrastructure/persistence/business-lock-executor.ts`) ejecuta cada comando de agenda en una transacción `READ COMMITTED` que empieza con `SELECT id FROM businesses WHERE id = $1 FOR UPDATE`. Dos comandos del mismo negocio se serializan; negocios distintos no se bloquean entre sí. Si el comando falla, la transacción se revierte y el bloqueo se libera. `appointments_no_overlap` sigue siendo la última defensa: aun sin el bloqueo, una colisión falla con `23P01` y se traduce a `slot_taken`. El bloqueo evita además el falso conflicto entre dos solicitudes automáticas que elegirían al mismo técnico libre.

### Endpoints

| Método y ruta                   | Descripción                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /slots`                    | Cupos de un servicio. Consulta: `serviceId`, `from` (`AAAA-MM-DD`, día local), `days` (1 a 31, por defecto 1), `excludeAppointmentId` y `preferredTechnicianId` opcionales. Responde `{ slots, has_availability }`. |
| `POST /appointments`            | Crea una cita `confirmed` (201). Cuerpo: `customer_id`, `service_id`, `starts_at` (ISO 8601 con zona), `address` (obligatoria) y `technician_id` opcional.                                                          |
| `POST /appointments/:id/cancel` | Cancela una cita `pending` o `confirmed` (200). Cuerpo opcional: `reason`. Libera el bloque y anula sus mensajes programados pendientes.                                                                            |
| `GET /appointments`             | Citas de cualquier estado con técnico, cliente y servicio. Consulta: `from` y `to` (días locales, ambos incluidos, hasta 62 días), ordenadas por inicio.                                                            |
| `GET /appointments/:id`         | Detalle de una cita (404 si no existe en el negocio).                                                                                                                                                               |

Cada cupo de `GET /slots` es `{ starts_at, ends_at, occupied_until, technician_id, available_technician_ids }`: un inicio aparece una sola vez con el técnico asignado, y `available_technician_ids` (por antigüedad) alimenta la reasignación manual. Sin técnicos, con un servicio inactivo o sin huecos, `slots` es `[]` y `has_availability` es `false`. Los instantes se devuelven en ISO 8601 UTC.

Con `excludeAppointmentId` (mover una cita) su bloque y su carga no cuentan: `loadDaySchedule` retira la cita antes de calcular ocupación y minutos agendados, porque `bookedMinutesByTechnician` del dominio no conoce ese parámetro. **Nota para la fase 7:** mover y reasignar deben reutilizar `loadDaySchedule` con `excludeAppointmentId` y no calcular la carga por su cuenta.

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

### Códigos de error del flujo

| Código               | Estado | Cuándo                                                                                                       |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `validation_error`   | 400    | Dirección ausente o vacía, UUID o fecha inválidos, `starts_at` sin zona, rango de agenda inválido.           |
| `not_found`          | 404    | Cliente, servicio, cita o técnico de la ruta inexistente en el negocio.                                      |
| `slot_taken`         | 409    | La hora pedida choca con el bloque (duración más buffer) de una cita no cancelada, incluida una concurrente. |
| `slot_not_offered`   | 422    | La hora no es un cupo generado y no choca con ninguna cita; también servicio o técnico pedido no reservable. |
| `invalid_transition` | 422    | Cancelar una cita `cancelled`, `completed` o `no_show`. Una cancelada no se reabre: se crea una cita nueva.  |

## Pruebas

- Runner: Vitest con `unplugin-swc` (conserva los metadatos de decoradores de Nest).
- Dos proyectos de Vitest: `unit` (dominio puro, sin Docker) e `integration`.
- Integración: `test/support/postgres-container.ts` actúa como `globalSetup`. Levanta un único contenedor `postgres:16-alpine` con Testcontainers por ejecución, aplica todas las migraciones y publica la URL con `inject('databaseUrl')`. Las pruebas de migraciones usan una base vacía propia (`test/support/scratch-database.ts`) y las de restricciones insertan con SQL crudo (`test/support/schema-fixtures.ts`). Entre pruebas se usa `truncateAll(pool)`; no hay rollback por prueba porque las pruebas de concurrencia necesitan conexiones reales.
- La primera ejecución descarga la imagen de Postgres y puede tardar más.
