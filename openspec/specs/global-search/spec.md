# Delta for global-search

Capacidad nueva: búsqueda global de clientes y servicios desde la barra de la agenda. Es de solo lectura. "Servicio" es lo que el código llama `appointment`.

## ADDED Requirements

### Requirement: Búsqueda global de clientes y servicios

La API MUST ofrecer una consulta de solo lectura que, dado un texto, devuelva dos grupos: "Clientes" y "Servicios". El grupo "Clientes" MUST coincidir por nombre o teléfono del cliente. El grupo "Servicios" MUST coincidir por nombre del cliente (solo el nombre; el teléfono se busca únicamente en el grupo "Clientes"), nombre del tipo de servicio o nombre del técnico, en todas las fechas (pasadas y futuras) y en cualquier estado, incluidos los `cancelled`, y cada resultado MUST mostrar su estado como texto, con "Cancelado" claramente visible en los servicios cancelados. Cada grupo MUST devolver como máximo 10 resultados. Los servicios MUST ordenarse por cercanía a hoy: primero la menor distancia en días calendario (zona del negocio) entre el día del servicio y hoy; a igual distancia, los no cancelados antes que los cancelados; a igual distancia y condición, por hora de inicio ascendente; y por último por identificador. El orden MUST aplicarse antes del límite de 10. Los clientes MUST ordenarse por nombre ascendente (sin acentos), con desempate por identificador. La consulta es `GET /search?q=`.

#### Scenario: Coincidencia por cliente, tipo de servicio y técnico

- GIVEN el cliente "María Pérez", el tipo de servicio "Limpieza profunda" y el técnico "Carlos Ruiz" con servicios asociados
- WHEN se busca "pérez", luego "limpieza" y luego "carlos"
- THEN cada búsqueda devuelve en "Servicios" los servicios correspondientes

#### Scenario: Cliente por teléfono

- GIVEN un cliente con teléfono `+573001234567`
- WHEN se busca "3001234"
- THEN el cliente aparece en el grupo "Clientes"

#### Scenario: Límite por grupo

- GIVEN 15 clientes y 25 servicios que coinciden
- WHEN se busca el texto
- THEN "Clientes" devuelve 10 resultados y "Servicios" devuelve 10

#### Scenario: Orden por cercanía a hoy

- GIVEN hoy 2026-10-24 y servicios del 2026-10-26, 2026-10-23, 2026-10-24 y 2026-09-01 que coinciden
- WHEN se busca el texto
- THEN el orden es 2026-10-24, 2026-10-23, 2026-10-26, 2026-09-01

#### Scenario: Servicio cancelado encontrado y rotulado

- GIVEN un servicio `cancelled` del cliente "María Pérez"
- WHEN se busca "pérez"
- THEN el servicio aparece en "Servicios" con el estado "Cancelado" visible

#### Scenario: Cancelado después de confirmado a igual distancia

- GIVEN hoy 2026-10-24, un servicio `cancelled` a las 09:00 y uno `confirmed` a las 15:00, ambos de hoy y coincidentes
- WHEN se busca el texto
- THEN el `confirmed` precede al `cancelled` aunque empiece más tarde

#### Scenario: Muchas cancelaciones no desplazan servicios activos

- GIVEN un cliente con 12 servicios `cancelled` y 3 `confirmed`, todos a la misma distancia de hoy
- WHEN se busca su nombre
- THEN los 3 `confirmed` figuran entre los 10 resultados, antes de los cancelados

#### Scenario: Aislamiento por negocio

- GIVEN clientes y servicios de otro negocio con el mismo texto
- WHEN se busca
- THEN ningún resultado pertenece al otro negocio

### Requirement: Mínimo de caracteres y validación

La búsqueda MUST exigir al menos 2 y como máximo 100 caracteres tras recortar espacios. Fuera de ese rango, la API MUST rechazar la solicitud con el error `validation_error` en formato problem+json y la interfaz MUST NOT enviarla.

#### Scenario: Un solo carácter

- GIVEN la API
- WHEN se consulta con "a"
- THEN responde un error de validación problem+json y no devuelve resultados

#### Scenario: Más de 100 caracteres

- GIVEN la API
- WHEN se consulta con un texto de 101 caracteres
- THEN responde `validation_error` problem+json y no devuelve resultados

#### Scenario: Solo espacios

- GIVEN la API
- WHEN se consulta con "   "
- THEN responde un error de validación

#### Scenario: Interfaz bajo el mínimo

- GIVEN el campo "Buscar servicio o cliente"
- WHEN el dueño escribe un solo carácter
- THEN no se envía ninguna solicitud y se muestra "Escribe al menos 2 caracteres"

### Requirement: Búsqueda sin distinguir acentos ni mayúsculas

La coincidencia MUST ignorar acentos y diferencias de mayúsculas y minúsculas en ambos sentidos. Los caracteres especiales del texto (como `%`, `_` y `\`) MUST tratarse como texto literal.

#### Scenario: Sin acento encuentra con acento

- GIVEN el cliente "María Gómez"
- WHEN se busca "maria"
- THEN el cliente aparece en "Clientes"

#### Scenario: Con acento encuentra sin acento

- GIVEN el cliente "Maria Gomez" guardado sin acentos
- WHEN se busca "MARÍA"
- THEN el cliente aparece en "Clientes"

#### Scenario: Comodines literales

- GIVEN clientes "Ana" y "100%Ana"
- WHEN se busca "%a"
- THEN no coincide "Ana" y solo se evalúa el texto literal "%a"

### Requirement: Privacidad por grupo

El grupo "Clientes" MUST NOT listar nunca clientes anonimizados, ni por nombre, teléfono o alias. El grupo "Servicios" MAY incluir servicios de clientes anonimizados, que MUST mostrarse con su alias formateado por la interfaz (por ejemplo "Cliente eliminado (bear_1)", a partir del nombre nulo y el alias `bear_1` de la respuesta) y MUST encontrarse solo por técnico o por tipo de servicio, nunca por nombre, teléfono ni alias del cliente. Los servicios de técnicos eliminados MAY aparecer mostrando su alias (por ejemplo "Técnico eliminado (alias)") y encontrarse por cliente o por tipo de servicio; un técnico eliminado MUST NOT poder encontrarse por su nombre original, que ya no existe en la base de datos, ni por su alias. La respuesta MUST incluir solo los campos necesarios para mostrar y abrir cada resultado.

#### Scenario: Cliente anonimizado fuera de "Clientes"

- GIVEN un cliente anonimizado con el alias `bear_1`
- WHEN se busca "bear" o "eliminado"
- THEN no aparece en el grupo "Clientes"

#### Scenario: Servicio de cliente anonimizado por tipo de servicio

- GIVEN un servicio de "Limpieza profunda" de un cliente anonimizado con el alias `bear_1`
- WHEN se busca "limpieza"
- THEN el servicio aparece en "Servicios" mostrando "Cliente eliminado (bear_1)"

#### Scenario: Servicio de cliente anonimizado por técnico

- GIVEN un servicio del técnico "Carlos Ruiz" de un cliente anonimizado
- WHEN se busca "carlos"
- THEN el servicio aparece en "Servicios" mostrando "Cliente eliminado (bear_1)" y no muestra nombre original ni teléfono

#### Scenario: Cliente anonimizado no se encuentra por su alias en servicios

- GIVEN un servicio de un cliente anonimizado
- WHEN se busca "bear_1"
- THEN el servicio no aparece en "Servicios"

#### Scenario: Técnico eliminado

- GIVEN un técnico eliminado, antes llamado "Carlos Ruiz", con alias `fox_2` y servicios del cliente "María Pérez"
- WHEN se busca "carlos", luego "fox_2" y luego "pérez"
- THEN las dos primeras búsquedas no devuelven sus servicios y la tercera sí, mostrando al técnico como "Técnico eliminado (fox_2)"

### Requirement: Desplegable de búsqueda en la interfaz

El campo "Buscar servicio o cliente" de la barra de la agenda MUST mostrar un desplegable con los grupos "Clientes" y "Servicios", enviar la solicitud solo tras una pausa al escribir (sin una solicitud por pulsación), y mostrar un estado de carga y uno de error. Cada servicio MUST mostrar fecha y hora, cliente, tipo de servicio, técnico y estado como texto. Con cero resultados MUST mostrar "Sin resultados". Un grupo vacío MUST ocultarse. Elegir un cliente MUST abrir su ficha; elegir un servicio MUST abrir la agenda en el día del servicio con su ficha abierta.

#### Scenario: Pausa al escribir

- GIVEN el dueño escribe "mar" tecla por tecla en menos de la pausa
- WHEN termina de escribir
- THEN se envía una sola solicitud con "mar"

#### Scenario: Abrir un cliente

- GIVEN resultados con el cliente "María Gómez"
- WHEN el dueño lo elige
- THEN se abre la ficha de ese cliente

#### Scenario: Abrir un servicio

- GIVEN un resultado de servicio del 2026-11-03 a las 10:00
- WHEN el dueño lo elige
- THEN se abre la agenda en el 2026-11-03 con la ficha de ese servicio

#### Scenario: Resultado de cliente anonimizado en el desplegable

- GIVEN un resultado de servicio de un cliente anonimizado con el alias `bear_1`
- WHEN se muestra el desplegable
- THEN la fila muestra "Cliente eliminado (bear_1)" y no el alias solo

#### Scenario: Sin resultados

- GIVEN un texto sin coincidencias
- WHEN se muestra el desplegable
- THEN aparece "Sin resultados"

#### Scenario: Error de la búsqueda

- GIVEN la solicitud falla
- WHEN se muestra el desplegable
- THEN aparece un mensaje de error en español y se puede volver a intentar escribiendo

## Open questions

Ninguna.
