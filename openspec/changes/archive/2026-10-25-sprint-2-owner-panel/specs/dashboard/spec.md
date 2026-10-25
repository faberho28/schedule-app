# Delta for dashboard

Capacidad nueva. El Panel de control es la pantalla de entrada (`/`) del dueño: cuatro tarjetas y la lista "Servicios de hoy". Glosario de la interfaz: "servicio" es lo que el código llama `appointment`; "tipo de servicio" es el catálogo (`services`). Los estados (`pending`, `confirmed`, `completed`, `no_show`, `cancelled`) conservan su nombre en el código.

## ADDED Requirements

### Requirement: Día y ventana de 30 días en la zona horaria del negocio

El sistema MUST calcular "hoy" y la ventana de 30 días con la zona horaria fija del negocio, en un solo lugar de la API, nunca con la zona del navegador ni del servidor. "Hoy" MUST ser el día calendario local completo, de 00:00 a 24:00 local, aunque dure 23 o 25 horas. La ventana de 30 días MUST cubrir 30 días calendario locales que incluyen hoy: empezar a las 00:00 locales del día de hoy menos 29 días calendario (inclusive) y terminar en el instante actual. La ventana MUST NOT calcularse restando 720 horas.

#### Scenario: Día corto por cambio de horario

- GIVEN un negocio en `America/New_York` y el 2026-03-08 (día de 23 horas) como hoy
- WHEN se cuentan los servicios de hoy
- THEN entran los servicios cuyo inicio local va de 2026-03-08 00:00 a 23:59

#### Scenario: Día largo por cambio de horario

- GIVEN un negocio en `America/New_York`, el 2026-11-01 (día de 25 horas) como hoy y servicios a las 00:30 y a las 23:30 locales
- WHEN se cuentan los servicios de hoy
- THEN ambos servicios cuentan como de hoy

#### Scenario: Límites de medianoche

- GIVEN servicios que empiezan a las 00:00 locales de hoy, a las 23:59 locales de hoy y a las 00:00 locales de mañana
- WHEN se cuentan los servicios de hoy
- THEN cuentan los dos primeros y no el tercero

#### Scenario: Corte de 30 días con cambio de horario

- GIVEN un negocio en `America/New_York`, hoy 2026-04-06 a las 10:00 locales y un servicio completado el 2026-03-08 a las 00:30 locales
- WHEN se calcula la ventana de 30 días
- THEN la ventana empieza el 2026-03-08 a las 00:00 locales y el servicio entra

### Requirement: Tarjeta "Servicios hoy"

El Panel de control MUST mostrar la tarjeta "Servicios hoy" con la cantidad de servicios cuyo inicio cae hoy, en cualquier estado excepto `cancelled`. Los servicios `completed` y `no_show` de hoy MUST contarse.

#### Scenario: Cancelados fuera del conteo

- GIVEN hoy hay 3 servicios `confirmed`, 1 `completed` y 2 `cancelled`
- WHEN el dueño abre el Panel de control
- THEN la tarjeta "Servicios hoy" muestra 4

#### Scenario: Día sin servicios

- GIVEN hoy no hay servicios
- WHEN el dueño abre el Panel de control
- THEN la tarjeta "Servicios hoy" muestra 0

### Requirement: Tarjeta "Técnicos activos X/Y"

La tarjeta "Técnicos activos" MUST mostrar `X/Y`. Y MUST ser la cantidad de técnicos activos, es decir, ni desactivados ni eliminados (anonimizados). X MUST ser la cantidad de esos técnicos que trabajan hoy: su disponibilidad semanal cubre el día de la semana de hoy y ningún día libre cubre todo su turno de hoy. Un técnico MUST dejar de contar en X cuando un día libre cubre todas sus horas de trabajo de hoy (todo su turno), aunque ese día libre no dure 24 horas. Un día libre que deja libre cualquier parte del turno de hoy (día libre parcial) MUST NOT sacar al técnico de X. Un técnico cuya disponibilidad semanal no cubre hoy MUST NOT contar en X.

#### Scenario: Día libre que cubre más que el turno

- GIVEN un técnico activo con turno de hoy de 08:00 a 17:00 y un día libre de 07:00 a 18:00 hoy
- WHEN el dueño abre el Panel de control
- THEN el técnico no cuenta en X

#### Scenario: Día libre parcial dentro del turno

- GIVEN un técnico activo con turno de hoy de 08:00 a 17:00 y un día libre de 12:00 a 13:00 hoy
- WHEN el dueño abre el Panel de control
- THEN el técnico cuenta en X

#### Scenario: Día libre exactamente igual al turno

- GIVEN un técnico activo con turno de hoy de 08:00 a 17:00 y un día libre de 08:00 a 17:00 hoy
- WHEN el dueño abre el Panel de control
- THEN el técnico no cuenta en X

#### Scenario: Sin disponibilidad hoy

- GIVEN un técnico activo cuya disponibilidad semanal no incluye el día de la semana de hoy
- WHEN el dueño abre el Panel de control
- THEN el técnico cuenta en Y y no cuenta en X

#### Scenario: Día libre de día completo

- GIVEN 5 técnicos activos, 4 con horario hoy y uno de ellos con un día libre de 24 horas hoy
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra `3/5`

#### Scenario: Día libre parcial

- GIVEN 2 técnicos activos con turno de 08:00 a 17:00 hoy y uno con un día libre de 14:00 a 16:00 hoy
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra `2/2`

#### Scenario: Técnicos que no cuentan en Y

- GIVEN 3 técnicos activos, 1 desactivado y 1 eliminado
- WHEN el dueño abre el Panel de control
- THEN el denominador Y es 3

#### Scenario: Sin técnicos

- GIVEN un negocio sin técnicos activos
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra `0/0`

### Requirement: Tarjeta "Eficiencia de servicios"

La tarjeta "Eficiencia de servicios" MUST mostrar el porcentaje entero (redondeado al entero más cercano) de servicios `completed` sobre los servicios que debían cerrarse en la ventana de 30 días. El denominador MUST ser la cantidad de servicios de la ventana cuyo inicio ya pasó, en cualquier estado excepto `cancelled` (incluye `completed`, `no_show` y los no cerrados). Los servicios que aún no empiezan MUST NOT contarse. La tarjeta MUST mostrar la fecha de corte en formato dd/mm/aaaa, por ejemplo "Últimos 30 días, desde el 25/09/2026". Cuando el denominador es 0 la tarjeta MUST mostrar "Sin datos" y MUST NOT mostrar 0 % ni 100 %.

#### Scenario: Cálculo con mezcla de estados

- GIVEN en la ventana 6 `completed`, 2 `no_show`, 1 `confirmed` con inicio pasado, 3 `cancelled` y 2 `confirmed` futuros
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra 67 % (6 de 9)

#### Scenario: Fecha de corte visible

- GIVEN hoy es 2026-10-24 en la zona del negocio
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra la fecha de corte 25/09/2026 (30 días calendario que incluyen hoy)

#### Scenario: Sin servicios que cerrar

- GIVEN en la ventana solo hay servicios `cancelled` o futuros
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra "Sin datos"

#### Scenario: Servicio fuera de la ventana

- GIVEN un servicio `no_show` que empezó 30 días calendario atrás y otro que empezó 29 días calendario atrás
- WHEN se calcula la eficiencia
- THEN el primero no entra en el denominador y el segundo sí

### Requirement: Tarjeta "Servicios pendientes"

La tarjeta "Servicios pendientes" MUST mostrar la cantidad de servicios en estado `confirmed` cuyo inicio ya pasó y que siguen sin cerrar, de cualquier fecha. Los servicios `pending` MUST NOT contarse: su tratamiento se decide en el sprint del bot. Al tocarla, la interfaz MUST abrir la lista de la agenda con el filtro "Por cerrar" aplicado, que MUST mostrar los mismos servicios que cuenta la tarjeta.

#### Scenario: Conteo

- GIVEN 2 servicios `confirmed` con inicio pasado, 1 `confirmed` futuro, 1 `completed` y 1 `cancelled`
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra 2

#### Scenario: Enlace a "Por cerrar"

- GIVEN la tarjeta muestra 2
- WHEN el dueño la toca
- THEN se abre la lista de la agenda con "Por cerrar" activo y exactamente esos 2 servicios

#### Scenario: Pending no cuenta

- GIVEN 1 servicio `pending` con inicio pasado y 1 `confirmed` con inicio pasado
- WHEN el dueño abre el Panel de control
- THEN la tarjeta muestra 1

#### Scenario: Servicio recién iniciado

- GIVEN un servicio `confirmed` que empezó hace un minuto
- WHEN se calcula la tarjeta
- THEN el servicio cuenta como pendiente

### Requirement: Lista "Servicios de hoy"

El Panel de control MUST mostrar la lista "Servicios de hoy" con los servicios de hoy que faltan por atender o cerrar: los que aún no empiezan y los que ya empezaron y siguen sin cerrar (estados `pending` y `confirmed` de hoy; esto difiere a propósito de "Servicios pendientes", que cuenta solo `confirmed` de cualquier fecha). La lista MUST NOT incluir servicios `cancelled`, `completed` ni `no_show`. La lista MUST ordenarse por hora de inicio y cada fila MUST mostrar hora de inicio, cliente, tipo de servicio y técnico. Tocar una fila MUST abrir la agenda en ese día con la ficha del servicio abierta.

#### Scenario: Contenido y orden

- GIVEN hoy hay un `confirmed` a las 15:00 que no empieza aún, uno a las 09:00 ya iniciado sin cerrar, uno `completed` a las 08:00 y uno `cancelled` a las 10:00
- WHEN el dueño abre el Panel de control
- THEN la lista muestra primero el de 09:00 y luego el de 15:00, sin los otros dos

#### Scenario: Abrir un servicio

- GIVEN la lista muestra un servicio de hoy
- WHEN el dueño toca la fila
- THEN se abre la agenda en el día de hoy con la ficha de ese servicio

#### Scenario: Lista vacía

- GIVEN no quedan servicios por atender hoy
- WHEN el dueño abre el Panel de control
- THEN la lista muestra "No quedan servicios por atender hoy"

#### Scenario: Cliente anonimizado

- GIVEN un servicio de hoy de un cliente anonimizado
- WHEN se muestra la lista
- THEN la fila muestra "Cliente eliminado (bear_1)", formateado por la interfaz a partir del alias `bear_1` (ver el requisito de cliente anonimizado en `owner-agenda-ui`)

### Requirement: Estados de carga y error del Panel de control

El Panel de control MUST mostrar un estado de carga mientras espera el resumen, un mensaje de error con el botón "Reintentar" cuando la solicitud falla, y MUST NOT mostrar valores inventados (como 0) mientras carga o tras un error.

#### Scenario: Cargando

- GIVEN la solicitud del resumen sigue en curso
- WHEN el dueño ve el Panel de control
- THEN las tarjetas y la lista muestran un estado de carga y ningún número

#### Scenario: Error y reintento

- GIVEN la solicitud del resumen falla
- WHEN el dueño ve el Panel de control
- THEN ve "No se pudo cargar el panel. Reintenta." y el botón "Reintentar", que repite la solicitud

### Requirement: Endpoint de resumen del Panel de control

La API MUST ofrecer una consulta de solo lectura que devuelve los cuatro indicadores y la lista "Servicios de hoy" en una sola respuesta. La consulta MUST limitarse al negocio actual y MUST NOT modificar datos. La respuesta MUST NOT incluir datos personales más allá de lo que ya muestra la lista (cliente por nombre o alias, tipo de servicio, técnico por nombre o alias, hora). Los cálculos MUST usar el reloj y la zona horaria del negocio (ver el primer requisito).

#### Scenario: Aislamiento por negocio

- GIVEN servicios y técnicos de otro negocio
- WHEN se consulta el resumen
- THEN ningún indicador ni fila incluye datos del otro negocio

#### Scenario: Sin datos personales de más

- GIVEN un cliente con teléfono, dirección y notas
- WHEN se consulta el resumen
- THEN la respuesta no contiene teléfono, dirección ni notas

#### Scenario: Solo lectura

- GIVEN el estado de la base antes de la consulta
- WHEN se consulta el resumen
- THEN ninguna tabla cambia

### Requirement: Consulta de servicios por cerrar

La API MUST ofrecer una consulta de solo lectura (`GET /agenda/to-close`) que devuelve los servicios `confirmed` cuyo inicio ya pasó y siguen sin cerrar, de cualquier fecha, ordenados por hora de inicio ascendente. Aplica la misma regla que la tarjeta "Servicios pendientes". La consulta MUST limitarse al negocio actual, MUST NOT modificar datos, MUST NOT incluir servicios `pending`, `completed`, `no_show` ni `cancelled`, y devuelve como máximo 200 servicios (`items`, el más antiguo primero) junto con el campo `total`, la cantidad completa de servicios por cerrar, que es igual al número de la tarjeta.

#### Scenario: Mismos servicios que la tarjeta

- GIVEN 2 servicios `confirmed` con inicio pasado (uno de hace 3 días), 1 `pending` con inicio pasado, 1 `confirmed` futuro y 1 `completed`
- WHEN se consulta `GET /agenda/to-close`
- THEN `items` contiene exactamente los 2 `confirmed` con inicio pasado, el más antiguo primero, y `total` es 2

#### Scenario: Más de 200 por cerrar

- GIVEN 340 servicios `confirmed` por cerrar
- WHEN se consulta `GET /agenda/to-close`
- THEN `items` contiene los 200 más antiguos, del más antiguo al más reciente, `total` es 340 y la tarjeta "Servicios pendientes" muestra 340

#### Scenario: Aislamiento por negocio

- GIVEN servicios por cerrar de otro negocio
- WHEN se consulta
- THEN ningún resultado pertenece al otro negocio

## Open questions

Ninguna.
