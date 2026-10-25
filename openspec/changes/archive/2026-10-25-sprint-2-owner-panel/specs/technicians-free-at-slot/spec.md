# Delta for technicians-free-at-slot

Capacidad nueva: consulta de solo lectura de los técnicos libres en el horario exacto de un servicio, usada por el diálogo de reasignar. "Servicio" es lo que el código llama `appointment`.

## ADDED Requirements

### Requirement: Consulta de técnicos libres en el horario de un servicio

La API MUST ofrecer una consulta de solo lectura (`GET /appointments/{id}/free-technicians`) que recibe el identificador de un servicio y devuelve los técnicos que pueden atenderlo en su inicio y duración exactos. Un técnico MUST considerarse libre solo si cumple todo lo siguiente: es activo (ni desactivado ni eliminado); su disponibilidad semanal cubre todo el intervalo del servicio; no tiene un día libre (completo o parcial) que se solape con el intervalo; y no tiene otro servicio que ocupe su bloque (todo estado distinto de `cancelled`: `pending`, `confirmed`, `completed` y `no_show`, como en `appointment-management`) que se solape con el intervalo incluyendo el margen de traslado (buffer) del negocio. El bloque del propio servicio MUST ignorarse en el cálculo. La consulta MUST aplicar las mismas reglas que la reasignación manual y MUST NOT modificar datos.

#### Scenario: Técnico libre

- GIVEN un servicio de 10:00 a 11:00 del técnico A y un técnico B activo con horario ese día, sin servicios ni días libres
- WHEN se consulta
- THEN la respuesta incluye al técnico B

#### Scenario: Sin disponibilidad

- GIVEN un técnico cuyo horario ese día termina a las 10:30
- WHEN se consulta un servicio de 10:00 a 11:00
- THEN ese técnico no aparece

#### Scenario: Día libre parcial solapado

- GIVEN un técnico con un día libre de 10:30 a 12:00 y un servicio de 10:00 a 11:00
- WHEN se consulta
- THEN ese técnico no aparece

#### Scenario: Solape con margen de traslado

- GIVEN un buffer de 30 minutos, un servicio de 10:00 a 11:00 y un técnico con otro servicio de 11:15 a 12:00
- WHEN se consulta
- THEN ese técnico no aparece porque el margen lo solapa

#### Scenario: Servicio cerrado sigue bloqueando

- GIVEN un técnico con otro servicio `completed` que se solapa con el intervalo
- WHEN se consulta
- THEN ese técnico no aparece, porque un servicio cerrado conserva su bloque

#### Scenario: Servicios cancelados no bloquean

- GIVEN un técnico cuyo único servicio solapado está `cancelled`
- WHEN se consulta
- THEN ese técnico aparece

#### Scenario: Técnico desactivado o eliminado

- GIVEN un técnico desactivado y otro eliminado, ambos sin conflictos de horario
- WHEN se consulta
- THEN ninguno aparece

#### Scenario: Bloque propio ignorado

- GIVEN un servicio que solo se solapa consigo mismo en el técnico actual
- WHEN se consulta
- THEN el cálculo no lo trata como un conflicto

### Requirement: Técnico actual no se ofrece

La reasignación MUST NOT ofrecer al técnico actual del servicio como destino. La consulta omite al técnico actual; el comportamiento observable en la interfaz MUST ser que no aparece como opción.

#### Scenario: Técnico actual en el diálogo

- GIVEN un servicio asignado al técnico A y el técnico A libre en su propio horario
- WHEN el dueño abre el diálogo de reasignar
- THEN el técnico A no figura entre las opciones

### Requirement: Servicio inexistente o no modificable

La consulta MUST responder 404 en formato problem+json cuando el servicio no existe o pertenece a otro negocio. Cuando el servicio está `cancelled`, `completed` o `no_show` (cerrado), MUST rechazar la consulta con el error `invalid_transition` (422) en formato problem+json, igual que la reasignación, sin lista de técnicos. El identificador inexistente responde `not_found`. No se agregan códigos de error nuevos. Un servicio `pending` o `confirmed` MUST ser consultable.

#### Scenario: Servicio inexistente

- GIVEN un identificador que no existe
- WHEN se consulta
- THEN la API responde 404 problem+json

#### Scenario: Servicio de otro negocio

- GIVEN un servicio de otro negocio
- WHEN se consulta
- THEN la API responde 404 problem+json

#### Scenario: Servicio cancelado o cerrado

- GIVEN un servicio `cancelled` y otro `completed`
- WHEN se consulta cada uno
- THEN la API los rechaza con `invalid_transition` (422) problem+json

### Requirement: Diálogo de reasignar con técnicos libres

El diálogo de reasignar MUST obtener los técnicos de la consulta anterior y listar solo a los técnicos libres, no a todos los técnicos activos. Mientras carga, MUST mostrar un estado de carga. Si no hay ninguno, MUST mostrar "No hay técnicos libres en este horario". Ante `slot_taken` la interfaz MUST volver a cargar la lista. Elegir un técnico MUST seguir validándose en la API: si otro cliente ocupó el horario, la API responde `slot_taken` (409) y la interfaz muestra "Cupo ocupado".

#### Scenario: Solo libres

- GIVEN tres técnicos activos, uno libre en el horario exacto del servicio
- WHEN el dueño abre el diálogo de reasignar
- THEN solo ve al técnico libre

#### Scenario: Ningún técnico libre

- GIVEN ningún técnico libre en ese horario
- WHEN el dueño abre el diálogo
- THEN ve "No hay técnicos libres en este horario"

#### Scenario: Carrera con otra reserva

- GIVEN el diálogo muestra al técnico B libre
- WHEN otro servicio ocupa a B y el dueño confirma
- THEN la API responde `slot_taken` (409) y la interfaz muestra "Cupo ocupado"

## Open questions

Ninguna.
