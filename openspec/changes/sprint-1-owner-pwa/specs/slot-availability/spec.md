# Delta for slot-availability

## ADDED Requirements

### Requirement: Generación adaptativa de cupos

El sistema MUST generar cupos por técnico a partir de su disponibilidad semanal. El primer cupo de cada franja libre MUST empezar en la hora de inicio de la franja del técnico. Cada cupo siguiente dentro de un intervalo libre MUST empezar al terminar el bloque ocupado anterior, es decir, al final de la cita más el buffer. El intervalo de servicio (sin buffer) MUST quedar completo dentro de una franja de disponibilidad y fuera de los días libres. Los cupos pasados MUST NOT ofrecerse.

#### Scenario: Primer cupo del día

- GIVEN un técnico con franja 08:00-12:00, sin citas, servicio de 60 minutos y buffer de 15
- WHEN se consultan los cupos del día
- THEN el primer cupo empieza a las 08:00 y el siguiente a las 09:15

#### Scenario: Cupo posterior a una cita existente

- GIVEN una cita de 08:00 a 09:00 con buffer de 15 en la misma franja
- WHEN se consultan cupos de 60 minutos
- THEN el primer cupo libre empieza a las 09:15

#### Scenario: Hueco insuficiente

- GIVEN dos citas con un hueco entre bloques ocupados menor que duración más buffer del servicio
- WHEN se consultan cupos para ese servicio
- THEN no se ofrece ningún cupo en ese hueco

#### Scenario: Cupo que excede la franja

- GIVEN una franja que termina a las 12:00 y un servicio de 60 minutos cuyo cupo empezaría a las 11:30
- WHEN se consultan los cupos
- THEN ese cupo no se ofrece

#### Scenario: Día libre

- GIVEN un técnico con día libre registrado el viernes
- WHEN se consultan los cupos del viernes
- THEN no se ofrece ningún cupo de ese técnico

### Requirement: Bloque ocupado igual a duración más buffer

Cada cita con estado distinto de `cancelled` (`pending`, `confirmed`, `completed` y `no_show`) MUST ocupar un bloque igual a la duración del servicio más el buffer del negocio vigente al crearla (o al moverla). Solo `cancelled` MUST liberar el bloque. Cerrar una cita antes de tiempo MUST NOT liberar el resto del bloque, y `no_show` tampoco.

#### Scenario: Bloque con buffer

- GIVEN un servicio de 90 minutos y buffer de 20
- WHEN se crea una cita a las 10:00
- THEN el técnico queda ocupado de 10:00 a 11:50

#### Scenario: Cierre anticipado no libera el bloque

- GIVEN una cita de 10:00 a 11:00 con buffer de 15, cerrada como `completed` a las 10:20
- WHEN se consultan los cupos del técnico
- THEN el bloque 10:00-11:15 sigue ocupado y no se ofrece ningún cupo dentro de él

#### Scenario: No asistió no libera el bloque

- GIVEN una cita `no_show` de 10:00 a 11:00 con buffer de 15
- WHEN se consultan los cupos del técnico
- THEN el bloque 10:00-11:15 sigue ocupado

### Requirement: Conversión de zona horaria segura ante horario de verano

El sistema MUST interpretar las franjas de disponibilidad como hora local de la zona del negocio y convertirlas a instantes `timestamptz` en un único punto. En días de cambio de horario, el sistema MUST NOT ofrecer horas locales inexistentes ni duplicar horas repetidas.

#### Scenario: Negocio en America/Bogota

- GIVEN un negocio en `America/Bogota` y franja 08:00-12:00
- WHEN se calculan los cupos de un día cualquiera
- THEN el primer cupo corresponde a 13:00 UTC

#### Scenario: Hora local inexistente

- GIVEN un negocio en una zona con horario de verano, franja que incluye una hora local omitida por el cambio de hora
- WHEN se calculan los cupos de ese día
- THEN no se ofrece ningún cupo que empiece en una hora local inexistente

### Requirement: Asignación automática de técnico

Para un cupo solicitado sin técnico explícito, el sistema MUST filtrar primero los técnicos activos disponibles en ese cupo, luego elegir el de menos minutos agendados ese día (hora local del negocio) y, ante empate, el técnico más antiguo por `created_at` y luego por `id`. Los minutos agendados MUST contar la duración de servicio de todas las citas con estado distinto de `cancelled`, sin buffer. La lista de cupos ofrecidos MUST mostrar cada instante de inicio una sola vez con el técnico asignado por esta regla. Esta lógica MUST ser única y reutilizable por otros clientes (por ejemplo el bot).

#### Scenario: Menos cargado

- GIVEN el técnico A con 180 minutos agendados ese día y el técnico B con 60, ambos libres a las 10:00
- WHEN se asigna el cupo de las 10:00
- THEN se asigna el técnico B

#### Scenario: Se filtra primero por disponibilidad

- GIVEN el técnico B menos cargado pero ocupado a las 10:00, y el técnico A libre
- WHEN se asigna el cupo de las 10:00
- THEN se asigna el técnico A

#### Scenario: Empate

- GIVEN dos técnicos libres con igual carga en minutos
- WHEN se asigna el cupo
- THEN se asigna el técnico más antiguo por `created_at` y, si coincide, el de menor `id`

#### Scenario: La carga no incluye buffer ni citas canceladas

- GIVEN el técnico A con dos citas de 60 minutos (buffer 20) y una cita `cancelled` de 120 minutos, y el técnico B con una cita `no_show` de 90 minutos
- WHEN se asigna un cupo en el que ambos están libres
- THEN la carga de A es 120 y la de B es 90, y se asigna B

#### Scenario: Sin técnicos disponibles

- GIVEN ningún técnico disponible en el instante solicitado
- WHEN se solicita ese cupo
- THEN el sistema informa que no hay cupo disponible

### Requirement: Cupos para mover una cita

Al mover una cita, el sistema MUST ofrecer cupos de todos los técnicos, excluyendo el bloque de la propia cita al calcular ocupación (parámetro `excludeAppointmentId`). Si el técnico actual está libre en un cupo, MUST tener prioridad (parámetro `preferredTechnicianId`); de lo contrario se aplica la regla de asignación. Si el técnico resultante difiere del actual, la cita MUST quedar marcada con cambio de técnico. El buffer (`buffer_min`) de la cita MUST tomarse de nuevo del valor vigente del negocio al moverla.

#### Scenario: Prioridad del técnico actual

- GIVEN una cita del técnico A y los técnicos A y B libres en el nuevo cupo, con B menos cargado
- WHEN se mueve la cita a ese cupo
- THEN se mantiene el técnico A y la cita no se marca con cambio de técnico

#### Scenario: Cambio de técnico

- GIVEN el técnico A ocupado en el nuevo cupo y B libre
- WHEN se mueve la cita a ese cupo
- THEN se asigna B y la cita queda marcada con cambio de técnico

#### Scenario: Cupo adyacente al propio bloque

- GIVEN una cita de 10:00-11:00 y buffer de 15
- WHEN se consultan cupos para moverla
- THEN su propio bloque cuenta como libre y puede ofrecerse un cupo que lo solape

### Requirement: Diferenciación entre cupo ocupado y cupo no ofrecido

Cuando la hora de inicio pedida colisiona con el bloque de una cita no cancelada (incluida una solicitud concurrente), la API MUST responder `slot_taken` (409), mostrado como "cupo ocupado". La API MUST responder `slot_not_offered` (422) únicamente cuando la hora de inicio queda fuera de la grilla de cupos generada y no colisiona con ninguna cita.

#### Scenario: Colisión con cita existente

- GIVEN una cita no cancelada de 10:00 a 11:15 (con buffer)
- WHEN se solicita un cupo a las 10:30 para el mismo técnico
- THEN la API responde `slot_taken` (409)

#### Scenario: Hora fuera de la grilla

- GIVEN una franja libre con cupos a las 08:00 y 09:15
- WHEN se solicita un cupo a las 08:40 sin cita en ese horario
- THEN la API responde `slot_not_offered` (422)

## Open questions

Ninguna pendiente en esta capacidad. Resueltas: el desempate es `created_at` y luego `id`; la carga cuenta minutos de servicio de citas no canceladas sin buffer; los cupos dentro de un hueco libre se ofrecen encadenados.
