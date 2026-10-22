# Propuesta: Sprint 1 - PWA del dueño y backend de agendamiento

## Intención (Intent)

Los dueños de negocios de servicios agendan a mano en chats de WhatsApp y cuadernos, lo que genera dobles agendamientos y pérdida de ingresos recurrentes (PRD, "Resumen y problema"). Antes de construir el bot de WhatsApp, necesitamos el núcleo del negocio del que dependerá: un dominio de agendamiento confiable (cupos, técnicos, protección contra cruces, cierre y seguimiento) y una PWA para que el dueño lo configure y lo opere. El éxito significa que un dueño puede configurar el negocio y operar la agenda de punta a punta, sin que sea posible ningún cruce de citas.

## Alcance (Scope)

### Dentro del alcance (In Scope)
- Configuración: servicios (nombre, duración, precio, intervalo de seguimiento), técnicos (modelo y UI multi-técnico completos), disponibilidad semanal y días libres por técnico, buffer de desplazamiento por negocio.
- Agenda: vistas de día y de semana, una columna por técnico; crear, mover y cancelar citas a mano, solo en cupos generados por el sistema.
- Asignación automática de técnico (disponible en el cupo -> menos cargado del día -> técnico más antiguo por `created_at`, luego `id`) con reasignación manual.
- Ficha de cliente con historial de servicios; creación manual de clientes con consentimiento PENDIENTE y autorización previa registrada por el dueño (fecha, medio, auditable; Ley 1581).
- Cierre del servicio: Completada / No asistió, corregible (incluida la reapertura a `confirmed` con confirmación reforzada y la edición de la fecha de completado); al completar se inserta una fila de seguimiento en `scheduled_messages` (nunca se envía) a las 09:00 hora local por defecto (configurable por negocio); la corrección la anula o la recalcula; no se crean filas para clientes sin consentimiento.
- Shell de PWA instalable ("Schedule App", paleta primaria azul).

### Fuera del alcance (Out of Scope)
- Login, roles, autenticación (se asume dueño autenticado; se construye al final).
- Vistas para el técnico, bandeja de conversaciones, configuración de textos del bot.
- Integración con WhatsApp, bot, worker de mensajes, recordatorios.
- Pagos, reportes, notificaciones push, arrastrar y soltar en la agenda.

## Capacidades (Capabilities)

### New Capabilities
- `business-settings`: zona horaria única del negocio (por defecto America/Bogota, fija desde la creación), buffer de desplazamiento y hora de envío del seguimiento (`followup_send_time`, por defecto 09:00).
- `service-catalog`: alta, edición y desactivación de servicios (desactivación y borrado lógico; los servicios nunca se eliminan físicamente).
- `technician-schedules`: técnicos (incluida su supresión por anonimización con alias, solo si no quedan citas futuras activas, mediante el flujo de reasignación), disponibilidad semanal, días libres, desactivación y reactivación (con rechazo por conflicto y propuesta de reasignación).
- `slot-availability`: generación de cupos y asignación automática de técnico; una única lógica que reutilizará el bot.
- `appointment-management`: crear, mover, reasignar, cancelar; bloqueo absoluto de cruces.
- `customer-records`: clientes (incluida su supresión por anonimización en sitio), estado y auditoría del consentimiento, efecto de la revocación, dirección guardada, historial de servicios.
- `service-closure`: Completada / No asistió, corrección (incluida la reapertura a `confirmed` y la fecha de completado), programación del seguimiento.
- `owner-agenda-ui`: shell de la PWA, grilla día/semana por técnico, pantallas de configuración y de clientes.

### Modified Capabilities
- Ninguna (proyecto nuevo).

## Enfoque (Approach)

- Repositorio: `api/` (NestJS, adaptador Express) y `app/` (PWA con React + Vite) como proyectos independientes; `openspec/` compartido en la raíz.
- Hexagonal solo para el agendamiento (cupos, asignación, estados de la cita, cierre, seguimiento) detrás de puertos; módulos CRUD simples para servicios, técnicos, horarios y clientes. Se reserva un `MessagingPort`, sin implementarlo.
- Postgres 16 + `btree_gist`; `EXCLUDE USING gist (technician_id WITH =, slot WITH &&)` para citas no canceladas; el adaptador de persistencia traduce la violación a `slot_taken` (409), mostrado como "cupo ocupado".
- Contrato: OpenAPI generado con `@nestjs/swagger`; `app/` genera su cliente tipado a partir de él.
- UI: shadcn/ui + Tailwind; calendario propio con CSS Grid, encapsulado en un solo componente.
- Tablas de este sprint: `businesses` (el modelo soporta varios negocios; se siembra uno), `services`, `technicians`, `availability`, `time_off`, `customers`, `appointments`, `scheduled_messages`, `consent_events` (auditoría del consentimiento: fecha, medio y rastro; el PRD solo lista `consent_at`) y `appointment_closures` (auditoría de cierres, correcciones y reaperturas). Todas las tablas llevan `business_id`.
- Borrado: los datos operativos (servicios, citas y similares) usan borrado lógico (`deleted_at`; servicios además `active`) y no tienen `DELETE`. Clientes y técnicos se suprimen mediante anonimización en sitio (un técnico con citas futuras activas se rechaza y pasa por la reasignación antes) (`DELETE` documentado): se conserva el `id` y el historial, y todo dato personal se reemplaza por un alias o marcador aleatorio (ver diseño). No hay borrado en cascada.
- Tablas diferidas: `users` (autenticación), `conversations`, log de idempotencia de mensajes entrantes, estado de paso a humano.

## Áreas afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `api/` | Nuevo | App NestJS, migraciones, dominio de agendamiento, CRUD, OpenAPI |
| `app/` | Nuevo | PWA React, cliente generado, pantallas |
| `openspec/specs/` | Nuevo | 8 specs de capacidades |
| `openspec/config.yaml` | Modificado | Contexto del stack y test runner cuando se elija |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| El buffer de desplazamiento no está cubierto por la restricción EXCLUDE (condiciones de carrera) | Media | Resuelto en el diseño (D1): el `slot` incluye el buffer copiado en la cita, de modo que `EXCLUDE` lo cubre |
| El tamaño del sprint desborda la revisión | Alta | Estrategia `exception-ok`: el tamaño del PR no importa; se mantienen commits por unidad de trabajo (ver estimación) |
| Errores de zona horaria y horario de verano en el cálculo de cupos | Media | `timestamptz` en todo; conversión a la zona del negocio en un solo lugar; pruebas unitarias |
| Reglas indefinidas para ediciones que dejan citas huérfanas | Media | Resueltas en la ronda de preguntas (propuesta de reasignación todo o nada); no quedan preguntas abiertas en los specs |
| Respaldos reintroducen datos de personas que pidieron supresión (Ley 1581) | Baja por ahora | Deuda técnica: registro de supresiones con hash con clave, al final del proyecto (ver diseño) |
| Supuesto sobre la política de opt-in de Meta | Baja por ahora | Marcado para verificar antes del trabajo del bot |

## Plan de reversión (Rollback)

Proyecto nuevo, sin datos de producción. Cada commit por unidad de trabajo se puede revertir por separado; cada migración incluye su migración de bajada. Revertir todo el sprint implica revertir los commits hasta `2d39bef`.

## Dependencias

- Postgres 16 con `btree_gist` (Docker local).
- Un test runner elegido en la primera tajada; volver a correr `sdd-init` después para activar TDD estricto.

## Criterios de éxito

- [ ] El dueño configura servicios, técnicos, disponibilidad, días libres y buffer desde la PWA.
- [ ] La agenda muestra día y semana por técnico; crear, mover y cancelar solo mediante cupos ofrecidos.
- [ ] El agendamiento concurrente del mismo cupo de un técnico es rechazado por la base de datos (`slot_taken`, 409) y se muestra como "cupo ocupado".
- [ ] Un día libre sobre citas existentes se rechaza, listando las citas afectadas.
- [ ] Completar una cita de un cliente con consentimiento y con intervalo de seguimiento crea exactamente una fila de seguimiento pendiente; corregir el cierre la anula o la recalcula.
- [ ] Los clientes sin consentimiento nunca reciben filas en `scheduled_messages`.
- [ ] El cliente de `app/` se genera a partir del documento OpenAPI de la API.

## Estimación de carga de revisión (Review Workload Forecast)

- Líneas cambiadas estimadas: 9.000-12.000 (sin lockfiles ni cliente generado), por la propuesta de reasignación, el cierre anticipado, la reapertura y la auditoría.
- Estrategia de entrega: `exception-ok`. El tamaño del PR no importa; se mantienen commits por unidad de trabajo, cada uno con sus pruebas.
- Riesgo frente al presupuesto de 400 líneas: Alto (aceptado mediante la excepción de tamaño)
- Decisión necesaria antes de implementar: No (la estrategia ya está decidida)
- Plan de commits: 17 unidades de trabajo, definidas en el diseño (D10): (1) base de `api/`; (2) migraciones, siembra y restricciones; (3) configuración del negocio y servicios; (4) técnicos, disponibilidad y días libres; (5) dominio puro de cupos y asignación; (6) `GET /slots`, crear y cancelar citas; (7) mover y reasignar citas; (8) cambios de horario y propuesta de reasignación; (9) clientes y consentimiento; (10) cierre, corrección y seguimiento; (11) OpenAPI; (12) base de `app/`; (13) pantallas de configuración; (14) `AgendaGrid`; (15) diálogos de cita; (16) clientes en la interfaz; (17) UI de cierre.

## Decisiones de la ronda de preguntas

Las reglas de producto vienen de las rondas realizadas con el usuario (engram `decision/sprint-1-product-rules` y `decision/sprint-1-question-round`). Las 11 preguntas abiertas quedaron resueltas, igual que las seis posteriores (advertencia al cambiar la duración, zona horaria fija, dirección obligatoria, motivo de cancelación opcional, revocación de consentimiento y pantalla sin conexión):

1. **Cupos adaptativos:** el primer cupo del día es la hora de inicio del técnico; cada cupo nuevo arranca al terminar una cita más su buffer. Una cita ocupa duración + buffer (buffer configurable por negocio).
2. **Estado inicial:** las citas creadas a mano nacen `confirmed`; `pending` queda reservado para el bot.
3. **Carga del técnico:** se mide en minutos agendados del día, no en cantidad de citas.
4. **Mover una cita:** se ofrecen cupos de todos los técnicos; el técnico actual tiene prioridad si está libre; si no, el menos cargado. Si el técnico cambia, la cita queda marcada para que el futuro mensaje de reprogramación lo informe.
5. **Edición de disponibilidad o desactivación de un técnico con citas futuras afectadas:** se rechaza igual que los días libres, listando las citas afectadas. El sistema ofrece una propuesta de reasignación automática (misma regla de asignación) que el dueño acepta o rechaza; se aplica todo o nada en una transacción; solo cambia el técnico, nunca el horario; las citas sin reemplazo posible se resuelven a mano y mientras tanto el cambio sigue bloqueado.
6. **Cierre:** lo hace siempre una persona con confirmación explícita. Cierre anticipado (antes de la hora de inicio) permitido con motivo obligatorio y confirmación reforzada, con registro de quién, cuándo y por qué. Las evidencias (fotos) quedan para una fase posterior. Una cita cerrada (`completed` o `no_show`) puede volver a `confirmed` con confirmación reforzada, anulando su seguimiento y registrando auditoría. Las citas canceladas no se reabren: se crea una nueva. Ningún estado distinto de `cancelled` libera el bloque de tiempo (ni el cierre anticipado ni `no_show`).
7. **Consentimiento tardío:** al registrarse el consentimiento se revisa el historial; solo cuenta la última cita completada de cada servicio con intervalo de seguimiento; si la fecha (completado + intervalo) ya pasó o el cliente ya tiene cita futura de ese servicio o seguimiento pendiente, no se crea; debe ser idempotente mediante una restricción de unicidad en la base.
8. **Fecha del seguimiento:** fecha de completado + intervalo (PRD, RF4.2).
9. **Dirección y precio:** se copian (snapshot) en la cita al crearla. La dirección es siempre obligatoria al crear una cita (sin indicador por servicio); la PWA precarga la última dirección guardada del cliente para confirmarla o editarla.
10. **Teléfono:** obligatorio y normalizado a E.164 por la API; la interfaz precarga `+57` y la API lo usa como respaldo.
11. **Offline:** solo el shell instalable en el sprint 1, con una pantalla "Sin conexión" y un botón "Reintentar", sin datos de agenda. Mejora posterior: agenda en caché de solo lectura, que deberá avisar de forma visible que las citas mostradas pueden haber cambiado porque no hay conexión para validar reajustes.
