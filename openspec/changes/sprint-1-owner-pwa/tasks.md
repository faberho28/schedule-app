# Tareas: Sprint 1 - PWA del dueño y backend de agendamiento

Cada fase corresponde a una unidad de trabajo (un commit) del plan D10 del diseño, en orden de dependencia. Las pruebas y la documentación viajan en el mismo commit que el código. Los identificadores, rutas, tablas, estados y palabras clave estructurales se mantienen en inglés.

Formato de cada tarea: `[ ] ID` + resultado concreto + área/archivos + `Spec:` requisitos que satisface + `Verif:` cómo se verifica. Cuando aplica TDD, el orden es RED (escribir la prueba que falla), GREEN (implementar), REFACTOR.

## Leyenda de requisitos (referencia a `specs/*/spec.md`)

| Código | Spec | Requisitos (R1, R2...) en el orden del archivo |
|--------|------|-----------------------------------------------|
| BS | business-settings | R1 negocio sembrado y multinegocio; R2 zona horaria; R3 buffer; R4 hora de envío del seguimiento |
| SC | service-catalog | R1 alta y edición; R2 cambios no alteran citas; R3 retiro de servicios; R4 advertencia al cambiar duración |
| TS | technician-schedules | R1 gestión de técnicos; R2 disponibilidad semanal; R3 días libres; R4 rechazo de edición con citas afectadas; R5 desactivación y reactivación; R6 eliminación con anonimización; R7 propuesta de reasignación |
| SA | slot-availability | R1 cupos adaptativos; R2 bloque ocupado; R3 zona horaria y horario de verano; R4 asignación automática; R5 cupos para mover; R6 `slot_taken` frente a `slot_not_offered` |
| AM | appointment-management | R1 creación en cupos generados; R2 bloqueo absoluto de cruces; R3 mover; R4 reasignación manual; R5 cancelación |
| CR | customer-records | R1 creación con E.164; R2 anonimización de clientes; R3 autorización previa; R4 dirección guardada; R5 revocación; R6 sin mensajes sin consentimiento; R7 consentimiento tardío; R8 historial |
| CL | service-closure | R1 cierre con confirmación explícita; R2 cierre anticipado; R3 seguimiento al completar; R4 corrección del cierre; R5 canceladas no se reabren |
| UI | owner-agenda-ui | R1 shell de PWA; R2 interfaz en español; R3 agenda día y semana; R4 diálogos de cita; R5 pantallas de configuración; R6 clientes y cierre; R7 contrato de API tipado |

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 9.000-12.000 (sin lockfiles ni cliente generado) |
| 400-line budget risk | High (aceptado mediante `size:exception`) |
| Chained PRs recommended | No (el usuario indicó que el tamaño del PR no importa) |
| Suggested split | Una sola rama de sprint con 17 commits por unidad de trabajo, más la fase 18 de verificación sin commit propio de código |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Etiqueta de PR requerida: `size:exception`. Regla de revisión: cada commit debe poder revisarse y revertirse por separado, con sus pruebas, su migración `down` (si aplica) y su documentación.

### Suggested Work Units

| Unit | Fase | Commit sugerido | Líneas est. | Notas |
|------|------|-----------------|-------------|-------|
| 1 | 1 | `chore(api): bootstrap NestJS project with Vitest and Testcontainers` | 400-600 | Primer commit; luego re-ejecutar `sdd-init` |
| 2 | 2 | `feat(api): add schema migrations, seed and pg error translator` | 700-900 | Incluye pruebas de restricciones |
| 3 | 3 | `feat(api): add business settings and services endpoints` | 450-600 | |
| 4 | 4 | `feat(api): add technicians CRUD and availability reads` | 300-400 | |
| 5 | 5 | `feat(api): add pure scheduling domain (zoned clock, slots, assignment)` | 700-900 | Sin Nest ni SQL |
| 6 | 6 | `feat(api): add slots listing, appointment creation and cancellation` | 650-850 | Prueba de concurrencia |
| 7 | 7 | `feat(api): add appointment move and manual reassignment` | 350-500 | |
| 8 | 8 | `feat(api): add schedule changes with reassignment proposal and technician erase` | 900-1.200 | |
| 9 | 9 | `feat(api): add customers, consent events and late-consent follow-ups` | 900-1.200 | Incluye anonimización de clientes |
| 10 | 10 | `feat(api): add service closure, corrections and follow-up scheduling` | 700-900 | |
| 11 | 11 | `feat(api): export versioned OpenAPI document` | 150-300 | `api/openapi.json` |
| 12 | 12 | `chore(app): bootstrap PWA shell with generated API client` | 500-700 | Luego re-ejecutar `sdd-init` |
| 13 | 13 | `feat(app): add settings screens and reassignment dialog` | 600-800 | |
| 14 | 14 | `feat(app): add AgendaGrid day and week views` | 450-600 | |
| 15 | 15 | `feat(app): add slot-based appointment dialogs` | 450-600 | |
| 16 | 16 | `feat(app): add customers list, profile and consent` | 400-550 | |
| 17 | 17 | `feat(app): add closure, correction and reopen UI` | 350-500 | |

---

## Fase 1: Base de `api/` (commit 1)

- [x] 1.1 Crear raíz del repo: `.gitignore` (`node_modules`, `.env`, `dist`), `.nvmrc` con Node 24 en `api/` y `app/`, y sección de desarrollo en `README.md`. Spec: n/a (infraestructura). Verif: manual, `git status` no lista `node_modules` ni `.env`.
- [x] 1.2 Crear proyecto NestJS (adaptador Express) en `api/` con TypeScript estricto, `main.ts`, `app.module.ts` y `src/config/env.ts` con esquema zod (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `DEFAULT_BUSINESS_ID`) y `api/.env.example`. Spec: BS-R1 (negocio por defecto). Verif: manual, `npm run build` compila. (`api/.env.example` creado por el usuario y confirmado con 4 líneas; su contenido no se pudo leer por permisos del entorno.)
- [x] 1.3 Configurar Vitest con `unplugin-swc` (`api/vitest.config.ts`) y el script `npm test`. Spec: n/a. Verif: RED/GREEN, primera prueba `api/src/config/env.spec.ts` que falla sin `DATABASE_URL` y pasa con un entorno válido.
- [x] 1.4 Configurar ESLint, Prettier y scripts `lint` y `typecheck` en `api/`. Spec: n/a. Verif: manual, ambos scripts terminan sin errores.
- [x] 1.5 Crear `docker-compose.yml` en la raíz con `postgres:16-alpine`, volumen con nombre y healthcheck. Spec: n/a. Verif: manual, `docker compose up -d` y `select version()` devuelve 16.
- [x] 1.6 Crear el arnés de integración `api/test/support/postgres-container.ts` (Testcontainers `postgres:16-alpine`, `globalSetup`, helper `truncateAll`). Spec: n/a. Verif: prueba que levanta el contenedor y ejecuta `SELECT 1`.
- [x] 1.7 Documentar en `api/README.md` los comandos (`npm test`, `lint`, `typecheck`, compose, Testcontainers). Spec: n/a. Verif: manual, un tercero puede seguirlos.
- [x] 1.8 Actualizar `openspec/config.yaml` (stack NestJS/Kysely, runner Vitest, `test_command` de `api/`) y re-ejecutar `sdd-init` para activar TDD estricto en `api/`. Spec: n/a. Verif: el caché de `sdd-init` reporta `strict_tdd: true`. (config.yaml actualizado y caché de sdd-init refrescado en engram; `strict_tdd: true` para `api/`.)

## Fase 2: Migraciones, siembra y restricciones (commit 2)

- [x] 2.1 Crear el migrador de Kysely con SQL crudo (`api/src/database/migrations/`, scripts `db:migrate` y `db:rollback`), `kysely.provider.ts` con pool `pg` de conexión diferida y `transaction-runner.ts` que ejecuta `SET LOCAL app.business_id`. Spec: BS-R1. Verif: RED, prueba de integración que aplica todo `up` y luego todo `down` sobre Testcontainers.
- [x] 2.2 Migración `001`: extensión `btree_gist`, tablas `businesses` (`CHECK travel_buffer_min BETWEEN 0 AND 240`, `timezone`, `settings jsonb`), `services` (índice único parcial por `lower(name)` con `deleted_at IS NULL`), `technicians`, `availability` y `time_off` con sus `EXCLUDE`. Spec: BS-R2, BS-R3, SC-R1, TS-R2, TS-R3. Verif: RED, pruebas que rechazan franjas solapadas, días libres solapados y buffer 241.
- [x] 2.3 Migración `002`: `customers` (`UNIQUE (business_id, phone)`, `UNIQUE (business_id, alias)`, `CHECK` E.164 salvo anonimizado, `CHECK` de consentimiento otorgado con `consent_at`) y `consent_events` (solo inserción). Spec: CR-R1, CR-R2, CR-R3. Verif: RED, pruebas de cada `CHECK` y de teléfono duplicado.
- [x] 2.4 Migración `003`: `appointments` con `appointments_no_overlap` (`EXCLUDE USING gist (technician_id WITH =, slot WITH &&) WHERE (status <> 'cancelled')`), `CHECK` de `slot` y de cierre anticipado, y `appointment_closures`. Spec: AM-R2, SA-R2, CL-R2. Verif: RED, prueba de solape por buffer y de que `cancelled` libera el bloque, y que `completed` y `no_show` lo conservan.
- [x] 2.5 Migración `004`: `scheduled_messages` con `uq_scheduled_messages_appointment_kind`, `uq_followup_pending` y el trigger de consentimiento `BEFORE INSERT OR UPDATE OF status`. Spec: CR-R6, CR-R7. Verif: RED, prueba del trigger (cliente `pending` o `revoked` no admite fila `pending`) y de unicidad.
- [x] 2.6 Usar claves foráneas compuestas `(business_id, x_id)` en todas las tablas. Spec: BS-R1. Verif: RED, prueba que rechaza referenciar un registro de otro negocio.
- [x] 2.7 Configurar `kysely-codegen` (`npm run db:codegen`) y versionar `api/src/database/db.generated.ts`. Spec: n/a. Verif: manual, el tipo generado compila.
- [x] 2.8 Crear `api/src/database/seed.ts` idempotente (`ON CONFLICT (id) DO NOTHING`) que valida la zona IANA y siembra el negocio con `DEFAULT_BUSINESS_ID` y zona `America/Bogota`. Spec: BS-R1, BS-R2. Verif: RED, sembrar dos veces deja un negocio; `Mars/Olympus` se rechaza.
- [x] 2.9 Crear `api/src/scheduling/domain/errors.ts` (`DomainError` con `code`) y `infrastructure/persistence/pg-error-translator.ts` (`23P01` sobre `appointments_no_overlap` a `slot_taken`; `23505` de teléfono a `customer_phone_taken`). Spec: SA-R6, AM-R2, CR-R1. Verif: RED, pruebas unitarias y de integración del traductor.
- [x] 2.10 Documentar en `api/README.md` migraciones, siembra y codegen. Spec: n/a. Verif: manual.

## Fase 3: Configuración del negocio y servicios (commit 3)

- [x] 3.1 Crear `api/src/shared/http/problem-details.filter.ts` (`application/problem+json`) y `business-context.ts` (resuelve `DEFAULT_BUSINESS_ID`). Spec: BS-R1. Verif: RED con supertest, un `DomainError` responde problem+json con su `code` y estado.
- [x] 3.2 Crear módulo `api/src/modules/business-settings/` con `GET /business` y `PATCH /business` (`travel_buffer_min` entero 0-240, `followup_send_time` `HH:MM`; la zona horaria se rechaza). Spec: BS-R2, BS-R3, BS-R4. Verif: RED, pruebas HTTP con -5, 7.5, 241, `25:61`, `9am`, cambio a `America/Mexico_City`, y valor por defecto `09:00`.
- [x] 3.3 Verificar aislamiento por negocio en repositorios (todos reciben `businessId`). Spec: BS-R1. Verif: RED, prueba de integración con dos negocios.
- [x] 3.4 Crear módulo `api/src/modules/services/` con `POST/GET/GET:id/PATCH /services`, DTO validado, sin `DELETE`. Spec: SC-R1, SC-R3. Verif: RED, validación por campo (duración 0, nombre vacío, precio negativo), servicio sin `followup_interval_days`, `DELETE /services/:id` responde 404.
- [x] 3.5 Implementar `active` (desactivar y reactivar por `PATCH`) y filtro por defecto `deleted_at IS NULL` con `includeInactive`. Spec: SC-R3. Verif: RED, servicio inactivo oculto de los ofrecidos y visible con `includeInactive`; servicio con `deleted_at` oculto.
- [x] 3.6 Devolver en la respuesta de `PATCH /services/:id` la advertencia informativa con el número de citas futuras `pending|confirmed` que conservan la duración anterior, sin bloquear. Spec: SC-R4. Verif: RED, 5 citas futuras producen advertencia 5; sin citas, sin advertencia.
- [x] 3.7 Probar que editar precio o duración no altera citas existentes. Spec: SC-R2. Verif: RED, cita con precio 100000 conserva el valor tras cambiar el servicio a 130000.

## Fase 4: Técnicos, disponibilidad y días libres (commit 4)

- [x] 4.1 Crear módulo `api/src/modules/technicians/` con `POST/GET/GET:id/PATCH /technicians` (solo `name` y `phone`; `active` y horarios no se escriben aquí). Spec: TS-R1. Verif: RED, nombre vacío rechazado, técnico nuevo queda activo.
- [x] 4.2 Agregar `GET /technicians/:id/availability` y `GET /technicians/:id/time-off`. Spec: TS-R2, TS-R3. Verif: RED, devuelven las franjas y períodos del técnico del negocio actual.
- [x] 4.3 Rechazar con 400 que `PATCH /technicians/:id` incluya `active` (la escritura pasa por el flujo de la fase 8). Spec: TS-R5. Verif: RED, prueba HTTP.
- [x] 4.4 Excluir técnicos anonimizados por defecto de los listados (`includeAnonymized`). Spec: TS-R6. Verif: RED con fila anonimizada insertada directamente.
- [x] 4.5 Crear fábricas de datos de prueba en `api/test/support/factories.ts` para negocios, técnicos, clientes, servicios y citas. Spec: n/a. Verif: se usan en las pruebas de las fases siguientes.

## Fase 5: Dominio puro de cupos y asignación (commit 5)

- [x] 5.1 Crear `api/src/scheduling/domain/model/` (`LocalDate`, `LocalTime`, `Instant`, `Range`, `SlotCandidate`, `Clock` como puerto) y la máquina de estados `domain/services/appointment-status.ts` según D11. Spec: AM-R5, CL-R5. Verif: RED, tabla de transiciones válidas e `invalid_transition` (incluida cualquier transición desde `cancelled`).
- [x] 5.2 Crear `domain/time/zoned-clock.ts` (Luxon), único punto de conversión zona-instante. Spec: SA-R3, BS-R2. Verif: RED, `America/Bogota` 08:00 es 13:00 UTC; `America/New_York` hora inexistente avanza y hora ambigua toma la primera ocurrencia.
- [x] 5.3 Implementar `generateSlots` (huecos libres, cupos encadenados, primer cupo en el inicio del hueco, límites de franja, días libres, cupos pasados omitidos). Spec: SA-R1, SA-R2. Verif: RED, escenarios 08:00 y 09:15; posterior a cita; hueco insuficiente; cupo que excede la franja; día libre.
- [x] 5.4 Verificar en `generateSlots` que el bloque ocupado de `completed`, `no_show` y cerradas anticipadamente se trata como ocupado y que `excludeAppointmentId` libera el bloque propio. Spec: SA-R2, SA-R5. Verif: RED, escenarios de bloque con buffer, cierre anticipado y cupo adyacente al propio bloque.
- [x] 5.5 Implementar `assignTechnician` (filtrar disponibles, menos minutos agendados sin buffer ni cancelados, desempate por `created_at` y `id`, técnico preferido). Spec: SA-R4, SA-R5. Verif: RED, escenarios menos cargado, filtro previo, empate, carga sin buffer ni canceladas, preferido, sin técnicos.
- [x] 5.6 Agrupar candidatos por `startsAt` para que cada inicio aparezca una sola vez con el técnico asignado. Spec: SA-R4. Verif: RED, dos técnicos libres producen un solo cupo.
- [x] 5.7 Prueba de propiedades: ningún cupo generado se solapa con el bloque ocupado de un técnico. Spec: AM-R2. Verif: prueba generativa (casos aleatorios con semilla fija).

## Fase 6: `GET /slots`, crear y cancelar citas (commit 6)

- [x] 6.1 Definir puertos y adaptadores Kysely en `api/src/scheduling/` (repositorio de citas, lectura de horarios) y el ejecutor de comandos que abre transacción `READ COMMITTED` con `SELECT id FROM businesses WHERE id = $1 FOR UPDATE`. Spec: AM-R2. Verif: RED, prueba de integración de que dos comandos del mismo negocio se serializan.
- [x] 6.2 Implementar `ListSlots` y `GET /slots` (`serviceId`, `from`, `days`, `excludeAppointmentId`, `preferredTechnicianId`). Spec: SA-R1, SA-R4, SA-R5. Verif: RED con supertest, técnicos inactivos o anonimizados y servicios inactivos no generan cupos; sin técnicos informa que no hay cupo.
- [x] 6.3 Implementar `CreateAppointment` y `POST /appointments` (estado `confirmed`, snapshots de dirección, precio y nombre del servicio, `buffer_min`, `slot`, regeneración de cupos dentro de la transacción, orden `slot_taken` luego `slot_not_offered`). Spec: AM-R1, SA-R6. Verif: RED, escenarios cita en cupo ofrecido, dirección ausente (400), hora fuera de grilla (422), colisión (409).
- [x] 6.4 Actualizar `customers.address` con la dirección usada al crear la cita. Spec: CR-R4. Verif: RED, escenario "Dirección actualizada al agendar" y snapshot inmune a cambios posteriores.
- [x] 6.5 Implementar `CancelAppointment` y `POST /appointments/:id/cancel` (motivo opcional, libera bloque, `cancelled` no se reabre). Spec: AM-R5. Verif: RED, cancelar con y sin motivo; reabrir responde `invalid_transition`; el cupo vuelve a ofrecerse.
- [x] 6.6 Agregar `GET /appointments?from&to` y `GET /appointments/:id` con técnico, cliente y servicio para la agenda. Spec: UI-R3 (datos de la agenda). Verif: RED, filtra por rango y negocio.
- [x] 6.7 Prueba de concurrencia con conexiones reales: dos solicitudes simultáneas para el mismo cupo producen una cita y un `slot_taken` (409). Spec: AM-R2, SA-R6. Verif: integración con Testcontainers.
- [x] 6.8 Pruebas de bloqueo absoluto: solape por buffer (11:10), bloque conservado por `completed` y `no_show`, liberación al cancelar. Spec: AM-R2, SA-R2. Verif: RED, escenarios del spec.
- [x] 6.9 Documentar en `api/README.md` el flujo de creación y los códigos de error. Spec: n/a. Verif: manual.

## Fase 7: Mover y reasignar citas (commit 7)

- [x] 7.1 Implementar `MoveAppointment` y `POST /appointments/:id/move` (solo cupos generados, `excludeAppointmentId`, `preferredTechnicianId`, `buffer_min` recalculado, `technician_changed`, atómico). Spec: AM-R3, SA-R5, BS-R3. Verif: RED, mover a cupo libre libera el bloque anterior.
- [x] 7.2 Cubrir prioridad del técnico actual, cambio de técnico con marca, cupo adyacente al propio bloque y cupo ocupado durante el movimiento (la cita conserva su horario). Spec: SA-R5, AM-R3. Verif: RED, escenarios del spec.
- [x] 7.3 Rechazar mover citas `completed`, `no_show` o `cancelled`. Spec: AM-R3, CL-R5. Verif: RED, `invalid_transition` (422).
- [x] 7.4 Implementar `ReassignAppointment` y `POST /appointments/:id/reassign` (mismo horario, destino disponible, `technician_changed = true`). Spec: AM-R4. Verif: RED, destino libre y destino ocupado (`slot_taken`).
- [x] 7.5 Rechazar como destino técnicos inactivos, anonimizados o sin disponibilidad en el horario. Spec: AM-R4, TS-R5. Verif: RED.

## Fase 8: Cambios de horario y propuesta de reasignación (commit 8)

- [x] 8.1 Definir `ScheduleChange` (`add_time_off`, `replace_availability`, `deactivate`, `activate`, `remove_time_off`, `erase`) y la regla de cita afectada (`pending|confirmed`, `starts_at >= now`, fuera de la nueva disponibilidad). Spec: TS-R3, TS-R4, TS-R5. Verif: RED, pruebas unitarias por tipo de cambio.
- [x] 8.2 Implementar `planReassignments` puro (orden cronológico, ocupación y carga en memoria, `toTechnicianId: null`, `fullyResolvable`). Spec: TS-R7, SA-R4. Verif: RED, propuesta completa, cita sin reemplazo, carga acumulada entre citas.
- [x] 8.3 Implementar `PreviewScheduleChange` y `POST /technicians/:id/schedule-changes/preview` (solo lectura). Spec: TS-R7. Verif: RED, devuelve `{affected, proposal, fullyResolvable}` sin modificar datos.
- [x] 8.4 Implementar `ApplyScheduleChange` y `POST /technicians/:id/schedule-changes` con bloqueo del negocio, recálculo, `schedule_conflict`, `proposal_stale`, `slot_taken`, aplicación atómica y `technician_changed`. Spec: TS-R3, TS-R4, TS-R5, TS-R7. Verif: RED, escenarios día libre con citas, reducir horario, ampliar horario, propuesta aceptada, falla parcial, conjunto cambiado, propuesta rechazada (sin cambios).
- [x] 8.5 Cubrir definición de horario semanal (cinco franjas), franja solapada y fin anterior al inicio con códigos documentados. Spec: TS-R2. Verif: RED, escenarios del spec.
- [x] 8.6 Cubrir desactivar con y sin citas futuras y reactivar con `reassignments` vacío; el técnico inactivo no recibe cupos. Spec: TS-R5. Verif: RED.
- [x] 8.7 Implementar `erase`: `DELETE /technicians/:id` invoca el mismo caso de uso; anonimiza con alias aleatorio único por negocio (`name` y `phone` en nulo, `anonymized_at`, `active = false`) solo si no quedan citas futuras activas, en la misma transacción. Spec: TS-R6. Verif: RED, con citas futuras responde `schedule_conflict`; tras reasignar queda anonimizado; alias único; historial legible con alias; sin tabla de correspondencia persona-alias.
- [x] 8.8 Documentar el flujo (diagrama de secuencia de D5) en `api/README.md`. Spec: n/a. Verif: manual.

## Fase 9: Clientes y consentimiento (commit 9)

- [x] 9.1 Crear módulo `api/src/modules/customers/` con `POST/GET/GET:id/PATCH /customers`, normalización E.164 con `libphonenumber-js` (`+57` por defecto), consentimiento `pending` inicial y `customer_phone_taken` (409). Spec: CR-R1. Verif: RED, "300 123 4567" se guarda como `+573001234567`, "abc" y vacío se rechazan, duplicado responde 409.
- [x] 9.2 Implementar `RegisterConsent` y `POST /customers/:id/consents` (`kind`, `occurredAt`, `medium` del enum, `notes`; evento y proyección en una transacción; `source = owner_panel`, `recorded_by = 'owner'`). Spec: CR-R3. Verif: RED, registro con `in_person`, sin medio se rechaza, el evento no puede sobrescribirse.
- [x] 9.3 Implementar la revocación (`kind = 'revoked'`): cancela seguimientos pendientes con `cancel_reason='consent_revoked'` y conserva ficha e historial. Spec: CR-R5. Verif: RED, escenarios revocación con seguimiento pendiente y nuevo consentimiento tras revocar.
- [x] 9.4 Implementar `FollowupPolicy` puro y el relleno por consentimiento tardío (última cita `completed` por servicio con intervalo, fecha pasada, cita futura o seguimiento pendiente, `ON CONFLICT DO NOTHING`). Spec: CR-R7, CR-R6. Verif: RED, escenarios seguimiento creado, fecha ya pasada, cita futura, solo la última cita, idempotencia.
- [x] 9.5 Agregar `GET /customers/:id` con historial de citas (descendente, snapshots y técnico o alias) y `GET /customers/:id/consents` con la auditoría. Spec: CR-R8, CR-R3. Verif: RED, cliente con `completed` y `cancelled` en orden descendente; auditoría con fecha y medio.
- [x] 9.6 Prueba de no creación de filas en `scheduled_messages` para clientes sin consentimiento otorgado, a nivel de política y de trigger. Spec: CR-R6. Verif: RED, integración.
- [x] 9.7 Implementar `AnonymizeCustomer` y `DELETE /customers/:id` (204): alias `bear_n` aleatorio y único, teléfono marcador `anon-` más 26 hexadecimales, dirección y notas en nulo, `address_snapshot` de todas sus citas, textos libres de motivos y notas, `consent_status = revoked`, `anonymized_at`, seguimientos `pending` a `cancelled` con `cancel_reason='customer_erased'`, transacción única e idempotente. Spec: CR-R2. Verif: RED, escenarios anonimizar con historial, teléfonos marcador distintos y no E.164, idempotencia, reaparición como cliente nuevo.
- [x] 9.8 Rechazar citas nuevas, ediciones y consentimiento sobre clientes anonimizados (ajuste a `CreateAppointment`, `PATCH /customers` y `RegisterConsent`). Spec: CR-R2. Verif: RED, escenario "Cliente anonimizado excluido".
- [x] 9.9 Documentar anonimización y consentimiento en `api/README.md`. Spec: n/a. Verif: manual.

## Fase 10: Cierre, corrección y seguimiento (commit 10)

- [ ] 10.1 Implementar el cálculo de `send_at` (fecha local de `completed_at` más intervalo a `followup_send_time`, convertido con `zoned-clock`). Spec: CL-R3, BS-R4. Verif: RED, completar el 2026-11-01 con 180 días da 2027-04-30 09:00 hora de Bogotá; 2026-11-05 con 90 días da 2027-02-03.
- [ ] 10.2 Implementar `CloseAppointment` y `POST /appointments/:id/close` (`outcome`, confirmación explícita obligatoria, bloque conservado, actor `owner`, fila en `appointment_closures`). Spec: CL-R1. Verif: RED, completar, no asistió, cerrar `pending`, cancelada rechazada, sin cierre automático al avanzar el `Clock`.
- [ ] 10.3 Implementar el cierre anticipado: `reason` y `confirmEarly: true` obligatorios (`early_closure_reason_required`, `early_closure_confirmation_required`), con `closed_early` y `closure_reason`. Spec: CL-R2, SA-R2. Verif: RED, cierre válido con auditoría, sin motivo, sin confirmación reforzada, el bloque sigue ocupado.
- [ ] 10.4 Programar el seguimiento al completar: consentimiento otorgado, intervalo definido, sin cita futura activa del mismo servicio, reemplazo del pendiente con `superseded`, fila única por cita. Spec: CL-R3, CR-R6. Verif: RED, escenarios seguimiento programado, reemplazo, cita futura, servicio sin intervalo, cliente sin consentimiento.
- [ ] 10.5 Implementar `CorrectClosure` y `POST /appointments/:id/correct-closure`: `completed` y `no_show` entre sí, reapertura a `confirmed` con `confirmReopen: true` (422 `reopen_confirmation_required`), limpieza de campos de cierre, corrección de `completed_at`. Spec: CL-R4. Verif: RED, escenarios de devolver a confirmada con y sin confirmación, desde `no_show`, cambio de fecha de completado.
- [ ] 10.6 Aplicar los efectos sobre el seguimiento: `completed -> no_show` (`closure_corrected`), reapertura (`reopened`), recalcular `send_at` sin duplicar, `no_show -> completed` aplica la regla, nunca más de un seguimiento activo por cita. Spec: CL-R4. Verif: RED, escenarios del spec y reutilización de fila tras reabrir y volver a cerrar.
- [ ] 10.7 Rechazar la corrección de citas `cancelled` indicando crear una cita nueva. Spec: CL-R5. Verif: RED, `invalid_transition`.
- [ ] 10.8 Documentar la máquina de estados (D11) y el cierre en `api/README.md`. Spec: n/a. Verif: manual.

## Fase 11: OpenAPI (commit 11)

- [ ] 11.1 Configurar el plugin CLI de `@nestjs/swagger` en `api/nest-cli.json`, decorar DTO y esquema `ProblemDetails` con los códigos de error documentados. Spec: UI-R7. Verif: manual, el documento muestra los esquemas.
- [ ] 11.2 Crear `npm run openapi:export` (inicia la app sin escuchar ni requerir base de datos) y versionar `api/openapi.json`. Spec: UI-R7. Verif: RED, prueba que ejecuta el export sin Postgres disponible y compara con el archivo versionado.
- [ ] 11.3 Prueba del contrato: existen `DELETE /customers/:id` y `DELETE /technicians/:id` y no existe `DELETE` de servicios, citas ni disponibilidad. Spec: SC-R3. Verif: RED, inspección del documento.
- [ ] 11.4 Agregar el script `openapi:check` (falla si el archivo versionado difiere del regenerado) y documentarlo. Spec: UI-R7. Verif: manual.

## Fase 12: Base de `app/` (commit 12)

- [ ] 12.1 Crear `app/` con Vite, React y TypeScript, Tailwind v4, shadcn/ui, tokens de color de D8, `app/.env.example` (`VITE_API_BASE_URL`) y `.nvmrc`. Spec: UI-R1. Verif: manual, `npm run build`.
- [ ] 12.2 Configurar Vitest, React Testing Library, jsdom y MSW (`app/vitest.config.ts`, `src/test/setup.ts`). Spec: n/a. Verif: RED/GREEN, prueba que renderiza el shell.
- [ ] 12.3 Configurar React Router 7 con las rutas de D8, layout con navegación en español neutro con tuteo y proveedor de TanStack Query. Spec: UI-R2. Verif: RED, cada ruta renderiza su pantalla vacía.
- [ ] 12.4 Crear `npm run gen:api` (`openapi-typescript ../api/openapi.json -o src/shared/api/schema.d.ts`), el cliente `openapi-fetch` en `src/shared/api/client.ts` y el traductor de errores a español (`slot_taken` a "Cupo ocupado") en `src/shared/lib/`. Spec: UI-R7, UI-R2. Verif: RED, el mapeo de errores; manual, `npm run gen:api && npm run typecheck`.
- [ ] 12.5 Configurar `vite-plugin-pwa` (`generateSW`, solo shell, `navigateFallback: '/index.html'`, sin caché de `/api`), manifest ("Schedule App", `#2563EB`, `#F8FAFC`, íconos 192, 512 y maskable) y la pantalla "Sin conexión" con botón "Reintentar". Spec: UI-R1. Verif: RED para el componente (texto exacto y reintento); manual, instalación y modo sin conexión en DevTools.
- [ ] 12.6 Crear utilidades de fecha con `Intl.DateTimeFormat({ timeZone })` en `src/shared/lib/`. Spec: BS-R2. Verif: RED, formato en `America/Bogota`.
- [ ] 12.7 Documentar en `app/README.md` comandos, variables y generación del cliente. Spec: n/a. Verif: manual.
- [ ] 12.8 Actualizar `openspec/config.yaml` con el runner de `app/` y re-ejecutar `sdd-init` para activar TDD estricto en `app/`. Spec: n/a. Verif: el caché de `sdd-init` reporta `strict_tdd: true` para ambos proyectos.

## Fase 13: Pantallas de configuración (commit 13)

- [ ] 13.1 Pantalla `/settings/business` (zona horaria de solo lectura, buffer 0-240, `followup_send_time`). Spec: UI-R5, BS-R2, BS-R3, BS-R4. Verif: RED con MSW, valor guardado visible y errores de validación en español.
- [ ] 13.2 Pantalla `/settings/services` (alta, edición, desactivar, reactivar, `includeInactive`) y aviso "Hay N citas futuras que conservan la duración anterior". Spec: UI-R5, SC-R1, SC-R3, SC-R4. Verif: RED con MSW.
- [ ] 13.3 Pantallas `/settings/technicians` y `/settings/technicians/:id` (alta, edición de nombre y teléfono). Spec: UI-R5, TS-R1. Verif: RED con MSW.
- [ ] 13.4 Editor de disponibilidad semanal y formulario de días libres que usan vista previa y aplicación de cambios de horario. Spec: UI-R5, TS-R2, TS-R3. Verif: RED con MSW, franja solapada y fin anterior al inicio muestran error.
- [ ] 13.5 Componente `ScheduleConflictDialog`: lista de citas afectadas, propuesta, citas no resueltas, acciones Aceptar y Rechazar, manejo de `proposal_stale` y `slot_taken`. Spec: UI-R5, TS-R7. Verif: RED con MSW, días libre rechazado muestra propuesta; Aceptar muestra el resultado y refresca citas; Rechazar no cambia nada.
- [ ] 13.6 Acciones de desactivar, reactivar y eliminar técnico por el mismo flujo, con aviso de que la eliminación es irreversible. Spec: UI-R5, TS-R5, TS-R6. Verif: RED con MSW.
- [ ] 13.7 Revisión manual de que todo el texto visible está en español con tuteo. Spec: UI-R2. Verif: manual.

## Fase 14: `AgendaGrid` (commit 14)

- [ ] 14.1 Crear `app/src/features/agenda/AgendaGrid.tsx` con el contrato de props de D8, CSS Grid propio, vista de día (columna por técnico) y de semana (columnas por día con carriles por técnico), cola rayada de buffer, citas como `button` con `aria-label`, estado con ícono y texto. Spec: UI-R3. Verif: RED, dos columnas en vista de día; siete días en vista de semana.
- [ ] 14.2 Garantizar que no hay arrastrar y soltar. Spec: UI-R3. Verif: RED, simular arrastre no dispara callbacks ni cambia datos.
- [ ] 14.3 Filtro por técnico en móvil y colores de estado accesibles (tokens D8). Spec: UI-R3. Verif: RED, filtro y atributos accesibles; manual, contraste.
- [ ] 14.4 Ruta `/agenda?view=day|week&date=YYYY-MM-DD` con carga de técnicos y citas, navegación entre fechas y `onEmptyCellSelect`. Spec: UI-R3. Verif: RED con MSW, cambiar a semana actualiza la URL.

## Fase 15: Diálogos de cita (commit 15)

- [ ] 15.1 `CreateAppointmentDialog`: cliente, servicio activo, lista de cupos de `GET /slots` con el técnico asignado, reasignación manual, dirección obligatoria precargada y editable; sin campo de hora libre. Spec: UI-R4, AM-R1, CR-R4. Verif: RED con MSW, solo cupos ofrecidos, dirección precargada, dirección vacía bloquea el envío.
- [ ] 15.2 Manejo de `slot_taken` en la interfaz: mensaje "Cupo ocupado", recarga de cupos y opción de elegir otro. Spec: UI-R2, SA-R6. Verif: RED con MSW.
- [ ] 15.3 `MoveAppointmentDialog` con `excludeAppointmentId` y `preferredTechnicianId`, e indicación de cambio de técnico. Spec: UI-R4, AM-R3, SA-R5. Verif: RED con MSW.
- [ ] 15.4 `CancelAppointmentDialog` con confirmación y motivo opcional, y `ReassignDialog` para reasignación manual. Spec: UI-R4, AM-R4, AM-R5. Verif: RED con MSW, la cita se muestra cancelada y el cupo se libera.
- [ ] 15.5 Invalidar las consultas de agenda y cupos tras cada comando. Spec: UI-R4. Verif: RED, la agenda se actualiza sin recarga.

## Fase 16: Clientes en la interfaz (commit 16)

- [ ] 16.1 `/customers`: lista con búsqueda y formulario de alta con `+57` precargado y errores en español. Spec: UI-R6, CR-R1. Verif: RED con MSW, prefijo precargado, duplicado muestra mensaje.
- [ ] 16.2 `/customers/:id`: datos, dirección guardada, estado del consentimiento, auditoría (fecha, medio) e historial descendente. Spec: UI-R6, CR-R3, CR-R8. Verif: RED con MSW.
- [ ] 16.3 Diálogo de autorización previa con fecha y medio (etiquetas "En persona", "Llamada telefónica", "WhatsApp", "Formulario o documento escrito", "Otro"). Spec: UI-R6, CR-R3. Verif: RED con MSW, sin medio no se envía.
- [ ] 16.4 Eliminar cliente (anonimización) con confirmación y visualización "Cliente eliminado (alias)"; formateador compartido "Técnico eliminado (alias)". Spec: UI-R6, CR-R2, TS-R6. Verif: RED con MSW.
- [ ] 16.5 Confirmar que no existe UI de revocación en este sprint (solo API). Spec: CR-R5. Verif: manual.

## Fase 17: UI de cierre (commit 17)

- [ ] 17.1 `ClosureDialog`: Completada o No asistió con paso de confirmación explícita. Spec: UI-R6, CL-R1. Verif: RED con MSW.
- [ ] 17.2 Cierre anticipado: motivo obligatorio y segundo paso de confirmación reforzada para citas futuras. Spec: UI-R6, CL-R2. Verif: RED, sin motivo no avanza.
- [ ] 17.3 `CorrectionDialog`: cambio entre Completada y No asistió, edición de la fecha de completado y devolución a Confirmada con motivo y confirmación reforzada. Spec: UI-R6, CL-R4. Verif: RED con MSW.
- [ ] 17.4 Acciones por estado en el detalle de la cita (canceladas sin acciones de reapertura, con indicación de crear una cita nueva). Spec: CL-R5, UI-R4. Verif: RED.
- [ ] 17.5 Documentar en `app/README.md` los flujos de cierre y actualizar `openspec/config.yaml` final. Spec: n/a. Verif: manual.

## Fase 18: Criterios de aceptación y deudas fuera de este sprint

Verificaciones de los criterios de éxito de la propuesta (sin commit de código propio; los fallos se corrigen en la unidad que corresponda):

- [ ] 18.1 Criterio 1: configurar servicios, técnicos, disponibilidad, días libres y buffer desde la PWA. Spec: UI-R5. Verif: recorrido manual completo.
- [ ] 18.2 Criterio 2: agenda día y semana por técnico; crear, mover y cancelar solo por cupos ofrecidos. Spec: UI-R3, UI-R4. Verif: recorrido manual y pruebas de las fases 14 y 15.
- [ ] 18.3 Criterio 3: concurrencia del mismo cupo devuelve `slot_taken` (409) y la UI muestra "Cupo ocupado". Spec: AM-R2, UI-R2. Verif: prueba de la tarea 6.7 y verificación manual con dos pestañas.
- [ ] 18.4 Criterio 4: un día libre sobre citas se rechaza listando las afectadas. Spec: TS-R3. Verif: prueba de la tarea 8.4 y verificación manual.
- [ ] 18.5 Criterio 5: completar una cita de un cliente con consentimiento e intervalo crea exactamente una fila de seguimiento; corregir la anula o recalcula. Spec: CL-R3, CL-R4. Verif: pruebas de 10.4 a 10.6 y consulta directa a `scheduled_messages`.
- [ ] 18.6 Criterio 6: clientes sin consentimiento nunca tienen filas en `scheduled_messages`. Spec: CR-R6. Verif: pruebas 2.5, 9.6 y 10.4.
- [ ] 18.7 Criterio 7: el cliente de `app/` se genera desde `api/openapi.json`. Spec: UI-R7. Verif: `npm run gen:api` sin diferencias y `npm run typecheck` sin errores.
- [ ] 18.8 Ejecutar la suite completa de ambos proyectos (`npm test`, `lint`, `typecheck`, `openapi:check`) y confirmar que cada migración tiene su `down`. Spec: n/a. Verif: todo en verde.

Deudas fuera del sprint 1 (solo referencia, sin tareas):

- Registro de supresiones (HMAC del identificador) y respaldos: mecanismo que vuelva a purgar a las personas suprimidas tras una restauración (Ley 1581). Al final del proyecto.
- Autenticación y roles: tabla `users`, `recorded_by_user_id` en `consent_events` y actor real en cierres. Al final del proyecto.
- Row Level Security: política por `app.business_id` como migración aislada (la preparación ya está hecha).
- Fuera de alcance, sin historias: WhatsApp, bot, bandeja de conversaciones, arrastrar y soltar, fotos de evidencia y caché sin conexión de la agenda (que deberá advertir que las citas pueden haber cambiado).
- Diferidas: recalcular citas futuras al cambiar el buffer (opción C de D1) y verificar la política de opt-in de Meta antes del bot.
