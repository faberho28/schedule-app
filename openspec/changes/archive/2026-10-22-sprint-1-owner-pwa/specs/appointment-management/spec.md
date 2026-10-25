# Delta for appointment-management

## ADDED Requirements

### Requirement: Creación manual de citas solo en cupos generados

El sistema MUST permitir al dueño crear citas a mano únicamente sobre cupos generados por `slot-availability`. La cita MUST crearse con estado `confirmed`; `pending` queda reservado para el bot. La cita MUST guardar cliente, servicio, técnico, horario, y una copia (snapshot) de la dirección y del precio vigentes al crearla. La dirección MUST ser siempre obligatoria al crear una cita, sin importar el tipo de servicio ni si el lugar es un domicilio o un negocio; NO existe un indicador por servicio de "requiere dirección". La PWA MUST precargar la última dirección guardada del cliente y permitir confirmarla o editarla; el futuro bot preguntará "¿Te gustaría recibir el servicio en la dirección guardada?" y el cliente confirmará o actualizará (PRD RF2, paso 2).

#### Scenario: Crear cita en cupo ofrecido

- GIVEN un cliente, un servicio de 60 minutos a 100000 y un cupo ofrecido a las 10:00
- WHEN el dueño crea la cita
- THEN la cita queda `confirmed`, con técnico asignado, precio 100000 y la dirección copiada

#### Scenario: Dirección precargada

- GIVEN un cliente con dirección guardada "Calle 10 # 5-20"
- WHEN el dueño abre el diálogo de nueva cita
- THEN la dirección aparece precargada y el dueño puede confirmarla o editarla antes de crear la cita

#### Scenario: Dirección ausente

- GIVEN un cliente, un servicio y un cupo ofrecido
- WHEN el dueño intenta crear la cita sin dirección
- THEN el sistema rechaza la creación con un error de validación

#### Scenario: Cupo no generado por el sistema

- GIVEN un horario que no corresponde a ningún cupo generado
- WHEN se intenta crear una cita en ese horario
- THEN el sistema rechaza la creación con `slot_not_offered` (422)

#### Scenario: Snapshot inmune a cambios posteriores

- GIVEN una cita creada con dirección "Calle 10 # 5-20"
- WHEN el cliente cambia su dirección a "Carrera 7 # 1-1"
- THEN la cita conserva "Calle 10 # 5-20"

### Requirement: Bloqueo absoluto de cruces

El sistema MUST impedir que dos citas no canceladas de un mismo técnico tengan bloques ocupados (duración más buffer) que se solapen. Toda cita con estado distinto de `cancelled` (`pending`, `confirmed`, `completed`, `no_show`) MUST mantener su bloque completo: cerrar una cita antes de tiempo no libera el resto del bloque y `no_show` tampoco lo libera; solo `cancelled` lo libera. La garantía MUST ser aplicada por la base de datos, incluso con solicitudes concurrentes. El sistema MUST NOT ofrecer forma de forzar un cruce. Cuando la hora pedida colisiona con una cita no cancelada (incluida una solicitud concurrente), la API MUST responder `slot_taken` (409), mostrado como "cupo ocupado"; `slot_not_offered` (422) se reserva para horas fuera de la grilla generada.

#### Scenario: Reservas concurrentes del mismo cupo

- GIVEN dos solicitudes simultáneas para el mismo cupo del mismo técnico
- WHEN ambas se procesan
- THEN exactamente una cita se crea y la otra recibe `slot_taken` (409), mostrado como "cupo ocupado"

#### Scenario: Solape por buffer

- GIVEN una cita de 10:00-11:00 con buffer de 15 para el técnico A
- WHEN se intenta crear otra cita para A a las 11:10
- THEN el sistema la rechaza con `slot_taken` (409), mostrado como "cupo ocupado"

#### Scenario: Cita cerrada mantiene el bloque

- GIVEN una cita `completed` o `no_show` de 10:00 a 11:00 con buffer de 15, cerrada antes de que termine el bloque
- WHEN se intenta crear otra cita para el mismo técnico a las 10:30
- THEN el sistema responde `slot_taken` (409)

#### Scenario: Liberación al cancelar

- GIVEN una cita `cancelled` que ocupaba el cupo de las 10:00
- WHEN se crea una nueva cita en ese cupo
- THEN la creación tiene éxito

### Requirement: Mover citas

El sistema MUST permitir mover una cita `pending` o `confirmed` únicamente a cupos generados, aplicando las reglas de `slot-availability` para mover (`excludeAppointmentId` y `preferredTechnicianId`). El movimiento MUST liberar el bloque anterior y ocupar el nuevo de forma atómica, y MUST tomar de nuevo el buffer vigente (`buffer_min`) para la cita.

#### Scenario: Mover a cupo libre

- GIVEN una cita confirmada a las 10:00 y un cupo libre a las 14:00
- WHEN el dueño la mueve a las 14:00
- THEN la cita queda a las 14:00 y las 10:00 vuelve a estar libre

#### Scenario: Cupo ocupado durante el movimiento

- GIVEN que otro usuario ocupó el cupo destino después de listarlo
- WHEN el dueño confirma el movimiento
- THEN el sistema responde `slot_taken` (409), mostrado como "cupo ocupado", y la cita conserva su horario original

#### Scenario: Cita cerrada

- GIVEN una cita `completed`, `no_show` o `cancelled`
- WHEN se intenta moverla
- THEN el sistema rechaza la operación (una cita cerrada debe reabrirse a `confirmed` antes; una cancelada no se reabre)

### Requirement: Reasignación manual de técnico

El sistema MUST permitir al dueño reasignar manualmente una cita `pending` o `confirmed` a otro técnico disponible en el mismo horario, sin cambiar la hora, y MUST marcar la cita con cambio de técnico. Este endpoint de reasignación manual es también el medio para resolver a mano las citas no resueltas de una propuesta de reasignación (ver `technician-schedules`).

#### Scenario: Reasignar a técnico libre

- GIVEN una cita del técnico A a las 10:00 y el técnico B libre a esa hora
- WHEN el dueño reasigna la cita a B
- THEN la cita pasa a B, conserva la hora y queda marcada con cambio de técnico

#### Scenario: Técnico destino ocupado

- GIVEN el técnico B ocupado a las 10:00
- WHEN el dueño intenta reasignar a B
- THEN el sistema responde `slot_taken` (409), mostrado como "cupo ocupado", y no cambia la cita

### Requirement: Cancelación de citas

El sistema MUST permitir cancelar una cita `pending` o `confirmed`, pasándola a `cancelled` y liberando su bloque. El motivo de cancelación MUST ser opcional. Una cita `cancelled` MUST NOT reabrirse; para volver a agendar se MUST crear una cita nueva.

#### Scenario: Cancelar cita confirmada

- GIVEN una cita `confirmed`
- WHEN el dueño la cancela
- THEN su estado es `cancelled` y el cupo vuelve a ofrecerse

#### Scenario: Cancelar sin motivo

- GIVEN una cita `confirmed`
- WHEN el dueño la cancela sin indicar motivo
- THEN la cita pasa a `cancelled` sin error

#### Scenario: Intento de reabrir

- GIVEN una cita `cancelled`
- WHEN se intenta cambiar su estado a `confirmed`
- THEN el sistema rechaza la operación

## Open questions

Ninguna.
