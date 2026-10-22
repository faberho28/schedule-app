# Delta for service-closure

## ADDED Requirements

### Requirement: Cierre por confirmación explícita

El sistema MUST permitir cerrar una cita `pending` o `confirmed` como `completed` o `no_show` únicamente mediante una acción explícita de una persona con confirmación; el cierre normal siempre exige esa confirmación. Las citas creadas a mano nacen `confirmed` y las creadas por el bot nacerán `pending`; el cierre aplica a ambos estados. El sistema MUST NOT cerrar citas automáticamente por paso del tiempo. Una cita cerrada (`completed` o `no_show`) conserva su bloque de tiempo completo.

#### Scenario: Completar cita tras su hora

- GIVEN una cita `confirmed` cuya hora de inicio ya pasó
- WHEN el dueño la marca como Completada y confirma
- THEN el estado es `completed` y se registra `completed_at`

#### Scenario: Marcar no asistió

- GIVEN una cita `confirmed` cuya hora ya pasó
- WHEN el dueño la marca como No asistió y confirma
- THEN el estado es `no_show` y no se crea seguimiento

#### Scenario: Cerrar una cita pendiente

- GIVEN una cita `pending` cuya hora de inicio ya pasó
- WHEN el dueño la marca como Completada y confirma
- THEN el estado es `completed`

#### Scenario: Sin cierre automático

- GIVEN una cita `confirmed` cuya hora terminó hace 3 días sin acción del dueño
- WHEN transcurre el tiempo
- THEN la cita sigue `confirmed`

#### Scenario: Cita cancelada

- GIVEN una cita `cancelled`
- WHEN se intenta cerrarla como `completed`
- THEN el sistema rechaza la operación

### Requirement: Cierre anticipado auditado

El sistema MUST permitir cerrar una cita antes de su hora de inicio solo con motivo obligatorio y confirmación reforzada. El sistema MUST registrar quién, cuándo y por qué.

#### Scenario: Cierre anticipado válido

- GIVEN una cita `confirmed` que empieza mañana
- WHEN el dueño la marca Completada con motivo "Servicio adelantado por el cliente" y confirmación reforzada
- THEN la cita pasa a `completed` y se guarda el registro de auditoría con actor, instante y motivo

#### Scenario: El cierre anticipado no libera el bloque

- GIVEN una cita de 10:00 a 11:00 con buffer de 15 cerrada anticipadamente a las 10:20
- WHEN se consultan los cupos del técnico
- THEN el bloque 10:00-11:15 sigue ocupado

#### Scenario: Cierre anticipado sin motivo

- GIVEN una cita `confirmed` que empieza mañana
- WHEN el dueño intenta cerrarla sin motivo
- THEN el sistema rechaza el cierre y la cita no cambia

#### Scenario: Cierre anticipado sin confirmación reforzada

- GIVEN el mismo caso con motivo pero sin la confirmación reforzada
- WHEN se envía el cierre
- THEN el sistema rechaza la operación

### Requirement: Seguimiento al completar

Al completar una cita de un cliente con consentimiento otorgado y cuyo servicio tenga `followup_interval_days`, el sistema MUST insertar exactamente una fila de seguimiento pendiente en `scheduled_messages` con fecha igual a la fecha de completado más el intervalo. La fecha se calcula en la zona horaria del negocio y la hora de envío es `followup_send_time` (por defecto 09:00). Una nueva finalización del mismo servicio para el mismo cliente MUST reemplazar (superseder) el seguimiento pendiente anterior. El sistema MUST NOT crear seguimiento si el cliente ya tiene una cita futura activa de ese servicio. El sistema MUST NOT enviar mensajes en este sprint.

#### Scenario: Seguimiento programado

- GIVEN un cliente con consentimiento, un servicio con intervalo de 180 días y `followup_send_time` 09:00
- WHEN la cita se completa el 2026-11-01
- THEN existe una única fila de seguimiento `pending` programada para 2027-04-30 a las 09:00 hora local del negocio

#### Scenario: Una nueva finalización reemplaza el seguimiento pendiente

- GIVEN un cliente con un seguimiento `pending` de un servicio y una nueva cita completada del mismo servicio
- WHEN la nueva cita se completa
- THEN el seguimiento anterior queda anulado como reemplazado y existe un único seguimiento `pending` calculado desde la nueva fecha

#### Scenario: Cita futura del mismo servicio

- GIVEN un cliente con consentimiento y una cita futura `confirmed` del mismo servicio
- WHEN una cita de ese servicio se completa
- THEN no se crea seguimiento

#### Scenario: Servicio sin intervalo

- GIVEN un servicio sin `followup_interval_days`
- WHEN la cita se completa
- THEN no se crea fila en `scheduled_messages`

#### Scenario: Cliente sin consentimiento

- GIVEN un cliente con consentimiento pendiente
- WHEN la cita se completa
- THEN no se crea fila en `scheduled_messages`

### Requirement: Corrección del cierre

El sistema MUST permitir corregir el cierre de una cita entre `completed` y `no_show`, devolver una cita cerrada (`completed` o `no_show`) a `confirmed` con confirmación reforzada (la API MUST rechazar con 422 la solicitud sin la bandera de confirmación), y corregir su fecha de completado. Toda corrección y reapertura MUST registrar quién, cuándo y por qué. Al devolver una cita a `confirmed`, el seguimiento asociado MUST anularse, MUST limpiarse la información de cierre (fecha de completado, marca y motivo de cierre anticipado) y el bloque de tiempo de la cita MUST seguir ocupado sin cambios. Al corregir de `completed` a `no_show`, el seguimiento asociado MUST anularse. Al corregir la fecha de completado, el seguimiento pendiente MUST recalcularse. Al corregir de `no_show` a `completed`, MUST aplicarse la regla de seguimiento al completar. La corrección MUST NOT dejar más de un seguimiento activo para la cita.

#### Scenario: De completada a no asistió

- GIVEN una cita `completed` con seguimiento pendiente
- WHEN el dueño corrige a `no_show`
- THEN el seguimiento queda anulado

#### Scenario: Devolver una cita cerrada a confirmada

- GIVEN una cita `completed` con seguimiento pendiente
- WHEN el dueño la devuelve a `confirmed` con confirmación reforzada
- THEN la cita queda `confirmed`, el seguimiento queda anulado y se registra quién, cuándo y por qué

#### Scenario: Devolver a confirmada sin confirmación reforzada

- GIVEN una cita `completed`
- WHEN el dueño intenta devolverla a `confirmed` sin la confirmación reforzada
- THEN el sistema responde 422 y la cita sigue `completed`

#### Scenario: Devolver una cita no asistida a confirmada

- GIVEN una cita `no_show`
- WHEN el dueño la devuelve a `confirmed` con confirmación reforzada
- THEN la cita queda `confirmed`, se registra quién, cuándo y por qué, y su bloque sigue ocupado

#### Scenario: Cambio de fecha de completado

- GIVEN una cita completada el 2026-11-01 con intervalo 90 días
- WHEN el dueño corrige la fecha de completado al 2026-11-05
- THEN el seguimiento pendiente se recalcula a 2027-02-03 sin duplicarse

#### Scenario: De no asistió a completada

- GIVEN una cita `no_show` de cliente con consentimiento y servicio con intervalo
- WHEN el dueño corrige a `completed`
- THEN se crea exactamente un seguimiento pendiente

### Requirement: Citas canceladas no se reabren

El sistema MUST NOT reabrir citas `cancelled`; MUST exigir crear una cita nueva.

#### Scenario: Corrección sobre cancelada

- GIVEN una cita `cancelled`
- WHEN el dueño intenta corregir su cierre
- THEN el sistema rechaza la operación e indica crear una cita nueva

## Open questions

Ninguna pendiente específica de esta capacidad. Notas: en este sprint nunca se envían mensajes, por lo que solo existen seguimientos pendientes; las evidencias (fotos) quedan fuera del sprint; el actor se registra como el dueño fijo mientras no exista autenticación.
