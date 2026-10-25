# Diseño: Sprint 1 - PWA del dueño y backend de agendamiento

## Enfoque técnico

Hay dos proyectos independientes en el mismo repositorio: `api/` (NestJS sobre Express, Kysely y Postgres 16) y `app/` (React, Vite y PWA). Solo el dominio de agendamiento (cupos, asignación, estados de la cita, cambios de horario, cierre, seguimiento y consentimiento) sigue la arquitectura hexagonal. Su núcleo está hecho de funciones puras de TypeScript, sin Nest ni SQL. Lo demás son módulos CRUD simples. Postgres garantiza lo que no puede fallar: cruces (`EXCLUDE`), idempotencia de seguimientos (`UNIQUE`) y ausencia de mensajes sin consentimiento (trigger). El código se encarga de las reglas de producto. Todas las conversiones de zona horaria ocurren en el backend, en un solo módulo.

Nota de tamaño: este documento supera el presupuesto de 800 palabras del skill porque la fase debía resolver 10 decisiones explícitas. Las decisiones se presentan como tablas siempre que fue posible.

## Decisiones de arquitectura

### D1. Buffer de desplazamiento y concurrencia

| Opción | Ventaja | Costo | Decisión |
|---|---|---|---|
| A. `slot` = solo el servicio; buffer validado en el dominio dentro de una transacción con bloqueo | El buffer nunca queda desactualizado | La base no garantiza el buffer; un camino de código sin bloqueo lo rompe | Rechazada |
| B. `slot` = rango ocupado `[starts_at, ends_at + buffer_min)`, con `buffer_min` copiado en la cita | `EXCLUDE` cubre el buffer de forma absoluta; el generador de cupos y la base usan el mismo dato | Si cambia el buffer, las citas existentes conservan el anterior | **Elegida** |
| C. Opción B más recalcular las citas futuras cuando cambia el buffer | El buffer siempre coincide con la configuración | Actualización masiva que puede chocar; necesitaría un flujo de rechazo propio | Diferida |

Regla: el buffer es una copia (snapshot), igual que la dirección y el precio. Se toma del valor vigente del negocio al crear la cita y de nuevo al moverla (`buffer_min` se recalcula al mover); un cambio de configuración aplica solo a citas creadas o movidas después. El buffer va al final de la cita. Puede extenderse más allá del fin de la disponibilidad, pero no puede cruzarse con la cita siguiente.

Bloque ocupado (normativo): toda cita con estado distinto de `cancelled` (`pending`, `confirmed`, `completed`, `no_show`) conserva su bloque `[starts_at, ends_at + buffer_min)`. Cerrar una cita antes de tiempo no libera el resto del bloque, y `no_show` tampoco lo libera. Solo `cancelled` libera el bloque. Por eso la restricción `EXCLUDE` usa `WHERE (status <> 'cancelled')` y una corrección de cierre nunca puede provocar un cruce.

Concurrencia: cada comando de agendamiento (crear, mover, reasignar, cancelar, aplicar un cambio de horario, cerrar, registrar consentimiento) corre en `READ COMMITTED` y empieza con `SELECT id FROM businesses WHERE id = $1 FOR UPDATE`. Esto serializa las escrituras de agenda de un negocio, lo que evita el *write skew* entre "agregar día libre" y "crear cita", y entre asignaciones automáticas concurrentes. También evita razonar sobre el orden de bloqueos (sin interbloqueos). `EXCLUDE` sigue siendo la última defensa. Con 1 a 10 técnicos el costo es despreciable. Si el bot llega a saturarlo, se cambia a bloqueos por técnico. Se descartó `SERIALIZABLE` porque obliga a reintentos en toda la aplicación.

### D2. Consentimiento auditable

- `customers.consent_status` (`pending|granted|revoked`) y `customers.consent_at` son la proyección actual.
- `consent_events` es solo de inserción: `kind` (`granted|revoked`), `occurred_at` (fecha en que el cliente autorizó), `medium` (`in_person|phone_call|whatsapp|written|other`), `source` (`owner_panel|bot`), `recorded_by` (texto, `'owner'` hasta que exista autenticación; luego se agrega `recorded_by_user_id`), `notes` y `created_at`. El evento y la proyección se escriben en la misma transacción.
- Etiquetas de la interfaz para `medium` (mapeo explícito): `in_person` = "En persona" (verbal), `phone_call` = "Llamada telefónica", `whatsapp` = "WhatsApp", `written` = "Formulario o documento escrito", `other` = "Otro". La API solo acepta los valores del enum; las etiquetas existen solo en la interfaz.
- Sprint 1: solo `granted` desde `owner_panel`. La revocación está modelada y, por decisión posterior del dueño del proyecto, la interfaz de clientes ofrece la acción "Revocar consentimiento" (tarea 16.5). Al registrarse una revocación (`RegisterConsent` con `kind='revoked'`), la misma transacción pasa `consent_status` a `revoked` y cancela de inmediato los `scheduled_messages` pendientes del cliente con `cancel_reason='consent_revoked'`; ficha, citas e historial se conservan (no es una supresión). Un nuevo `granted` dispara el relleno por consentimiento tardío.
- Se usan dos barreras contra mensajes sin consentimiento: (1) la `FollowupPolicy` del dominio, y (2) un trigger `BEFORE INSERT OR UPDATE OF status ON scheduled_messages` que lanza una excepción si `NEW.status = 'pending'` y el cliente no está en `granted`. Se descartó la FK compuesta sobre el estado porque bloquearía la revocación.

### D3. Cupos, asignación y zona horaria

Todo vive en `api/src/scheduling/domain/` como funciones puras.

```ts
generateSlots(input: {
  days: LocalDate[]; timeZone: string; now: Instant;
  durationMin: number; bufferMin: number;
  technicians: { id: string; weekly: WeeklyWindow[]; timeOff: Range[]; occupied: Range[] }[];
}): SlotCandidate[] // { startsAt, endsAt, occupiedUntil, technicianIds[] } ordered by startsAt

assignTechnician(c: SlotCandidate, bookedMinutesByTech: Map<string, number>,
  opts?: { preferredTechnicianId?: string }): string
```

`GET /slots` acepta `excludeAppointmentId` (al mover, el bloque de esa cita se excluye de `occupied`) y `preferredTechnicianId` (el técnico actual de la cita, que tiene prioridad si está libre).

- Cupo adaptativo por técnico: se recorren los huecos libres de cada ventana. El primer cupo empieza al inicio del hueco y el siguiente en `inicio + duración + buffer`. Un cupo es válido si `inicio + duración ≤ fin de ventana`, si `inicio + duración ≤ inicio del día libre` y si `inicio + duración + buffer ≤ inicio de la siguiente cita ocupada`. Se omiten los cupos anteriores a `now`.
- Los candidatos de todos los técnicos se agrupan por `startsAt`.
- Asignación: se filtran los técnicos libres. Si el técnico preferido (al mover) está libre, se elige. Si no, se elige el de menos minutos de servicio agendados ese día local. La carga cuenta los minutos de servicio de todas las citas con estado distinto de `cancelled`, sin buffer. El desempate es el técnico más antiguo por `technicians.created_at` y luego `id`, para que sea determinista. Los cupos ofrecidos son encadenados: dentro de un hueco libre se ofrece un cupo tras otro.
- "Solo en cupos generados": el servidor vuelve a generar los cupos del día (excluyendo el bloque propio al mover) y exige que la hora pedida pertenezca a ellos. Esto se hace dentro de la transacción bloqueada. Orden de evaluación: primero se verifica si la hora pedida colisiona con el bloque de una cita no cancelada del técnico (incluida una solicitud concurrente ya confirmada, o la violación `23P01` de `EXCLUDE`); si colisiona, el resultado es `slot_taken` (409), mostrado como "cupo ocupado". Solo si no colisiona y la hora no pertenece a la grilla generada, el resultado es `slot_not_offered` (422).
- Zona horaria: hay una sola por negocio, fijada al crearlo e inmutable en el sprint 1 (la API rechaza cambiarla; la interfaz la muestra solo de lectura). Cupos, recordatorios, seguimientos y visualización la usan para todos; los clientes no tienen zona propia. Solo `domain/time/zoned-clock.ts` (Luxon) convierte `LocalDate`/`LocalTime` y `timeZone` a `Instant` y viceversa. Una hora inexistente (salto de horario de verano) avanza; una hora ambigua toma la primera ocurrencia. La base usa `timestamptz`. La API recibe instantes ISO 8601 con offset y fechas locales `YYYY-MM-DD`. El frontend solo formatea con `Intl.DateTimeFormat({ timeZone })`. Las pruebas cubren `America/Bogota` y `America/New_York` (horario de verano).

### D4. Modelo de datos

Todas las tablas tienen `id uuid` y `business_id`, salvo `businesses`, que es la raíz. El modelo soporta varios negocios; el sprint 1 siembra uno solo y `BusinessContext` resuelve siempre ese id. Las FK son compuestas `(business_id, x_id)`, para que no se pueda referenciar otro negocio.

Borrado (decisión confirmada y corregida): el borrado lógico aplica a los datos operativos (`services`, `appointments`, `availability`, `time_off` y similares), que llevan `deleted_at timestamptz` nulo como único mecanismo de borrado lógico; las tablas de auditoría (`consent_events`, `appointment_closures`) son solo de inserción. `services` conserva además `active` como estado operativo reversible (se cambia con `PATCH`): un servicio inactivo no se ofrece para citas nuevas pero sigue visible para el dueño. Los listados excluyen por defecto las filas con `deleted_at` no nulo (parámetro opcional `includeInactive`) y el historial de citas se conserva intacto. Los servicios no tienen endpoint `DELETE`. `customers` y `technicians` no se borran en cascada: el sprint 1 expone `DELETE /customers/:id` y `DELETE /technicians/:id`, cuya semántica es la anonimización en sitio descrita abajo (los técnicos también tienen `active` para desactivarse sin borrar). Los índices únicos parciales de datos con borrado lógico usan `WHERE deleted_at IS NULL`.

Eliminación de técnicos (decisión del usuario): sus citas y su historial se anonimizan, no se borran. Cada técnico eliminado recibe un alias aleatorio e irreversible (por ejemplo `tiger_1`, mostrado en la interfaz como "Técnico eliminado (tiger_1)") que reemplaza su identidad en citas, `appointment_closures` y filas de auditoría, de modo que el historial se lee como "servicio en la dirección X ejecutado por tiger_1". Reglas: el alias es aleatorio y no se deriva de datos de la persona; después del borrado no se conserva ninguna correspondencia entre la persona y el alias (el registro de supresiones guarda solo un hash con clave del identificador y no tiene vínculo con el alias); el alias es único por negocio; se eliminan todos los datos personales del técnico (`name`, `phone`). Precondición: un técnico con citas futuras activas (`pending|confirmed`, desde ahora) no puede suprimirse; la solicitud se rechaza con `schedule_conflict` (409) y pasa por el flujo de cambio de horario descrito en D5, y solo se anonimiza cuando no queda ninguna. Implementación prevista: la fila de `technicians` se conserva para mantener las FK compuestas, con `name` y `phone` en nulo, `alias` (`UNIQUE (business_id, alias)`), `anonymized_at` y `active = false`; ya no puede recibir cupos.

Eliminación de clientes con citas futuras (decisión del usuario, posterior a la fase 18): un cliente con citas futuras activas (`pending|confirmed`, desde ahora) no puede suprimirse. Anonimizarlo dejaría esas citas vigentes atribuidas a "Cliente eliminado (alias)", sin dirección y sin forma de saber adónde ir. La solicitud se rechaza con `customer_has_future_appointments` (409) y `affected`; el dueño debe cancelar esas citas con `POST /appointments/:id/cancel` y repetir la eliminación. El sistema nunca cancela citas por su cuenta. La comprobación corre dentro de la misma transacción y bajo el bloqueo del negocio, por lo que una reserva concurrente queda serializada con la eliminación: o se crea antes y la eliminación se rechaza, o llega después y recibe `customer_anonymized`. Un cliente ya anonimizado sigue siendo idempotente y no se revisa. Es la misma regla que se aplica a los técnicos, sin propuesta de reasignación, porque una cita de cliente no tiene reemplazo posible.

Supresión de clientes (decisión del usuario, reemplaza la recomendación de borrado en cascada): no se borra en cascada. Borrar a un cliente es una anonimización en sitio, de la misma familia de mecanismos que el alias del técnico. El `id` del cliente sigue vivo y todo su historial se conserva (citas, `appointment_closures`, filas de `scheduled_messages`, `consent_events` y servicios prestados), pero todo dato personal se reemplaza por valores neutros y aleatorios:

| Campo | Después de anonimizar |
|---|---|
| `customers.name` | alias aleatorio (por ejemplo `bear_1`), mostrado como "Cliente eliminado (bear_1)"; único por negocio |
| `customers.phone` | marcador único aleatorio con formato reservado no marcable: `anon-` seguido de 26 caracteres hexadecimales aleatorios. No empieza con `+`, por lo que nunca coincide con un E.164 real, y respeta `UNIQUE (business_id, phone)` (no se usa una constante) |
| `customers.address`, `customers.notes` | nulos |
| `appointments.address_snapshot` (todas las citas del cliente) | nulo |
| `appointments.cancel_reason`, `appointments.closure_reason`, `appointment_closures.reason`, `consent_events.notes`, `scheduled_messages.cancel_reason` de texto libre | nulos o texto neutro, porque pueden contener datos personales |
| `customers.consent_status` | `revoked` |
| `customers.anonymized_at` | instante de la anonimización |

- Después de anonimizar, el cliente queda excluido de toda mensajería y no puede haber filas `scheduled_messages` en `pending`: las pendientes pasan a `cancelled` con `cancel_reason='customer_erased'` en la misma transacción.
- El registro de supresiones guarda solo un hash con clave (HMAC) del teléfono original, sin vínculo con el alias. Si esa persona escribe de nuevo después de la supresión, se trata como un cliente nuevo que necesita un consentimiento nuevo.
- La operación es una sola transacción (bajo el bloqueo de `businesses`) e idempotente: repetirla sobre un cliente con `anonymized_at` no cambia nada y responde éxito. El alias es aleatorio, no se deriva de datos de la persona, y no se conserva ninguna correspondencia persona-alias.
- Semántica del endpoint: `DELETE /customers/:id` ejecuta esta anonimización (no elimina la fila) y responde 204. Los listados excluyen por defecto a los clientes anonimizados (`includeAnonymized` para verlos). Un cliente anonimizado no puede editarse, ni recibir citas nuevas ni consentimiento.
- Riesgo residual aceptado: combinaciones raras de fechas y servicios podrían permitir una reidentificación indirecta; se acepta una vez que direcciones y nombres están eliminados.
- Ajuste a las restricciones: `CHECK (anonymized_at IS NOT NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')`.

| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `businesses` | `name`, `timezone` (def. `America/Bogota`; inmutable tras la creación), `travel_buffer_min` (def. 0), `settings jsonb` (`followup_send_time` def. `09:00`), `wa_phone_id` nulo | `CHECK travel_buffer_min BETWEEN 0 AND 240` |
| `services` | `name`, `duration_min`, `price numeric(12,2)`, `followup_interval_days` nulo, `active`, `deleted_at` | `UNIQUE (business_id, lower(name)) WHERE deleted_at IS NULL` |
| `technicians` | `name` (nulo si fue anonimizado), `phone` nulo, `active`, `alias` nulo, `anonymized_at` nulo, `created_at` | `UNIQUE (business_id, id)` |
| `availability` | `technician_id`, `weekday` 1-7 (ISO), `start_time`, `end_time` | tipo `timerange`; `EXCLUDE (technician_id =, weekday =, timerange(start_time,end_time) &&)` |
| `time_off` | `technician_id`, `period tstzrange`, `reason` | `EXCLUDE (technician_id =, period &&)` |
| `customers` | `name`, `phone`, `address`, `notes`, `consent_status`, `consent_at`, `alias` nulo, `anonymized_at` nulo | `UNIQUE (business_id, phone)`; `UNIQUE (business_id, alias)`; `CHECK (anonymized_at IS NOT NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')`; `CHECK (consent_status <> 'granted' OR consent_at IS NOT NULL)` |
| `consent_events` | ver D2 | solo de inserción (sin UPDATE/DELETE en el repositorio) |
| `appointments` | `customer_id`, `service_id`, `technician_id`, `status`, `starts_at`, `ends_at`, `buffer_min`, `slot tstzrange`, `address_snapshot`, `price_snapshot`, `service_name_snapshot`, `technician_changed bool`, `completed_at`, `closed_at`, `closed_early`, `closure_reason`, `cancelled_at`, `cancel_reason` | `appointments_no_overlap EXCLUDE USING gist (technician_id WITH =, slot WITH &&) WHERE (status <> 'cancelled')`; `CHECK lower(slot) = starts_at AND upper(slot) >= ends_at`; `CHECK (NOT closed_early OR closure_reason IS NOT NULL)` |
| `appointment_closures` | `appointment_id`, `outcome` (`completed|no_show|reopened|completion_date_corrected`), `previous_outcome` (estado anterior de la cita: `pending|confirmed|completed|no_show`), `early`, `reason`, `completed_at_before`, `completed_at_after`, `actor`, `created_at` | solo de inserción; sirve de auditoría de cierres, correcciones y reaperturas |
| `scheduled_messages` | `customer_id`, `appointment_id`, `service_id`, `kind` (`followup`; luego `reminder_*`), `send_at`, `status` (`pending|sent|failed|cancelled`), `cancel_reason`, `attempts`, `wa_message_id` | `uq_scheduled_messages_appointment_kind UNIQUE (appointment_id, kind)`; `uq_followup_pending UNIQUE (customer_id, service_id) WHERE kind='followup' AND status='pending'`; trigger de consentimiento |

- Las citas cerradas (`completed` y `no_show`) conservan su rango, igual que `pending` y `confirmed`; solo `cancelled` lo libera. Así, una corrección o reapertura nunca vuelve a activar un conflicto.
- `uq_scheduled_messages_appointment_kind` hace idempotente el relleno por consentimiento tardío (`ON CONFLICT DO NOTHING`). La corrección `no_show -> completed` y un nuevo cierre tras una reapertura reutilizan la misma fila (`ON CONFLICT DO UPDATE SET status='pending', cancel_reason=NULL, send_at=...`).
- `send_at` = fecha local de `completed_at` (en la zona horaria del negocio) + `followup_interval_days`, a la hora local `followup_send_time` del negocio, convertida a `timestamptz`. `followup_send_time` es configurable por negocio (formato `HH:MM`, por defecto `09:00`) y se valida en el DTO. Una nueva finalización del mismo servicio cancela el seguimiento pendiente anterior (`cancel_reason='superseded'`). No se crea seguimiento si el cliente ya tiene una cita futura activa de ese servicio.
- Teléfono: el DTO de la API normaliza a E.164 con `libphonenumber-js` (o equivalente), usando `+57` como país por defecto cuando el número llega sin código; la interfaz también precarga `+57`. El `CHECK` de la tabla es la última defensa. Un duplicado dentro del negocio devuelve 409 (`customer_phone_taken`).

**Row Level Security: se difiere al sprint de autenticación.** Hoy no hay usuarios ni un rol de base de datos distinto del dueño de las tablas, así que la política no probaría nada real. Lo que sí se hace ahora para que activarla después sea una migración aislada: `business_id` y FK compuestas en todas las tablas, repositorios que siempre reciben `businessId`, y un ejecutor de transacciones que ya hace `SET LOCAL app.business_id`.

### D5. Propuesta de reasignación

Un cambio de horario es `ScheduleChange = add_time_off | replace_availability | deactivate | activate | remove_time_off | erase`. Una cita afectada es una cita `pending|confirmed` con `starts_at >= now` cuyo tramo de servicio queda fuera de la nueva disponibilidad. `planReassignments` (puro) recorre las citas afectadas en orden cronológico y busca, para cada una, técnicos libres en el mismo rango exacto. Aplica la regla de D3 y va actualizando en memoria la ocupación y la carga. Las citas sin reemplazo quedan con `toTechnicianId: null`. La propuesta es todo o nada: no se aplica nada de forma parcial. Si queda alguna cita sin reemplazo (`fullyResolvable = false`), el cambio original sigue bloqueado; el dueño resuelve esas citas a mano con el endpoint de reasignación manual (`POST /appointments/:id/reassign`) y luego repite el cambio. La propuesta cambia solo el técnico, nunca el horario.

```mermaid
sequenceDiagram
  participant UI as app
  participant C as ScheduleChangesController
  participant P as PreviewScheduleChange
  participant A as ApplyScheduleChange
  participant DB as Postgres
  UI->>C: POST /technicians/:id/schedule-changes/preview {change}
  C->>P: execute (read-only)
  P->>DB: load schedule snapshot
  P-->>UI: {affected[], proposal[], fullyResolvable}
  UI->>C: POST /technicians/:id/schedule-changes {change, reassignments[]}
  C->>A: execute
  A->>DB: BEGIN; lock businesses row
  A->>A: recompute affected; must equal reassignments set
  alt affected set changed
    A-->>UI: 409 proposal_stale {affected, proposal}
  else unresolved appointments remain
    A-->>UI: 409 schedule_conflict {affected, proposal}
  else a target slot is taken
    A-->>UI: 409 slot_taken
  else ok
    A->>DB: UPDATE appointments SET technician_id, technician_changed=true
    A->>DB: apply change (time_off / availability / active)
    A->>DB: COMMIT
    A-->>UI: 200
  end
```

Toda escritura sobre la disponibilidad, los días libres o el campo `active` de un técnico (desactivar `deactivate` y reactivar `activate`) pasa por este caso de uso. Esto también vale cuando no hay citas afectadas, como en la reactivación; en ese caso `reassignments` va vacío. El módulo CRUD `technicians` crea técnicos y edita su nombre y teléfono. La supresión (`DELETE /technicians/:id`) no es una escritura directa: invoca este mismo caso de uso con `change = erase`. Una cita afectada por `erase` es toda cita `pending|confirmed` con `starts_at >= now` del técnico. Orden de operaciones, dentro de una sola transacción: (1) bloquear la fila de `businesses`; (2) recalcular las citas afectadas; (3) si hay alguna sin cubrir por reasignaciones válidas, responder 409 `schedule_conflict` con `affected` y `proposal`, sin cambiar nada; (4) aplicar las reasignaciones (solo el técnico, nunca el horario; destino ocupado devuelve `slot_taken`; conjunto afectado distinto devuelve `proposal_stale`); (5) solo si ya no queda ninguna cita futura activa, anonimizar al técnico (alias aleatorio, `name` y `phone` en nulo, `anonymized_at`, `active = false`); (6) confirmar. Las citas que la propuesta no puede resolver se atienden a mano con `POST /appointments/:id/reassign` y luego se repite la supresión. La forma de la regla es la misma que la de desactivación y días libres. Aplicar con un destino ocupado devuelve `slot_taken`; `proposal_stale` se reserva para cuando cambió el conjunto de citas afectadas.

### D6. Módulos del backend, errores y OpenAPI

```
api/src/
  main.ts  app.module.ts  config/ (zod env)
  database/ kysely.provider.ts  transaction-runner.ts  migrations/  seed.ts  db.generated.ts
  shared/http/ problem-details.filter.ts  business-context.ts
  modules/ business-settings/ services/ technicians/ customers/   (controller + service + dto)
  scheduling/
    domain/ model/ services/ time/ errors.ts ports/ (incl. messaging.port.ts, reserved)
    application/ list-slots, create|move|reassign|cancel-appointment,
                 preview|apply-schedule-change, close-appointment, correct-closure (incl. reopen and completion-date edit), register-consent
    infrastructure/ persistence/ (kysely adapters, pg-error-translator.ts)  http/ (controllers, dto)
    scheduling.module.ts
```

- `POST /customers/:id/consents` vive en el controlador de `customers`, pero invoca `RegisterConsent` de `scheduling`. Así, el evento, la proyección y el relleno de seguimientos ocurren en una sola transacción.
- Errores: `DomainError` tiene un `code`. El filtro global responde `application/problem+json`. `slot_taken` (colisión con una cita no cancelada, incluida la concurrente; pg `23P01` sobre `appointments_no_overlap`), `schedule_conflict` (incluye `affected`), `proposal_stale` (cambió el conjunto de citas afectadas) y `customer_phone_taken` devuelven 409. `invalid_transition`, `early_closure_reason_required`, `early_closure_confirmation_required`, `reopen_confirmation_required` (falta `confirmReopen: true` al devolver una cita cerrada a `confirmed`) y `slot_not_offered` (hora fuera de la grilla generada) devuelven 422. `customer_has_future_appointments` (409, seguimiento posterior al sprint) rechaza `DELETE /customers/:id` cuando el cliente tiene citas `pending|confirmed` desde ahora; incluye `affected` como miembro de primer nivel, con la misma forma de cita que `schedule_conflict`. `not_found` devuelve 404 y los errores de validación de DTO, 400. `DELETE` existe solo para `customers` y `technicians` (anonimización en sitio con alias para técnicos y clientes, ver D4); los servicios nunca se borran.
- OpenAPI: se usan DTO con `class-validator` y el plugin CLI de `@nestjs/swagger`. `npm run openapi:export` crea la app sin escuchar (el pool de `pg` conecta en forma diferida) y escribe `api/openapi.json`, que se versiona. En `app/`, `npm run gen:api` corre `openapi-typescript ../api/openapi.json -o src/shared/api/schema.d.ts`. El cliente en tiempo de ejecución es `openapi-fetch`.

### D6.1 Convenciones de contrato de la API

- Los cuerpos de solicitud y de respuesta usan `snake_case`; los parámetros de consulta usan `camelCase` (por ejemplo `excludeAppointmentId` y `preferredTechnicianId` en `GET /slots`).
- `DELETE /technicians/:id` responde 200 con el resultado (reasignaciones y técnico), porque la supresión de un técnico puede llevar reasignaciones. `DELETE /customers/:id` responde 204 porque no tiene resultado que devolver. La asimetría queda registrada en `debts.md`.
- Precios: la interfaz los muestra en pesos colombianos (COP). Es un supuesto del sprint 1; los specs no definen moneda y la base guarda `price numeric(12,2)` sin código de moneda.

### D7. Pruebas

| Proyecto | Runner | Capas |
|---|---|---|
| `api/` | Vitest + `unplugin-swc` (metadatos de decoradores) | Unidad: dominio puro. Integración: adaptadores y restricciones con `@testcontainers/postgresql` (`postgres:16-alpine`), migraciones en `globalSetup` y `TRUNCATE` entre pruebas (no hay rollback por prueba porque las pruebas de concurrencia necesitan conexiones reales). HTTP: `supertest` sobre la app Nest |
| `app/` | Vitest + React Testing Library + jsdom + MSW | Componentes (grilla, diálogos), hooks de datos con MSW |

Se descartó Jest: con Vitest, los dos proyectos usan el mismo runner y es más rápido. El costo es el plugin SWC. Docker Compose sirve para desarrollo y Testcontainers para pruebas aisladas. Playwright se difiere. Comando de ambos: `npm test`. Después del commit 1 y del commit 12 hay que volver a correr `sdd-init`.

### D8. Frontend

- Rutas (React Router 7): `/agenda?view=day|week&date=YYYY-MM-DD`, `/customers`, `/customers/:id`, `/settings/business` (zona horaria solo de lectura, buffer de 0 a 240 minutos y hora de envío del seguimiento `followup_send_time`), `/settings/services`, `/settings/technicians` y `/settings/technicians/:id`.
- Estado: TanStack Query para el estado del servidor (hooks por funcionalidad con claves explícitas e invalidación después de cada comando), la URL para la vista y la fecha, y estado local para los diálogos. No hay store global.
- Estructura: `src/features/{agenda,appointments,customers,settings,closure}`, `src/shared/{api,ui,lib}` y `src/components/ui` (shadcn).
- Contrato de la grilla. La vista de semana usa columnas por día con carriles por técnico y un filtro por técnico en móvil. El buffer se muestra como una cola rayada. Cada cita es un `button` con `aria-label`, y su estado se indica con ícono y texto, no solo con color.

```ts
type AgendaGridProps = {
  view: 'day' | 'week'; days: string[]; timeZone: string;
  technicians: { id: string; name: string }[];
  appointments: { id: string; technicianId: string; startsAt: string; endsAt: string;
    occupiedUntil: string; status: AppointmentStatus; customerName: string;
    serviceName: string; technicianChanged: boolean }[];
  visibleHours: { startMinute: number; endMinute: number }; rowMinutes?: number; // default 15
  onAppointmentSelect(id: string): void;
  onEmptyCellSelect?(technicianId: string, day: string): void; // opens create dialog; slot still chosen from GET /slots
};
```

- PWA: `vite-plugin-pwa` con `generateSW`, que precachea solo el shell, usa `navigateFallback: '/index.html'` y no cachea `/api` en tiempo de ejecución. Sin conexión se muestra una pantalla simple del shell con el texto "Sin conexión. Necesitas internet para ver y modificar la agenda. Reintenta cuando recuperes señal." y un botón "Reintentar", sin datos de agenda (todo el texto de la interfaz usa español neutro con tuteo, sin voseo). La futura agenda en caché de solo lectura, fuera de alcance, deberá advertir que las citas pueden haber cambiado porque no hay conexión para validar reajustes. Manifest: `name: "Schedule App"`, `theme_color: #2563EB`, `background_color: #F8FAFC` e íconos de 192, 512 y maskable.
- Tokens (variables CSS de Tailwind v4 con shadcn): `--primary #2563EB` con texto `#FFFFFF` (5,2:1); texto `#0F172A`, fondo `#F8FAFC`, borde `#E2E8F0` y texto atenuado `#64748B` (4,8:1). Estados (fondo/texto, todos AA): `pending` `#FEF3C7/#92400E`, `confirmed` `#DBEAFE/#1E40AF`, `completed` `#DCFCE7/#166534`, `no_show` `#FEE2E2/#991B1B`, `cancelled` `#F1F5F9/#475569` tachado.

### D9. Repositorio y entorno de desarrollo

- `docker-compose.yml` en la raíz, con `postgres:16-alpine` y un volumen con nombre. `btree_gist` y el tipo `timerange` se crean en la primera migración, para que Testcontainers quede igual.
- Migraciones: **migrador de Kysely con SQL crudo, con `up` y `down`**, y Kysely como query builder; los tipos se generan con `kysely-codegen`. Se descartaron Prisma y TypeORM, que no modelan bien `EXCLUDE`, `tstzrange`, índices parciales ni triggers, y Drizzle por soporte parcial de rangos y exclusiones. `node-pg-migrate` era válido, pero agregaba una segunda herramienta.
- Entorno: `api/.env.example` (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `DEFAULT_BUSINESS_ID`), validado con zod al iniciar; `app/.env.example` (`VITE_API_BASE_URL`). Node 24 LTS (`.nvmrc` en cada proyecto).
- Siembra: `npm run db:seed` inserta el negocio por defecto con `DEFAULT_BUSINESS_ID` y usa `ON CONFLICT (id) DO NOTHING`, así que es idempotente. El esquema soporta varios negocios; en el sprint 1 solo se siembra uno y `BusinessContext` devuelve ese id hasta que exista autenticación.

### D10. Plan de tajadas actualizado

La estrategia es `exception-ok`: puede ir en un solo PR, pero con commits por unidad de trabajo, cada uno con sus pruebas. Estimación revisada: **9.000-12.000 líneas**, porque se agregaron la propuesta de reasignación, el cierre anticipado y la auditoría.

1. Base de `api/`: Nest, config, Vitest + SWC, lint, docker compose y arnés de Testcontainers.
2. Migraciones, siembra, codegen y traductor de errores de pg, con pruebas de restricciones (`EXCLUDE`, trigger de consentimiento, índices únicos).
3. API de configuración del negocio y de servicios.
4. CRUD de técnicos y lectura de disponibilidad y días libres.
5. Dominio puro: `zoned-clock`, `generateSlots` y `assignTechnician`.
6. `GET /slots`, crear y cancelar citas, con prueba de concurrencia.
7. Mover y reasignar citas (prioridad del técnico actual y `technician_changed`).
8. Vista previa y aplicación de cambios de horario, y `planReassignments`.
9. Clientes, `consent_events` y relleno de seguimientos por consentimiento tardío.
10. Cierre, corrección, auditoría y programación del seguimiento.
11. Exportación de OpenAPI y `openapi.json` versionado.
12. Base de `app/`: Vite, Tailwind, shadcn, tokens, PWA, router, Query, cliente generado y Vitest/RTL/MSW.
13. Pantallas de configuración, incluido el diálogo de conflicto y propuesta.
14. Componente `AgendaGrid` (día y semana).
15. Diálogos de cita: crear, mover y cancelar a partir de cupos.
16. Lista y ficha de clientes, y registro del consentimiento.
17. UI de cierre: normal, anticipado con confirmación reforzada, y corrección.

### D11. Máquina de estados y reapertura

| Desde | Hacia | Condición |
|---|---|---|
| `pending`, `confirmed` | `cancelled` | cancelar; libera el bloque |
| `pending`, `confirmed` | `completed`, `no_show` | cierre normal con confirmación explícita; cierre anticipado exige `reason` y `confirmEarly` |
| `completed`, `no_show` | `no_show`, `completed` (la contraria) | corrección de cierre |
| `completed`, `no_show` | `confirmed` | reapertura: exige `confirmReopen: true` y un motivo; sin la bandera responde 422 `reopen_confirmation_required` |
| `completed` | `completed` (otra fecha) | corrección de la fecha de completado |
| `cancelled` | cualquiera | prohibido (`invalid_transition`); se crea una cita nueva |

- Reapertura: la cita vuelve a `confirmed`; se limpian `completed_at`, `closed_at`, `closed_early` y `closure_reason`; el seguimiento pendiente asociado pasa a `cancelled` con `cancel_reason='reopened'`; se inserta una fila en `appointment_closures` con `outcome='reopened'` y `previous_outcome` igual al estado anterior (`completed` o `no_show`), actor, instante y motivo. El bloque no cambia. Un nuevo cierre posterior vuelve a aplicar la regla de seguimiento y reutiliza la fila por `uq_scheduled_messages_appointment_kind`.
- Corrección de la fecha de completado: `outcome='completion_date_corrected'`, con `completed_at_before` y `completed_at_after`; el `send_at` del seguimiento pendiente se recalcula (fecha local nueva + intervalo, a `followup_send_time`) sin duplicar la fila.
- Corrección `completed -> no_show`: cancela el seguimiento (`cancel_reason='closure_corrected'`). Corrección `no_show -> completed`: aplica la regla de seguimiento al completar.
- Mover, reasignar y cancelar solo aplican a `pending|confirmed`; una cita cerrada debe reabrirse antes.

## Deuda técnica

Los respaldos de la base de datos no se pueden editar, por lo que una persona que pidió la supresión de sus datos reaparecería al restaurar un respaldo. La mitigación prevista, para abordar al final del proyecto, es un registro de supresiones (lápidas) que guarde únicamente un hash con clave (por ejemplo HMAC con un secreto) del identificador, como el teléfono, y nunca los datos personales. Además, un mecanismo que, después de cualquier restauración y en toda ruta de escritura o importación, consulte ese registro y vuelva a purgar o se niegue a escribir de nuevo a las personas suprimidas. El derecho de supresión de la Ley 1581 de 2012 ("borrar mis datos") pertenece a la era del bot, y este registro es su red de seguridad. No se implementa en el sprint 1.

## Flujo de datos: crear una cita

```
app CreateAppointmentDialog -> GET /slots?serviceId&from&days -> ListSlots -> generateSlots
app -> POST /appointments {customerId, serviceId, startsAt, address, technicianId?}
  CreateAppointment: BEGIN; lock businesses; regenerate day slots; require startsAt offered;
  assignTechnician; INSERT appointments (status confirmed, snapshots, slot incl. buffer); COMMIT
  address is always required (the app pre-fills the customer's last saved address; the chosen address updates the customer record)
  23P01 -> SlotTakenError -> 409 slot_taken -> app refreshes slots
```

Flujo de cierre: `CloseAppointment` valida la transición `pending|confirmed -> completed|no_show` (siempre con confirmación explícita de una persona). Si `now < starts_at`, exige `reason` y `confirmEarly: true`. Después escribe `appointment_closures` y, si el resultado es `completed`, aplica `FollowupPolicy`: requiere consentimiento e intervalo, que no exista una cita futura activa del mismo servicio, y reemplaza el seguimiento pendiente anterior (`cancel_reason='superseded'`). `CorrectClosure` cubre las correcciones (ver D11).

## Cambios de archivos

| Ruta | Acción | Descripción |
|---|---|---|
| `docker-compose.yml` | Crear | Postgres 16 de desarrollo |
| `api/` | Crear | Proyecto NestJS (estructura en D6), `openapi.json` y `.env.example` |
| `app/` | Crear | Proyecto React + Vite + PWA (estructura en D8) |
| `openspec/config.yaml` | Modificar | Stack, comandos de prueba y `strict_tdd` después de las tajadas 1 y 12 |
| `.gitignore` | Crear | `node_modules`, `.env` y `dist` |

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unidad | Cupos, asignación, planificador, `FollowupPolicy`, máquina de estados y zona horaria con horario de verano | Vitest, funciones puras |
| Integración | `EXCLUDE` (cupo ocupado), dos reservas concurrentes (solo una gana), bloqueo frente a día libre, relleno idempotente, trigger de consentimiento | Testcontainers |
| HTTP | Contratos, códigos de error y problem+json | supertest |
| UI | Grilla, diálogos y manejo de 409 | RTL + MSW |

## Migración y despliegue

Proyecto nuevo, sin datos. Cada migración tiene su `down`. Para revertir basta con revertir commits.

## Preguntas abiertas

No quedan preguntas abiertas. Resueltas: `followup_send_time` configurable por negocio (por defecto `09:00`); una cita cerrada antes de tiempo o `no_show` conserva su bloque; el borrado de clientes y técnicos es anonimización en sitio con alias; la duración de un servicio se puede cambiar con una advertencia informativa que no bloquea; la zona horaria es fija por negocio; la dirección es siempre obligatoria al crear una cita y no existe un indicador por servicio; el motivo de cancelación es opcional; la revocación del consentimiento cancela de inmediato los seguimientos pendientes; la pantalla sin conexión tiene texto y botón definidos.
