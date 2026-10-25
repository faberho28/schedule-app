# Delta for technician-schedules

## ADDED Requirements

### Requirement: Gestión de técnicos

El sistema MUST permitir crear y editar técnicos con `name` (obligatorio), `phone` (opcional) y `active`. El modelo y la operación MUST soportar múltiples técnicos desde este sprint.

#### Scenario: Crear técnico

- GIVEN un negocio sin técnicos
- WHEN el dueño crea al técnico "Carlos"
- THEN el técnico queda activo y disponible para configurar su horario

#### Scenario: Nombre vacío

- GIVEN el formulario de técnico
- WHEN el dueño envía un nombre vacío
- THEN el sistema rechaza el envío con un error de validación

### Requirement: Disponibilidad semanal

El sistema MUST permitir definir por técnico una o más franjas semanales (`weekday`, `start_time`, `end_time`) en hora local del negocio, con `start_time` menor que `end_time`. Las franjas de un mismo técnico y día MUST NOT solaparse.

#### Scenario: Definir horario

- GIVEN un técnico sin disponibilidad
- WHEN el dueño define lunes a viernes de 08:00 a 17:00
- THEN el sistema guarda cinco franjas y el técnico queda disponible en esos horarios

#### Scenario: Franjas solapadas

- GIVEN un técnico con franja lunes 08:00-12:00
- WHEN el dueño agrega lunes 11:00-15:00
- THEN el sistema rechaza la franja por solaparse

#### Scenario: Franja con fin anterior al inicio

- GIVEN el formulario de disponibilidad
- WHEN el dueño envía inicio 17:00 y fin 08:00
- THEN el sistema rechaza el envío con un error de validación

### Requirement: Días libres

El sistema MUST permitir registrar períodos de ausencia (`time_off`) por técnico. Un día libre MUST ser rechazado si existen citas activas (`pending` o `confirmed`) del técnico dentro del período, listando las citas afectadas.

#### Scenario: Día libre sin citas

- GIVEN un técnico sin citas el viernes
- WHEN el dueño registra el viernes como día libre
- THEN el día libre queda guardado y no se ofrecen cupos de ese técnico ese día

#### Scenario: Día libre con citas afectadas

- GIVEN un técnico con dos citas `confirmed` el viernes
- WHEN el dueño intenta registrar el viernes como día libre
- THEN el sistema rechaza el registro y devuelve las dos citas afectadas

### Requirement: Rechazo de edición de disponibilidad con citas afectadas

El sistema MUST rechazar una edición de disponibilidad que deje fuera de la franja a citas activas futuras del técnico, listando las citas afectadas.

#### Scenario: Reducir horario con cita en la franja eliminada

- GIVEN un técnico con una cita `confirmed` el martes a las 16:00
- WHEN el dueño cambia el martes a 08:00-14:00
- THEN el sistema rechaza el cambio y lista esa cita

#### Scenario: Ampliar horario

- GIVEN un técnico con citas futuras
- WHEN el dueño amplía una franja sin dejar citas fuera
- THEN el cambio se guarda sin restricciones

### Requirement: Desactivación y reactivación mediante el flujo de cambio de horario

La desactivación y la reactivación de un técnico MUST pasar por el flujo de cambio de horario (vista previa de reasignación y aplicación), igual que los días libres y la edición de disponibilidad. El sistema MUST rechazar la desactivación de un técnico que tenga citas activas futuras (`pending` o `confirmed`), listándolas y ofreciendo la propuesta de reasignación. Un técnico desactivado MUST NOT recibir cupos ni asignaciones nuevas y MUST conservar su historial. La reactivación no tiene citas afectadas y MUST aplicarse sin reasignaciones.

#### Scenario: Desactivar con citas futuras

- GIVEN un técnico con tres citas `pending` o `confirmed` futuras
- WHEN el dueño intenta desactivarlo
- THEN el sistema rechaza la operación, lista las tres citas y ofrece la propuesta de reasignación

#### Scenario: Desactivar sin citas futuras

- GIVEN un técnico sin citas futuras activas
- WHEN el dueño lo desactiva
- THEN queda inactivo, no aparece en los cupos y sus citas pasadas siguen visibles

#### Scenario: Reactivar técnico

- GIVEN un técnico inactivo
- WHEN el dueño lo reactiva
- THEN queda activo y vuelve a recibir cupos y asignaciones según su disponibilidad

### Requirement: Eliminación de técnicos con anonimización

El sistema MUST permitir eliminar un técnico (a diferencia del borrado lógico de datos operativos). Al eliminarlo, sus citas y su historial MUST anonimizarse, no borrarse: el técnico recibe un alias aleatorio e irreversible (por ejemplo `tiger_1`) que reemplaza su identidad en citas, cierres y filas de auditoría, y la interfaz lo muestra como "Técnico eliminado (tiger_1)". El alias MUST ser aleatorio (no derivado de datos de la persona) y único por negocio. El sistema MUST eliminar todos los datos personales del técnico (nombre y teléfono) y MUST NOT conservar ninguna correspondencia entre la persona y el alias después del borrado. El técnico eliminado MUST NOT recibir cupos ni asignaciones. Un técnico con citas futuras activas (`pending` o `confirmed`, desde ahora) MUST NOT poder eliminarse: la solicitud MUST rechazarse con el error `schedule_conflict` (409) listando las citas afectadas, y MUST reutilizar el flujo de cambio de horario (vista previa de reasignación de solo lectura y aplicación atómica todo o nada, que cambia solo el técnico y nunca el horario). Las citas no resueltas se atienden a mano con el endpoint de reasignación manual. Solo cuando no quede ninguna cita futura activa MUST anonimizarse al técnico con el alias aleatorio, en la misma transacción que las reasignaciones.

#### Scenario: Eliminar técnico con citas futuras

- GIVEN un técnico con dos citas `confirmed` futuras
- WHEN el dueño intenta eliminarlo
- THEN el sistema rechaza la solicitud con `schedule_conflict` (409), lista las dos citas afectadas, ofrece la propuesta de reasignación y el técnico conserva su nombre y teléfono

#### Scenario: Eliminar tras reasignar

- GIVEN un técnico con dos citas futuras y otro técnico libre en ambos horarios
- WHEN el dueño acepta la propuesta de reasignación y confirma la eliminación
- THEN en una sola transacción las citas pasan al otro técnico con su horario intacto y el técnico queda anonimizado con un alias

#### Scenario: Eliminar técnico con historial

- GIVEN un técnico "Carlos" con citas completadas
- WHEN el dueño lo elimina
- THEN sus citas se conservan atribuidas a un alias como "Técnico eliminado (tiger_1)" y ni su nombre ni su teléfono permanecen en el sistema

#### Scenario: Alias único por negocio

- GIVEN un negocio con un técnico ya anonimizado como `tiger_1`
- WHEN el dueño elimina a otro técnico del mismo negocio
- THEN el nuevo alias es distinto de `tiger_1`

#### Scenario: Sin correspondencia persona-alias

- GIVEN un técnico eliminado
- WHEN se inspeccionan los datos persistidos
- THEN no existe ningún vínculo entre la persona y su alias (el registro de supresiones con hash con clave es deuda técnica fuera del sprint 1)

### Requirement: Propuesta de reasignación automática

Cuando una operación sea rechazada por citas afectadas (día libre, edición de disponibilidad, desactivación o eliminación del técnico), el sistema MUST ofrecer una propuesta de reasignación que use la misma regla de asignación de `slot-availability`. La propuesta MUST cambiar únicamente el técnico y MUST NOT modificar el horario. El dueño MUST poder aceptarla o rechazarla. Al aceptar, el sistema MUST aplicar todas las reasignaciones propuestas en una sola transacción, todas o ninguna. La propuesta es todo o nada: MUST NOT aplicarse parcialmente. Las citas sin reemplazo posible MUST listarse como no resueltas y resolverse a mano con el endpoint de reasignación manual (ver `appointment-management`); mientras existan, el cambio original MUST seguir bloqueado y no se aplica ninguna reasignación de la propuesta.

#### Scenario: Propuesta completa aceptada

- GIVEN dos citas afectadas y otro técnico libre en ambos horarios
- WHEN el dueño acepta la propuesta
- THEN ambas citas cambian de técnico en una transacción, conservan su horario y quedan marcadas con cambio de técnico

#### Scenario: Cita sin reemplazo posible

- GIVEN una cita afectada sin ningún otro técnico disponible en su horario
- WHEN el sistema genera la propuesta
- THEN la cita figura como no resuelta, no se aplica nada de forma parcial y la operación original sigue rechazada hasta que el dueño la resuelva a mano

#### Scenario: Falla parcial al aplicar

- GIVEN una propuesta aceptada cuyo segundo cupo fue ocupado por otra cita mientras tanto
- WHEN el sistema intenta aplicarla
- THEN no se reasigna ninguna cita y la API responde `slot_taken` (409), mostrado como "cupo ocupado"

#### Scenario: Conjunto de citas afectadas cambió

- GIVEN una propuesta aceptada y una cita afectada nueva o cancelada entre la vista previa y la aplicación
- WHEN el sistema intenta aplicarla
- THEN no se reasigna ninguna cita y la API responde `proposal_stale` (409) con la propuesta recalculada

#### Scenario: Propuesta rechazada

- GIVEN una propuesta pendiente
- WHEN el dueño la rechaza
- THEN no cambia ninguna cita y la operación original sigue rechazada

## Open questions

Ninguna. La zona horaria del negocio es fija, por lo que las franjas siempre se interpretan en esa zona.
