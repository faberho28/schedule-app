# Historias de usuario: Sprint 2 - Panel del dueño para escritorio

Este documento reúne las historias de usuario (HU) del sprint. Los criterios de aceptación se derivan de los escenarios de `specs/*/spec.md` y las fases se refieren a `tasks.md`. Prioridades: Alta (necesaria para operar el panel de punta a punta), Media (necesaria para completar el sprint) y Baja (mejora de calidad o de cumplimiento sin bloquear la operación).

Códigos de spec: DB dashboard, GS global-search, TF technicians-free-at-slot, PM profile-mock, AU owner-agenda-ui, CS customer-records (delta de búsqueda de clientes). La numeración R1, R2... sigue el orden de los requisitos de cada delta; ver la leyenda de `tasks.md`. En las historias, "servicio" es lo que el código llama `appointment` y "Tipos de servicio" es el catálogo.

## Fuera de alcance (no hay historias)

Este sprint NO incluye, y por eso no tiene historias para: Reportes, vista Mes, exportar a PDF o Excel, autenticación y roles (el Perfil es una simulación), WhatsApp y bot, seguimiento en la respuesta del servicio, recaudo y precio acordado, pagos, notificaciones push, arrastrar y soltar, y caché de agenda sin conexión. Los flujos del sprint 1 no cambian de comportamiento y solo reciben el nuevo vocabulario.

---

## Épica 1: Panel de control

### HU-S2-01 Entrar por el Panel de control
Como dueño del negocio quiero que la aplicación se abra en el Panel de control para ver primero el estado de mi día.
- GIVEN que visito `/` en un ancho de 1280 px o de 390 px WHEN carga la aplicación THEN veo el Panel de control en ambos anchos y no se me redirige a la agenda (AU-R3).
- GIVEN que uso la barra lateral o la barra inferior WHEN reviso las entradas THEN "Panel de control" es la primera (AU-R1, AU-R2).
- Prioridad: Alta. Fases: 8, 12 (8.7, 12.7).

### HU-S2-02 Ver cuántos servicios hay hoy
Como dueño del negocio quiero ver cuántos servicios tengo hoy para dimensionar la carga del día.
- GIVEN hoy hay 3 servicios `confirmed`, 1 `completed` y 2 `cancelled` WHEN abro el Panel de control THEN "Servicios hoy" muestra 4 (DB-R2).
- GIVEN que hoy no hay servicios WHEN abro el Panel THEN la tarjeta muestra 0 (DB-R2).
- GIVEN un negocio en `America/New_York` en un día de 23 o de 25 horas WHEN se cuentan los servicios de hoy THEN entran todos los que empiezan ese día calendario local, desde las 00:00 hasta las 23:59 (DB-R1).
- Prioridad: Alta. Fases: 4, 12 (4.1, 4.3, 4.6, 12.3).

### HU-S2-03 Ver cuántos técnicos trabajan hoy
Como dueño del negocio quiero ver cuántos de mis técnicos activos trabajan hoy para saber con quién cuento.
- GIVEN un técnico con turno 08:00-17:00 y un día libre de 07:00 a 18:00 (o exactamente de 08:00 a 17:00) hoy WHEN abro el Panel THEN no cuenta entre los que trabajan (DB-R3).
- GIVEN un técnico con turno 08:00-17:00 y un día libre de 12:00 a 13:00 hoy WHEN abro el Panel THEN sigue contando (DB-R3).
- GIVEN un técnico cuya disponibilidad semanal no incluye hoy WHEN abro el Panel THEN cuenta entre los activos y no entre los que trabajan (DB-R3).
- GIVEN 5 técnicos activos, 4 con horario hoy y uno de ellos con un día libre de 24 horas WHEN abro el Panel THEN la tarjeta muestra `3/5` (DB-R3).
- GIVEN 3 técnicos activos, 1 desactivado y 1 eliminado, o ningún técnico activo WHEN abro el Panel THEN el denominador es 3, o la tarjeta muestra `0/0` (DB-R3).
- Prioridad: Alta. Fases: 2, 4, 12 (2.1, 4.4, 4.6, 12.3).

### HU-S2-04 Ver la eficiencia de los últimos 30 días
Como dueño del negocio quiero ver el porcentaje de servicios completados sobre los que debían cerrarse para saber si mi operación cierra lo que agenda.
- GIVEN en la ventana 6 `completed`, 2 `no_show`, 1 `confirmed` con inicio pasado, 3 `cancelled` y 2 `confirmed` futuros WHEN abro el Panel THEN la tarjeta muestra 67 % (6 de 9) (DB-R4).
- GIVEN que hoy es 2026-10-24 WHEN abro el Panel THEN veo la fecha de corte 25/09/2026 (DB-R4, DB-R1).
- GIVEN que en la ventana solo hay servicios `cancelled` o futuros WHEN abro el Panel THEN la tarjeta muestra "Sin datos" y no 0 % ni 100 % (DB-R4).
- GIVEN un servicio `no_show` que empezó 30 días calendario atrás y otro de 29 días atrás WHEN se calcula la eficiencia THEN solo el segundo entra (DB-R4, DB-R1).
- Prioridad: Media. Fases: 4, 12 (4.1, 4.3, 12.4).

### HU-S2-05 Ver los servicios pendientes de cerrar
Como dueño del negocio quiero ver cuántos servicios confirmados ya pasaron y siguen sin cerrar para no dejar servicios abiertos.
- GIVEN 2 servicios `confirmed` con inicio pasado, 1 `confirmed` futuro, 1 `completed` y 1 `cancelled` WHEN abro el Panel THEN "Servicios pendientes" muestra 2 (DB-R5).
- GIVEN 1 servicio `pending` y 1 `confirmed`, ambos con inicio pasado WHEN abro el Panel THEN la tarjeta muestra 1 (DB-R5).
- GIVEN que la tarjeta muestra 2 WHEN la toco THEN se abre la lista de la agenda con "Por cerrar" activo y exactamente esos 2 servicios (DB-R5, DB-R9).
- Prioridad: Alta. Fases: 4, 10, 12 (4.2, 4.5, 4.6, 10.5, 12.5).

### HU-S2-06 Ver los servicios que faltan hoy
Como dueño del negocio quiero ver la lista "Servicios de hoy" para saber qué sigue y abrirlo con un toque.
- GIVEN un `confirmed` de las 15:00, uno de las 09:00 ya iniciado sin cerrar, un `completed` de las 08:00 y un `cancelled` de las 10:00 WHEN abro el Panel THEN la lista muestra primero el de 09:00 y luego el de 15:00 (DB-R6).
- GIVEN una fila de la lista WHEN la toco THEN se abre la agenda en el día de hoy con la ficha de ese servicio (DB-R6, AU-R13).
- GIVEN que no quedan servicios por atender hoy WHEN abro el Panel THEN veo "No quedan servicios por atender hoy" (DB-R6).
- GIVEN un servicio de hoy de un cliente anonimizado con alias `bear_1` WHEN veo la lista THEN la fila dice "Cliente eliminado (bear_1)" (DB-R6, AU-R14).
- Prioridad: Alta. Fases: 4, 12 (4.4, 12.6).

### HU-S2-07 Entender el estado de carga y de error del Panel
Como dueño del negocio quiero ver un estado de carga o de error claro para no confundir una falla con "cero servicios".
- GIVEN que la solicitud del resumen sigue en curso WHEN veo el Panel THEN las tarjetas y la lista muestran carga y ningún número (DB-R7).
- GIVEN que la solicitud falla WHEN veo el Panel THEN leo "No se pudo cargar el panel. Reintenta." y el botón "Reintentar" repite la solicitud (DB-R7).
- Prioridad: Media. Fases: 12 (12.2). La API de solo lectura (aislamiento por negocio, sin datos personales de más) se cubre en la tarea 4.6.

---

## Épica 2: Agenda en escritorio

### HU-S2-08 Ver el día en una sola grilla de tiempo
Como dueño del negocio quiero ver todos los servicios del día en una sola grilla, con una barra de herramientas completa, para operar la agenda de muchos técnicos sin saltar entre columnas.
- GIVEN dos técnicos seleccionados con servicios el día elegido WHEN abro la vista de día THEN veo una sola grilla con los servicios de ambos, cada uno con su color e iniciales (AU-R16).
- GIVEN dos servicios de técnicos distintos de 10:00 a 11:00 WHEN se muestra la grilla THEN aparecen lado a lado sin taparse (AU-R16).
- GIVEN la agenda en escritorio WHEN la abro THEN la barra ofrece Día/Semana, navegación de fechas, "Hoy", "Buscar servicio o cliente" y "Nuevo servicio", y no muestra los indicadores del Panel (AU-R6).
- GIVEN la agenda en un día distinto de hoy WHEN toco "Hoy" THEN veo el día de hoy en la zona del negocio (AU-R6).
- GIVEN la grilla WHEN busco la vista Mes o intento arrastrar un servicio THEN no hay vista Mes y no ocurre ningún cambio; mover requiere el diálogo de cupos (AU-R16).
- Prioridad: Alta. Fases: 11 (11.6, 11.9, 11.11).

### HU-S2-09 Ver la semana con el mismo modelo
Como dueño del negocio quiero ver la semana completa en escritorio para planificar la carga de trabajo.
- GIVEN servicios durante la semana WHEN cambio a la vista de semana THEN veo los siete días con los servicios de los técnicos seleccionados, con el mismo modelo de color y de solapes (AU-R16).
- Prioridad: Media. Fases: 11 (11.6, 11.9).

### HU-S2-10 Elegir qué técnicos ver
Como dueño del negocio quiero elegir hasta 10 técnicos visibles, con su color, para que la grilla siga legible con muchos técnicos.
- GIVEN 14 técnicos activos y ninguna selección guardada WHEN abro la agenda THEN están marcados los 10 más antiguos (AU-R7).
- GIVEN 10 técnicos marcados WHEN intento marcar un undécimo THEN la casilla está deshabilitada y veo "Máximo 10 técnicos visibles" (AU-R7).
- GIVEN que marqué solo a 3 técnicos WHEN recargo la página THEN siguen marcados esos 3 (AU-R7).
- GIVEN un técnico recordado que luego se desactivó y aún tiene servicios en el rango visible WHEN abro la agenda THEN sigue marcado con su color y la marca de inactivo; si no tiene servicios en el rango, sale de la selección (AU-R7).
- GIVEN que desmarco a todos WHEN veo la grilla THEN leo "Selecciona al menos un técnico" (AU-R7).
- Prioridad: Alta. Fases: 11 (11.4, 11.5).

### HU-S2-11 Distinguir técnicos y estados sin depender del color
Como dueño del negocio quiero que cada tarjeta muestre las iniciales o el nombre del técnico y el estado con ícono y texto para entender la grilla aunque no distinga los colores.
- GIVEN la tarjeta de un servicio WHEN la reviso THEN incluye las iniciales o el nombre del técnico y el estado con ícono y texto (AU-R8).
- GIVEN un técnico con color asignado WHEN veo la grilla de día, la de semana y el selector THEN su color es el mismo en las tres (AU-R8).
- GIVEN los estados WHEN los veo THEN se llaman Pendiente, Confirmado, Completado, No asistió y Cancelado (AU-R8).
- Prioridad: Media. Fases: 6, 7, 11 (6.7, 7.3, 11.7).

### HU-S2-12 Ver solo las horas en que se trabaja
Como dueño del negocio quiero que la grilla muestre las horas según la disponibilidad de los técnicos elegidos para no desplazarme por horas vacías ni perder servicios.
- GIVEN dos técnicos seleccionados con horarios de 08:00 a 14:00 y de 10:00 a 18:30 WHEN abro la vista de día THEN la grilla muestra de 08:00 a 19:00 (AU-R9).
- GIVEN un servicio de 06:30 a 07:30 y disponibilidad desde las 08:00 WHEN se muestra el día THEN la grilla incluye desde las 06:00 y el servicio es visible (AU-R9).
- GIVEN técnicos sin disponibilidad configurada y sin servicios WHEN abro la agenda THEN la grilla muestra de 07:00 a 19:00 sin fallar (AU-R9).
- GIVEN 10 técnicos seleccionados WHEN se cargan las horas visibles THEN se hace una única solicitud agregada, y la grilla no muestra franja de almuerzo ni sombrea horas no laborables (AU-R9).
- Prioridad: Media. Fases: 3, 11 (3.1 a 3.4, 11.2, 11.3, 11.11).

### HU-S2-13 Ver "+N más" cuando no caben los servicios
Como dueño del negocio quiero un botón "+N más" cuando coinciden más servicios de los que caben para llegar a todos sin que la grilla se vuelva ilegible.
- GIVEN 12 servicios que coinciden en una franja de la vista de día WHEN se muestra la grilla THEN veo 5 servicios y "+7 más" (AU-R10).
- GIVEN 6 servicios que coinciden en la vista de día WHEN se muestra la grilla THEN veo los 6 y no aparece "+N más" (AU-R10).
- GIVEN 3 servicios que coinciden en un día de la vista de semana WHEN se muestra la grilla THEN veo 1 y "+2 más" (AU-R10).
- GIVEN el botón "+4 más" WHEN lo activo THEN veo la lista del día con solo los servicios de esa franja, un indicador de la franja y una forma de volver a la grilla (AU-R10).
- Prioridad: Alta. Fases: 10, 11 (10.7, 11.1, 11.8).

### HU-S2-14 Abrir un servicio desde un enlace
Como dueño del negocio quiero abrir la ficha de un servicio desde el Panel, la búsqueda o un aviso de cliente para llegar directo a él.
- GIVEN un servicio del 2026-11-03 WHEN abro la URL de la agenda con su identificador THEN veo el 2026-11-03 con la ficha abierta, aunque su técnico no esté entre los visibles (AU-R13).
- GIVEN un identificador que no existe WHEN abro la URL THEN veo "No se encontró el servicio" y ninguna ficha (AU-R13).
- GIVEN la ficha abierta por URL WHEN la cierro THEN el parámetro desaparece de la URL (AU-R13).
- Prioridad: Alta. Fases: 9 (9.1 a 9.4, 9.6).

### HU-S2-15 Ver al cliente eliminado con su alias
Como dueño del negocio quiero ver "Cliente eliminado (alias)" donde aparezca un cliente anonimizado para reconocer el historial sin ver datos personales.
- GIVEN un servicio de un cliente anonimizado con alias `bear_1` WHEN consulto la API THEN `customer.name` es `null` y `customer.alias` es `bear_1`; para un cliente no anonimizado el nombre no cambia (AU-R14).
- GIVEN ese servicio WHEN abro la grilla de escritorio y la lista móvil THEN la tarjeta y la fila muestran "Cliente eliminado (bear_1)" (AU-R14).
- GIVEN ese servicio WHEN lo veo en los resultados de búsqueda, en "Servicios de hoy", en la ficha y en el diálogo de cancelar THEN muestra "Cliente eliminado (bear_1)" (AU-R14).
- Prioridad: Alta. Fases: 5, 9, 10, 11, 12, 13 (5.4 a 5.7, 9.5, 10.3, 11.10, 12.6, 13.3).

---

## Épica 3: Agenda en celular

### HU-S2-16 Ver un día como lista cronológica
Como dueño del negocio quiero ver el día como una lista ordenada por hora, un día a la vez, para revisar la agenda en el celular.
- GIVEN dos servicios a las 09:00 de los técnicos "Beto" y "Ana" y uno a las 08:00 WHEN veo la lista THEN el orden es 08:00, 09:00 Ana, 09:00 Beto (AU-R12).
- GIVEN un servicio de 09:00 a 10:00 WHEN veo la fila THEN muestra "09:00-10:00", el cliente, el tipo de servicio, el técnico y el estado como texto con color (AU-R12).
- GIVEN un ancho de 390 px WHEN abro la agenda THEN no hay alternador Día/Semana ni vista de semana (AU-R11).
- GIVEN la agenda móvil en el 2026-10-24 WHEN toco siguiente, anterior dos veces y "Hoy" THEN veo el 25, el 23, el 22 y el día de hoy, un solo día cada vez (AU-R11).
- GIVEN la lista de una franja abierta desde "+N más" y la lista "Por cerrar" abierta desde el Panel WHEN las reviso THEN cada una es una lista filtrada con su indicador y ninguna ofrece Día/Semana (AU-R11).
- Prioridad: Alta. Fases: 9, 10 (9.1, 10.1, 10.3, 10.8).

### HU-S2-17 Filtrar la lista con chips y ocultar cancelados
Como dueño del negocio quiero filtrar con chips combinables y ocultar los cancelados para encontrar rápido lo que busco en el celular.
- GIVEN servicios de dos técnicos y de dos estados WHEN activo el chip de un técnico y el de estado "Confirmado" THEN veo solo los de ese técnico en ese estado (AU-R12).
- GIVEN servicios de "Ana", "Beto" y "Carla" WHEN activo los chips de Ana y de Beto THEN veo los de Ana y de Beto, no los de Carla (AU-R12).
- GIVEN un servicio `cancelled` y uno `confirmed` en el día WHEN veo la lista y luego activo "Mostrar cancelados" THEN al inicio solo veo el `confirmed` y después ambos (AU-R12).
- GIVEN "Mostrar cancelados" apagado WHEN activo el chip de estado "Cancelado" THEN veo el servicio cancelado (AU-R12).
- GIVEN filtros sin resultados WHEN veo la lista THEN leo "No hay servicios para estos filtros" (AU-R12).
- Prioridad: Media. Fases: 10 (10.1, 10.4, 10.6).

### HU-S2-18 Ver todos los servicios por cerrar
Como dueño del negocio quiero ver todos los servicios confirmados ya pasados y sin cerrar, de cualquier fecha, para ponerme al día.
- GIVEN un `confirmed` de hace 3 días, un `pending` pasado y un `confirmed` futuro WHEN activo "Por cerrar" THEN veo solo el `confirmed` pasado, agrupado en su día (AU-R12, DB-R9).
- GIVEN la agenda en el 2026-10-24 y un `confirmed` pasado del 2026-10-10 WHEN activo "Por cerrar" THEN veo el servicio del 2026-10-10 (AU-R12).
- GIVEN 340 servicios por cerrar WHEN abro "Por cerrar" THEN veo 200, el más antiguo primero, y "Mostrando 200 de 340", y la tarjeta del Panel muestra 340 (AU-R12, DB-R9, DB-R5).
- GIVEN 390 px y el Panel abierto WHEN toco "Servicios pendientes" y luego el botón para volver THEN regreso al Panel (AU-R3).
- Prioridad: Alta. Fases: 4, 10, 12 (4.5, 4.6, 10.2, 10.5, 12.5).

---

## Épica 4: Búsqueda

### HU-S2-19 Buscar un servicio o un cliente y abrirlo
Como dueño del negocio quiero escribir en "Buscar servicio o cliente" y abrir el resultado para llegar rápido a una ficha o a un día de la agenda.
- GIVEN el cliente "María Pérez", el tipo de servicio "Limpieza profunda" y el técnico "Carlos Ruiz" WHEN busco "pérez", "limpieza" y "carlos" THEN cada búsqueda devuelve en "Servicios" los servicios correspondientes (GS-R1).
- GIVEN un cliente con teléfono `+573001234567` WHEN busco "3001234" THEN aparece en "Clientes" (GS-R1).
- GIVEN 15 clientes y 25 servicios que coinciden WHEN busco THEN cada grupo muestra 10 resultados (GS-R1).
- GIVEN servicios del 26, 23 y 24 de octubre y del 1 de septiembre, con hoy 2026-10-24 WHEN busco THEN el orden es 24, 23, 26 y 1 (GS-R1).
- GIVEN un servicio `cancelled` WHEN lo encuentro THEN se muestra con el estado "Cancelado" visible y, a igual distancia, después de uno `confirmed` (GS-R1).
- GIVEN un cliente con 12 servicios `cancelled` y 3 `confirmed` a la misma distancia WHEN busco su nombre THEN los 3 `confirmed` están entre los 10 resultados (GS-R1).
- GIVEN resultados con el cliente "María Gómez" WHEN lo elijo THEN se abre su ficha; GIVEN un servicio del 2026-11-03 a las 10:00 WHEN lo elijo THEN se abre la agenda en ese día con su ficha (GS-R5).
- Prioridad: Alta. Fases: 5, 13 (5.1 a 5.3, 13.1 a 13.5).

### HU-S2-20 Buscar sin preocuparme por acentos ni mayúsculas
Como dueño del negocio quiero que "maria" encuentre a "María" y "MARÍA" a "Maria" para no fallar por cómo escribí.
- GIVEN el cliente "María Gómez" WHEN busco "maria" THEN aparece en "Clientes" (GS-R3).
- GIVEN el cliente "Maria Gomez" guardado sin acentos WHEN busco "MARÍA" THEN aparece en "Clientes" (GS-R3).
- GIVEN clientes "Ana" y "100%Ana" WHEN busco "%a" THEN solo se evalúa el texto literal y "Ana" no coincide (GS-R3).
- Prioridad: Alta. Fases: 1, 5 (1.3, 5.1).

### HU-S2-21 Saber cuándo la búsqueda no se envía o falla
Como dueño del negocio quiero mensajes claros en el desplegable para entender qué pasa mientras escribo.
- GIVEN el campo "Buscar servicio o cliente" WHEN escribo un solo carácter THEN no se envía ninguna solicitud y veo "Escribe al menos 2 caracteres" (GS-R2).
- GIVEN que escribo "mar" tecla por tecla en menos de la pausa WHEN termino THEN se envía una sola solicitud (GS-R5).
- GIVEN un texto de 101 caracteres, de un carácter o solo espacios WHEN se consulta la API THEN responde `validation_error` problem+json (GS-R2).
- GIVEN un texto sin coincidencias WHEN veo el desplegable THEN aparece "Sin resultados"; GIVEN que la solicitud falla THEN aparece un mensaje de error en español y puedo reintentar escribiendo (GS-R5).
- Prioridad: Media. Fases: 5, 13 (5.2, 5.3, 13.1, 13.2).

### HU-S2-22 Proteger la privacidad en los resultados
Como dueño del negocio quiero que la búsqueda nunca revele datos de personas eliminadas para cumplir con la protección de datos.
- GIVEN un cliente anonimizado con alias `bear_1` WHEN busco "bear" o "eliminado" THEN no aparece en "Clientes" (GS-R4).
- GIVEN un servicio de "Limpieza profunda" de un cliente anonimizado WHEN busco "limpieza" THEN aparece en "Servicios" como "Cliente eliminado (bear_1)", sin nombre original ni teléfono (GS-R4).
- GIVEN ese servicio WHEN busco "bear_1" THEN no aparece (GS-R4).
- GIVEN un técnico eliminado, antes "Carlos Ruiz", con alias `fox_2` WHEN busco "carlos" y "fox_2" THEN no devuelve sus servicios; GIVEN que busco "pérez" THEN sí, mostrando "Técnico eliminado (fox_2)" (GS-R4).
- Prioridad: Alta. Fases: 5, 13 (5.1, 5.3, 13.3).

### HU-S2-23 Encontrar clientes sin acentos en Clientes y en "Nuevo servicio"
Como dueño del negocio quiero que la pantalla Clientes y el selector de cliente de "Nuevo servicio" ignoren acentos para encontrar a mis clientes sin errores.
- GIVEN el cliente "María Gómez" WHEN escribo "maria" en Clientes y en el selector de "Nuevo servicio" THEN ambos listan a "María Gómez" (CS-R1).
- GIVEN un cliente con teléfono `+573001234567` WHEN busco "300 123" THEN aparece (CS-R1).
- GIVEN un cliente anonimizado con alias `bear_1` WHEN busco "bear" o "eliminado" THEN no aparece, y no aparecen clientes de otro negocio (CS-R1).
- Prioridad: Media. Fases: 1, 13 (1.4, 13.6).

---

## Épica 5: Reasignación

### HU-S2-24 Reasignar solo a técnicos libres
Como dueño del negocio quiero que el diálogo de reasignar liste solo técnicos libres en el horario exacto del servicio para no intentar reasignaciones que van a fallar.
- GIVEN un servicio de 10:00 a 11:00 y tres técnicos activos, uno libre WHEN abro el diálogo THEN solo veo al libre (TF-R4, AU-R17).
- GIVEN un técnico con horario hasta las 10:30, con un día libre parcial solapado, o con otro servicio a las 11:15 y un buffer de 30 minutos WHEN consulto THEN no aparece (TF-R1).
- GIVEN un técnico cuyo único servicio solapado está `cancelled`, o un técnico desactivado o eliminado WHEN consulto THEN el primero aparece y los otros no (TF-R1).
- GIVEN ningún técnico libre WHEN abro el diálogo THEN veo "No hay técnicos libres en este horario" (TF-R4).
- Prioridad: Alta. Fases: 2, 14 (2.1 a 2.5, 14.1, 14.2).

### HU-S2-25 No ofrecer al técnico actual ni reasignar servicios cerrados
Como dueño del negocio quiero que la lista omita al técnico actual y rechace servicios cerrados para evitar acciones sin sentido.
- GIVEN un servicio del técnico A, libre en su propio horario WHEN abro el diálogo THEN A no figura entre las opciones (TF-R2).
- GIVEN un servicio `cancelled` o `completed` WHEN se consulta la lista THEN la API responde `invalid_transition` (422) problem+json (TF-R3).
- GIVEN un identificador inexistente o de otro negocio WHEN se consulta THEN la API responde 404 problem+json (TF-R3).
- Prioridad: Media. Fases: 2, 14 (2.3, 2.4, 14.3).

### HU-S2-26 Resolver la carrera al reasignar
Como dueño del negocio quiero ver "Cupo ocupado" y una lista actualizada cuando otro servicio ocupa al técnico elegido para elegir otro sin recargar.
- GIVEN el diálogo muestra al técnico B libre WHEN otro servicio ocupa a B y confirmo THEN la API responde `slot_taken` (409), veo "Cupo ocupado" y la lista se vuelve a cargar (TF-R4, AU-R17, AU-R15).
- Prioridad: Media. Fases: 2, 14 (2.5, 14.4, 14.5).

---

## Épica 6: Navegación y vocabulario

### HU-S2-27 Navegar con una barra lateral en escritorio
Como dueño del negocio quiero una barra lateral con las secciones principales para moverme por el panel desde el escritorio.
- GIVEN un ancho de 1280 px WHEN abro la aplicación THEN la barra lateral oscura lista Panel de control, Agenda, Clientes, Técnicos, Tipos de servicio, Configuración y Perfil al pie, en ese orden (AU-R1).
- GIVEN la barra lateral WHEN reviso sus entradas THEN no existe "Reportes", "Exportar" ni "Mes" (AU-R1).
- GIVEN un ancho intermedio con la barra contraída WHEN la miro THEN cada entrada muestra su ícono y conserva su nombre accesible (AU-R1).
- GIVEN "Configuración" WHEN la abro THEN agrupa el buffer y la hora de envío del seguimiento (AU-R1).
- Prioridad: Alta. Fases: 8 (8.4, 8.7). La contracción por CSS se valida a mano (M1).

### HU-S2-28 Navegar con una barra inferior en el celular
Como dueño del negocio quiero una barra inferior de cinco entradas para llegar a lo esencial con una mano en el celular.
- GIVEN un ancho de 390 px WHEN abro la aplicación THEN veo Panel, Agenda, Clientes, Técnicos y Más, en ese orden, sin barra lateral (AU-R2).
- GIVEN un ancho de 390 px WHEN toco "Más" THEN veo "Tipos de servicio" y "Configuración", y al elegir una abre su pantalla con botón para volver (AU-R2, AU-R3).
- GIVEN la barra inferior WHEN reviso sus entradas THEN no hay "Perfil" (AU-R2).
- Prioridad: Alta. Fases: 8 (8.5, 8.7, 8.11).

### HU-S2-29 Volver al Panel en el celular
Como dueño del negocio quiero un botón "Volver" en las pantallas a las que llego desde el Panel para regresar sin perderme.
- GIVEN 390 px y el Panel abierto WHEN abro una pantalla desde él (lista "Por cerrar", ficha de un servicio, Perfil, Tipos de servicio, Configuración) THEN veo un botón para volver que regresa a la pantalla de origen (AU-R3).
- GIVEN 1280 px WHEN estoy en cualquier pantalla THEN no hay botón "Volver" (AU-R3).
- Prioridad: Media. Fases: 8, 12 (8.6, 8.11, 12.7).

### HU-S2-30 Hablar el mismo idioma: "servicio" y "Tipos de servicio"
Como dueño del negocio quiero que la interfaz diga "servicio" donde antes decía "cita" y "Tipos de servicio" para el catálogo para no confundir ambos conceptos.
- GIVEN cualquier pantalla WHEN la leo THEN dice "Nuevo servicio", "Servicios pendientes", "Cancelar servicio" y "Buscar servicio o cliente", y el catálogo se llama "Tipos de servicio" en la barra lateral y en su pantalla (AU-R4).
- GIVEN una confirmación de cancelación WHEN se muestra el diálogo THEN dice "Cancelar servicio" y no usa la palabra "cita" (AU-R15).
- GIVEN cualquier texto WHEN lo leo THEN está en español neutro con tuteo, sin voseo (AU-R15), y el error de cupo ocupado dice "Cupo ocupado" y ofrece elegir otro cupo (AU-R15).
- GIVEN la documentación `app/README.md` WHEN la leo THEN sigue el mismo vocabulario (AU-R4).
- Prioridad: Alta. Fase: 6 (6.1 a 6.10).

---

## Épica 7: Identidad visual y accesibilidad

### HU-S2-31 Reconocer la aplicación como "Schedule App"
Como dueño del negocio quiero que la aplicación se llame "Schedule App" y use un azul de marca para reconocerla al instalarla o abrirla.
- GIVEN la aplicación abierta WHEN reviso el título, la barra lateral y el manifiesto THEN el nombre es "Schedule App" y el primario es un azul alrededor de `#2563EB` (AU-R5).
- Prioridad: Baja. Fases: 7 (7.4).

### HU-S2-32 Leer todos los colores con buen contraste
Como dueño del negocio quiero que los colores nuevos se lean bien en tema claro y oscuro para trabajar sin esfuerzo.
- GIVEN los tokens de la barra lateral, de estado y de la paleta de técnicos WHEN corre la prueba de tokens THEN cada par cumple AA (4,5:1 para texto, 3:1 para componentes) en claro y oscuro (AU-R5).
- GIVEN la paleta de 10 colores WHEN corre la prueba THEN no hay dos colores iguales y el acento de cada tarjeta cumple 3:1 contra la superficie (AU-R8).
- Prioridad: Media. Fases: 7 (7.1, 7.2).

### HU-S2-33 Tocar los controles con comodidad
Como dueño del negocio quiero botones y chips de al menos 44 px para tocarlos sin errores en el celular.
- GIVEN un botón de la barra inferior o de la barra de herramientas WHEN mido su área interactiva THEN es de al menos 44 px por 44 px (AU-R5).
- Prioridad: Media. Fases: 8, 10, 13 (8.5, 10.9, 13.2). La medida real se valida a mano (M2).

---

## Épica 8: Perfil

### HU-S2-34 Ver un Perfil de demostración
Como dueño del negocio quiero abrir una pantalla de Perfil para ver dónde irá mi cuenta, sabiendo que todavía es una simulación.
- GIVEN que abro el Perfil WHEN se muestra la pantalla THEN veo el nombre "Dueño del negocio", el aviso "Perfil de demostración. Aún no hay inicio de sesión." y ningún botón de cierre de sesión (PM-R1).
- Prioridad: Baja. Fases: 8 (8.8).

### HU-S2-35 Llegar al Perfil desde escritorio y celular
Como dueño del negocio quiero abrir el Perfil desde el lugar correcto en cada dispositivo para encontrarlo sin ocupar la barra inferior.
- GIVEN un ancho de 1024 px o más WHEN toco "Perfil" al pie de la barra lateral THEN se abre el Perfil (PM-R1).
- GIVEN un ancho menor a 1024 px y el Panel abierto WHEN toco el ícono de Perfil del encabezado THEN se abre el Perfil con un botón para volver y la barra inferior no tiene entrada de Perfil (PM-R1).
- GIVEN el Perfil abierto desde el Panel en móvil WHEN toco el botón para volver THEN regreso al Panel (PM-R1, AU-R3).
- Prioridad: Baja. Fases: 8, 12 (8.4, 8.7, 8.8, 12.7).

---

## Tabla de trazabilidad: historia, requisitos de spec y tareas

| Historia | Requisitos de spec | Tareas |
|----------|--------------------|--------|
| HU-S2-01 | AU-R1, AU-R2, AU-R3 | 8.7, 12.7 |
| HU-S2-02 | DB-R1, DB-R2 | 4.1, 4.3, 4.6, 12.3 |
| HU-S2-03 | DB-R3 | 2.1, 4.4, 4.6, 12.3 |
| HU-S2-04 | DB-R1, DB-R4 | 4.1, 4.3, 12.4 |
| HU-S2-05 | DB-R5, DB-R9 | 4.2, 4.5, 4.6, 10.5, 12.5 |
| HU-S2-06 | DB-R6, AU-R13, AU-R14 | 4.4, 12.6 |
| HU-S2-07 | DB-R7, DB-R8 | 4.6, 12.2 |
| HU-S2-08 | AU-R6, AU-R16 | 11.6, 11.9, 11.11 |
| HU-S2-09 | AU-R16 | 11.6, 11.9 |
| HU-S2-10 | AU-R7 | 11.4, 11.5 |
| HU-S2-11 | AU-R8 | 6.7, 7.3, 11.7 |
| HU-S2-12 | AU-R9 | 3.1 a 3.4, 11.2, 11.3, 11.11 |
| HU-S2-13 | AU-R10 | 10.7, 11.1, 11.8 |
| HU-S2-14 | AU-R13 | 9.1 a 9.4, 9.6 |
| HU-S2-15 | AU-R14 | 5.4 a 5.7, 9.5, 10.3, 11.10, 12.6, 13.3 |
| HU-S2-16 | AU-R11, AU-R12 | 9.1, 10.1, 10.3, 10.8 |
| HU-S2-17 | AU-R12 | 10.1, 10.4, 10.6 |
| HU-S2-18 | AU-R3, AU-R12, DB-R5, DB-R9 | 4.5, 4.6, 10.2, 10.5, 12.5 |
| HU-S2-19 | GS-R1, GS-R5 | 5.1 a 5.3, 13.1 a 13.5 |
| HU-S2-20 | GS-R3 | 1.3, 5.1 |
| HU-S2-21 | GS-R2, GS-R5 | 5.2, 5.3, 13.1, 13.2 |
| HU-S2-22 | GS-R4 | 5.1, 5.3, 13.3 |
| HU-S2-23 | CS-R1 | 1.3, 1.4, 13.6 |
| HU-S2-24 | TF-R1, TF-R4, AU-R17 | 2.1 a 2.5, 14.1, 14.2 |
| HU-S2-25 | TF-R2, TF-R3 | 2.3, 2.4, 14.3 |
| HU-S2-26 | TF-R4, AU-R15, AU-R17 | 2.5, 14.4, 14.5 |
| HU-S2-27 | AU-R1 | 8.4, 8.7 |
| HU-S2-28 | AU-R2, AU-R3 | 8.5, 8.7, 8.11 |
| HU-S2-29 | AU-R3 | 8.6, 8.11, 12.7 |
| HU-S2-30 | AU-R4, AU-R15 | 6.1 a 6.10 |
| HU-S2-31 | AU-R5 | 7.4 |
| HU-S2-32 | AU-R5, AU-R8 | 7.1, 7.2 |
| HU-S2-33 | AU-R5 | 8.5, 10.9, 13.2 |
| HU-S2-34 | PM-R1 | 8.8 |
| HU-S2-35 | PM-R1, AU-R3 | 8.4, 8.7, 8.8, 12.7 |

Requisitos técnicos sin historia propia de dueño (cubiertos por tareas, no por una HU):

- PM-R2 datos simulados en un solo archivo y PM-R3 salvaguardas contra su llegada a producción (tareas 8.8 a 8.10, 15.4, 16.4).
- DB-R8 endpoint de resumen (solo lectura, aislamiento por negocio, sin datos personales de más): tareas 4.2 a 4.6.
- Migración 005, función `immutable_unaccent`, índices y verificación de extensiones (tareas 1.1, 1.2); contrato OpenAPI y cliente generado (tareas 1.5, 2.6, 3.5, 4.7, 5.7, 16.5); ayudante de viewport para jsdom (8.1, 8.2, 11.12).
- AU-R17 en su parte de cupos (crear, mover y cancelar solo por cupos ofrecidos) no cambia de comportamiento respecto del sprint 1; solo recibe el vocabulario nuevo (tarea 6.3).

Cobertura por spec: todos los requisitos de DB (R1 a R9), GS (R1 a R5), TF (R1 a R4), AU (R1 a R17) y CS (R1) aparecen en al menos una historia o en la lista técnica anterior; PM-R1 está en HU-S2-34 y HU-S2-35.
