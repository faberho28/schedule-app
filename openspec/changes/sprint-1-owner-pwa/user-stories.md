# Historias de usuario: Sprint 1 - PWA del dueño y backend de agendamiento

Este documento reúne las historias de usuario (HU) del sprint. Los criterios de aceptación se derivan de los escenarios de `specs/*/spec.md` y las fases se refieren a `tasks.md`. Prioridades: Alta (necesaria para operar la agenda de punta a punta), Media (necesaria para completar el sprint) y Baja (mejora de calidad o de cumplimiento sin bloquear la operación).

Códigos de spec: BS business-settings, SC service-catalog, TS technician-schedules, SA slot-availability, AM appointment-management, CR customer-records, CL service-closure, UI owner-agenda-ui (R1, R2... según el orden de los requisitos; ver la leyenda de `tasks.md`).

## Fuera de alcance (no hay historias)

Este sprint NO incluye, y por eso no tiene historias para: autenticación y roles, integración con WhatsApp, bot, bandeja de conversaciones, arrastrar y soltar en la agenda, fotos de evidencia y caché de agenda sin conexión. Tampoco incluye una interfaz para revocar el consentimiento (la revocación existe solo en la API, HU-24) ni el registro de supresiones con respaldos, que son deudas del final del proyecto.

---

## Épica 1: Configuración

### HU-01 Ver el negocio y su zona horaria
Como dueño del negocio quiero ver la configuración de mi negocio con su zona horaria fija para saber con qué hora local se calculan cupos y seguimientos.
- GIVEN una base migrada y sembrada WHEN consulto la configuración THEN veo el negocio sembrado con zona `America/Bogota` como valor de solo lectura (BS-R1, BS-R2).
- GIVEN un negocio ya creado WHEN se intenta cambiar la zona horaria, por ejemplo a `America/Mexico_City` THEN se rechaza y se conserva la original (BS-R2).
- GIVEN datos de dos negocios WHEN se listan servicios o técnicos del negocio A THEN no aparecen registros del negocio B (BS-R1).
- Prioridad: Alta. Fases: 2, 3, 13 (2.6, 2.8, 3.1 a 3.3, 13.1).

### HU-02 Configurar el buffer de desplazamiento
Como dueño del negocio quiero definir los minutos de desplazamiento entre citas para que los técnicos lleguen sin que se crucen sus servicios.
- GIVEN un negocio sin buffer explícito WHEN lo establezco en 20 THEN se guarda 20 y los cupos posteriores lo usan (BS-R3).
- GIVEN el formulario WHEN envío -5, 7,5 o 241 THEN se rechaza con error de validación (BS-R3).
- GIVEN una cita con buffer 15 WHEN cambio el buffer a 30 THEN la cita conserva su horario y los cupos nuevos usan 30 (BS-R3).
- Prioridad: Alta. Fases: 3, 5, 7, 13 (3.2, 5.3, 7.1, 13.1).

### HU-03 Configurar la hora de envío del seguimiento
Como dueño del negocio quiero definir a qué hora local se programan los seguimientos para que lleguen en un horario adecuado a mis clientes.
- GIVEN un negocio sin configuración WHEN abro la pantalla THEN veo `09:00` (BS-R4).
- GIVEN hora `09:00` WHEN la cambio a `10:30` y guardo THEN la interfaz muestra el valor guardado y los seguimientos posteriores usan `10:30` hora local (BS-R4, UI-R5).
- GIVEN el formulario WHEN envío "25:61" o "9am" THEN se rechaza y se conserva la hora anterior (BS-R4).
- Prioridad: Media. Fases: 3, 10, 13 (3.2, 10.1, 13.1).

### HU-04 Crear y editar servicios
Como dueño del negocio quiero registrar mis servicios con duración, precio e intervalo de seguimiento para poder agendarlos.
- GIVEN el catálogo vacío WHEN creo "Mantenimiento de aire" con 90 minutos, precio 120000 e intervalo 180 THEN queda guardado y aparece en el listado (SC-R1).
- GIVEN el formulario WHEN omito `followup_interval_days` THEN se guarda y sus citas no generan seguimientos (SC-R1).
- GIVEN el formulario WHEN envío duración 0, nombre vacío o precio negativo THEN se rechaza con errores por campo (SC-R1).
- GIVEN una cita con precio 100000 WHEN cambio el precio del servicio a 130000 THEN la cita conserva 100000 y las nuevas usan 130000 (SC-R2).
- Prioridad: Alta. Fases: 3, 13 (3.4, 3.7, 13.2).

### HU-05 Desactivar y reactivar servicios
Como dueño del negocio quiero dejar de ofrecer un servicio sin perder su historial para retirar servicios que ya no presto.
- GIVEN un servicio con citas completadas WHEN lo desactivo THEN deja de aparecer al crear citas y el historial lo sigue mostrando (SC-R3).
- GIVEN un servicio desactivado WHEN lo reactivo THEN vuelve a ofrecerse para citas nuevas (SC-R3).
- Prioridad: Media. Fases: 3, 13 (3.5, 13.2).

### HU-06 Recibir una advertencia al cambiar la duración de un servicio
Como dueño del negocio quiero saber cuántas citas futuras conservan la duración anterior para decidir con información sin que se bloquee el cambio.
- GIVEN un servicio de 60 minutos con 5 citas futuras WHEN cambio la duración a 90 y guardo THEN se guarda, veo "Hay 5 citas futuras que conservan la duración anterior" y las 5 citas conservan 60 minutos (SC-R4).
- GIVEN un servicio sin citas futuras WHEN cambio la duración THEN se guarda sin advertencia y las citas nuevas usan la duración nueva (SC-R4).
- Prioridad: Baja. Fases: 3, 13 (3.6, 13.2).

### HU-07 Gestionar técnicos
Como dueño del negocio quiero registrar y editar a mis técnicos para repartir el trabajo entre varias personas.
- GIVEN un negocio sin técnicos WHEN creo al técnico "Carlos" THEN queda activo y disponible para configurar su horario (TS-R1).
- GIVEN el formulario WHEN envío un nombre vacío THEN se rechaza con error de validación (TS-R1).
- Prioridad: Alta. Fases: 4, 13 (4.1 a 4.5, 13.3).

### HU-08 Definir la disponibilidad semanal de un técnico
Como dueño del negocio quiero definir las franjas semanales de cada técnico en hora local para que el sistema ofrezca cupos solo cuando trabaja.
- GIVEN un técnico sin disponibilidad WHEN defino lunes a viernes de 08:00 a 17:00 THEN se guardan cinco franjas (TS-R2).
- GIVEN una franja lunes 08:00-12:00 WHEN agrego lunes 11:00-15:00 THEN se rechaza por solaparse (TS-R2).
- GIVEN el formulario WHEN envío inicio 17:00 y fin 08:00 THEN se rechaza con error de validación (TS-R2).
- GIVEN una cita `confirmed` el martes a las 16:00 WHEN cambio el martes a 08:00-14:00 THEN se rechaza el cambio y se lista esa cita (TS-R4).
- GIVEN un técnico con citas futuras WHEN amplío una franja sin dejar citas fuera THEN se guarda sin restricciones (TS-R4).
- Prioridad: Alta. Fases: 8, 13 (8.4, 8.5, 13.4).

### HU-09 Registrar días libres
Como dueño del negocio quiero registrar ausencias de un técnico para que no se le asignen cupos y para detectar citas que quedan afectadas.
- GIVEN un técnico sin citas el viernes WHEN registro el viernes como día libre THEN se guarda y no se ofrecen cupos de ese técnico (TS-R3, SA-R1).
- GIVEN un técnico con dos citas `confirmed` el viernes WHEN intento registrar el día libre THEN se rechaza y se devuelven las dos citas afectadas (TS-R3).
- GIVEN un rechazo por citas afectadas WHEN veo la pantalla THEN la interfaz lista las citas y muestra la propuesta de reasignación (UI-R5).
- Prioridad: Alta. Fases: 8, 13 (8.4, 13.4, 13.5).

### HU-10 Desactivar y reactivar técnicos
Como dueño del negocio quiero desactivar y reactivar técnicos sin perder su historial para manejar ausencias largas o bajas temporales.
- GIVEN un técnico con tres citas futuras `pending` o `confirmed` WHEN intento desactivarlo THEN se rechaza, se listan las tres citas y se ofrece la propuesta de reasignación (TS-R5).
- GIVEN un técnico sin citas futuras activas WHEN lo desactivo THEN queda inactivo, no aparece en los cupos y su historial sigue visible (TS-R5).
- GIVEN un técnico inactivo WHEN lo reactivo THEN vuelve a recibir cupos y asignaciones, sin reasignaciones (TS-R5).
- Prioridad: Media. Fases: 8, 13 (8.6, 13.6).

### HU-11 Revisar y aceptar una propuesta de reasignación
Como dueño del negocio quiero que el sistema proponga reasignar las citas afectadas para resolver un cambio de horario sin reprogramar a mano cada cita.
- GIVEN dos citas afectadas y otro técnico libre en ambos horarios WHEN acepto la propuesta THEN ambas cambian de técnico en una transacción, conservan su horario y quedan marcadas con cambio de técnico (TS-R7).
- GIVEN una cita afectada sin técnico disponible WHEN se genera la propuesta THEN figura como no resuelta, no se aplica nada parcial y la operación sigue rechazada hasta resolverla a mano (TS-R7, AM-R4).
- GIVEN una propuesta aceptada cuyo segundo cupo fue ocupado WHEN se aplica THEN no se reasigna ninguna cita y se responde `slot_taken` (409) (TS-R7).
- GIVEN una cita afectada nueva o cancelada entre la vista previa y la aplicación WHEN se aplica THEN no se reasigna ninguna cita y se responde `proposal_stale` (409) con la propuesta recalculada (TS-R7).
- GIVEN una propuesta pendiente WHEN la rechazo THEN no cambia ninguna cita (TS-R7).
- Prioridad: Alta. Fases: 8, 13 (8.2 a 8.4, 13.5).

---

## Épica 2: Agenda

### HU-12 Ver la agenda del día por técnico
Como dueño del negocio quiero ver la agenda del día con una columna por técnico para saber qué hace cada persona.
- GIVEN dos técnicos activos con citas el día seleccionado WHEN abro la vista de día THEN veo dos columnas con las citas en su horario (UI-R3).
- GIVEN una cita en la agenda WHEN intento arrastrarla THEN no ocurre ningún cambio; mover requiere el diálogo de cupos (UI-R3).
- Prioridad: Alta. Fases: 6, 14 (6.6, 14.1, 14.2, 14.4).

### HU-13 Ver la agenda de la semana
Como dueño del negocio quiero ver la semana completa agrupada por técnico para planificar la carga de trabajo.
- GIVEN citas durante la semana WHEN cambio a la vista de semana THEN veo los siete días con las citas agrupadas por técnico (UI-R3).
- Prioridad: Media. Fases: 14 (14.1, 14.3, 14.4).

### HU-14 Ofrecer solo cupos adaptativos y válidos
Como dueño del negocio quiero que el sistema ofrezca únicamente cupos que respeten duración, buffer, disponibilidad y días libres para no agendar horarios imposibles.
- GIVEN franja 08:00-12:00, servicio de 60 minutos y buffer de 15 WHEN consulto los cupos THEN el primero es a las 08:00 y el siguiente a las 09:15 (SA-R1).
- GIVEN una cita de 08:00 a 09:00 con buffer de 15 WHEN consulto cupos de 60 minutos THEN el primero libre es a las 09:15 (SA-R1).
- GIVEN un hueco menor que duración más buffer WHEN consulto cupos THEN no se ofrece ninguno en ese hueco (SA-R1).
- GIVEN una franja que termina a las 12:00 y un cupo de 60 minutos que empezaría a las 11:30 WHEN consulto THEN no se ofrece (SA-R1).
- GIVEN cupos pasados WHEN consulto THEN no se ofrecen (SA-R1).
- GIVEN un negocio en `America/Bogota` y franja 08:00-12:00 WHEN calculo cupos THEN el primero corresponde a 13:00 UTC; en una zona con horario de verano no se ofrece una hora local inexistente (SA-R3).
- GIVEN un bloque ocupado (cita con buffer, `completed` cerrada antes de tiempo o `no_show`) WHEN consulto cupos THEN el bloque completo sigue ocupado; solo `cancelled` lo libera (SA-R2).
- Prioridad: Alta. Fases: 5, 6 (5.2 a 5.4, 6.2).

### HU-15 Asignación automática del técnico
Como dueño del negocio quiero que el sistema asigne el técnico con menos carga entre los disponibles para repartir el trabajo de forma justa.
- GIVEN el técnico A con 180 minutos y B con 60, ambos libres a las 10:00 WHEN se asigna el cupo THEN se asigna B (SA-R4).
- GIVEN B menos cargado pero ocupado y A libre WHEN se asigna THEN se asigna A (SA-R4).
- GIVEN dos técnicos libres con igual carga WHEN se asigna THEN se elige el más antiguo por `created_at` y luego por `id` (SA-R4).
- GIVEN citas con buffer y una `cancelled` WHEN se calcula la carga THEN cuenta minutos de servicio de citas no canceladas sin buffer (SA-R4).
- GIVEN ningún técnico disponible WHEN se solicita el cupo THEN se informa que no hay cupo (SA-R4).
- Prioridad: Alta. Fases: 5, 6 (5.5, 5.6, 6.2).

---

## Épica 3: Citas

### HU-16 Crear una cita en un cupo ofrecido
Como dueño del negocio quiero crear una cita eligiendo un cupo ofrecido, con la dirección confirmada, para registrar el servicio sin errores.
- GIVEN un cliente, un servicio de 60 minutos a 100000 y un cupo a las 10:00 WHEN creo la cita THEN queda `confirmed`, con técnico asignado, precio 100000 y la dirección copiada (AM-R1).
- GIVEN un cliente con dirección guardada "Calle 10 # 5-20" WHEN abro el diálogo de nueva cita THEN la dirección aparece precargada y puedo confirmarla o editarla (AM-R1, CR-R4, UI-R4).
- GIVEN un cupo ofrecido WHEN intento crear la cita sin dirección THEN se rechaza con error de validación (AM-R1).
- GIVEN un horario que no corresponde a un cupo generado WHEN intento crear la cita THEN se rechaza con `slot_not_offered` (422) (AM-R1, SA-R6).
- GIVEN el diálogo de nueva cita WHEN lo abro THEN veo solo cupos ofrecidos, con el técnico asignado, y no puedo escribir un horario libre (UI-R4).
- GIVEN una cita con dirección "Calle 10 # 5-20" WHEN el cliente cambia su dirección a "Carrera 7 # 1-1" THEN la cita conserva la dirección original (AM-R1); GIVEN que creo una cita con dirección "Carrera 7 # 1-1" THEN la ficha del cliente pasa a esa dirección (CR-R4).
- Prioridad: Alta. Fases: 6, 15 (6.3, 6.4, 15.1).

### HU-17 Evitar cruces de citas y ver "Cupo ocupado"
Como dueño del negocio quiero que sea imposible cruzar citas de un mismo técnico para no fallarle a ningún cliente.
- GIVEN dos solicitudes simultáneas para el mismo cupo WHEN ambas se procesan THEN se crea una cita y la otra recibe `slot_taken` (409) (AM-R2).
- GIVEN una cita de 10:00 a 11:00 con buffer de 15 WHEN intento crear otra para el mismo técnico a las 11:10 THEN se rechaza con `slot_taken` (AM-R2).
- GIVEN una cita `completed` o `no_show` de 10:00 a 11:00 con buffer WHEN intento crear otra a las 10:30 THEN se responde `slot_taken` (AM-R2).
- GIVEN una cita `cancelled` que ocupaba el cupo de las 10:00 WHEN creo una cita nueva en ese cupo THEN tiene éxito (AM-R2).
- GIVEN una hora fuera de la grilla que no colisiona con ninguna cita WHEN la solicito THEN se responde `slot_not_offered` (422), no `slot_taken` (SA-R6).
- GIVEN que otra persona ocupó el cupo que confirmo WHEN la API responde `slot_taken` THEN veo "Cupo ocupado" y puedo elegir otro cupo (UI-R2, UI-R4).
- Prioridad: Alta. Fases: 2, 6, 15 (2.4, 6.7, 6.8, 15.2).

### HU-18 Mover una cita
Como dueño del negocio quiero mover una cita a otro cupo ofrecido para reprogramarla sin crear una nueva.
- GIVEN una cita confirmada a las 10:00 y un cupo libre a las 14:00 WHEN la muevo THEN queda a las 14:00 y las 10:00 vuelve a estar libre (AM-R3).
- GIVEN una cita de 10:00-11:00 con buffer de 15 WHEN consulto cupos para moverla THEN su propio bloque cuenta como libre (SA-R5).
- GIVEN los técnicos A (actual) y B libres en el nuevo cupo, con B menos cargado WHEN muevo la cita THEN se mantiene A sin marca de cambio de técnico (SA-R5).
- GIVEN A ocupado en el nuevo cupo y B libre WHEN muevo la cita THEN se asigna B, la cita queda marcada con cambio de técnico y el diálogo lo indica (SA-R5, UI-R4).
- GIVEN que otro usuario ocupó el cupo destino WHEN confirmo el movimiento THEN se responde `slot_taken` (409) y la cita conserva su horario (AM-R3).
- GIVEN una cita `completed`, `no_show` o `cancelled` WHEN intento moverla THEN se rechaza; debe reabrirse a `confirmed` antes (las canceladas no se reabren) (AM-R3).
- GIVEN la agenda WHEN intento arrastrar una cita THEN no ocurre ningún cambio (UI-R3).
- Prioridad: Alta. Fases: 5, 7, 15 (7.1 a 7.3, 15.3).

### HU-19 Reasignar manualmente el técnico de una cita
Como dueño del negocio quiero cambiar el técnico de una cita conservando la hora para cubrir imprevistos o resolver citas que la propuesta no pudo reasignar.
- GIVEN una cita del técnico A a las 10:00 y el técnico B libre WHEN la reasigno a B THEN pasa a B, conserva la hora y queda marcada con cambio de técnico (AM-R4).
- GIVEN B ocupado a las 10:00 WHEN intento reasignar a B THEN se responde `slot_taken` (409) y la cita no cambia (AM-R4).
- Prioridad: Media. Fases: 7, 15 (7.4, 7.5, 15.4).

### HU-20 Cancelar una cita
Como dueño del negocio quiero cancelar una cita, con o sin motivo, para liberar el cupo.
- GIVEN una cita `confirmed` WHEN la cancelo y confirmo THEN su estado es `cancelled`, el cupo vuelve a ofrecerse y se muestra como cancelada (AM-R5, UI-R4).
- GIVEN una cita `confirmed` WHEN la cancelo sin motivo THEN pasa a `cancelled` sin error (AM-R5).
- GIVEN una cita `cancelled` WHEN intento cambiarla a `confirmed` THEN se rechaza; para volver a agendar se crea una cita nueva (AM-R5).
- Prioridad: Alta. Fases: 6, 15 (6.5, 15.4).

---

## Épica 4: Clientes y consentimiento

### HU-21 Crear clientes con teléfono normalizado
Como dueño del negocio quiero registrar clientes con su teléfono para agendarles servicios y contactarlos más adelante.
- GIVEN el formulario de cliente WHEN lo abro THEN el teléfono muestra `+57` precargado (UI-R6, CR-R1).
- GIVEN el formulario WHEN ingreso "300 123 4567" THEN se guarda `+573001234567` y el consentimiento queda `pending` (CR-R1).
- GIVEN el formulario WHEN ingreso "abc" o lo dejo vacío THEN se rechaza con error de validación (CR-R1).
- GIVEN un cliente con `+573001234567` WHEN creo otro con el mismo número THEN se responde 409 indicando que ya existe (CR-R1).
- Prioridad: Alta. Fases: 9, 16 (9.1, 16.1).

### HU-22 Registrar la autorización previa del cliente
Como dueño del negocio quiero registrar que el cliente ya autorizó el tratamiento de sus datos, con fecha y medio, para cumplir la Ley 1581 y poder programar seguimientos.
- GIVEN un cliente con consentimiento `pending` WHEN registro autorización con fecha 2026-10-15 y medio `in_person` ("En persona") THEN el consentimiento pasa a otorgado y se guarda un registro de auditoría (CR-R3).
- GIVEN un cliente con consentimiento `pending` WHEN registro autorización sin medio THEN se rechaza y sigue `pending` (CR-R3, UI-R6).
- GIVEN el diálogo de autorización WHEN elijo el medio THEN veo las etiquetas "En persona", "Llamada telefónica", "WhatsApp", "Formulario o documento escrito" y "Otro" (CR-R3, UI-R6).
- Prioridad: Alta. Fases: 9, 16 (9.2, 16.3).

### HU-23 Consultar la ficha, el historial y la auditoría del cliente
Como dueño del negocio quiero ver el historial de servicios y el rastro de consentimiento de un cliente para atenderlo con contexto y demostrar su autorización.
- GIVEN un cliente con una cita `completed` y una `cancelled` WHEN abro su ficha THEN veo ambas citas con su estado, de la más reciente a la más antigua, con servicio, técnico, precio y dirección copiados (CR-R8).
- GIVEN un cliente con autorización registrada WHEN abro su ficha THEN veo la fecha, el medio y el registro de auditoría (CR-R3).
- GIVEN la ficha WHEN la abro THEN veo su última dirección guardada (CR-R4, UI-R6).
- Prioridad: Media. Fases: 9, 16 (9.5, 16.2).

### HU-24 Revocación del consentimiento (solo API en este sprint)
Como dueño del negocio quiero que, si un cliente revoca su consentimiento, se cancelen de inmediato sus seguimientos pendientes sin borrar su ficha para respetar su decisión.
- GIVEN un cliente con consentimiento otorgado y un seguimiento `pending` WHEN se registra la revocación THEN el seguimiento pasa a `cancelled` con `cancel_reason='consent_revoked'` y la ficha y las citas permanecen (CR-R5).
- GIVEN un cliente que revocó WHEN vuelve a consentir THEN se aplica la revisión de consentimiento tardío (CR-R5, CR-R7).
- Nota: el modelo y la API lo soportan, pero no hay pantalla de revocación en este sprint.
- Prioridad: Media. Fases: 9, 16 (9.3, 16.5).

### HU-25 Seguimiento por consentimiento tardío
Como dueño del negocio quiero que, al registrar un consentimiento tardío, se programen los seguimientos que correspondan según el historial para no perder clientes recurrentes.
- GIVEN una cita completada hace 30 días de un servicio con intervalo de 180 días, sin cita futura ni seguimiento pendiente WHEN registro el consentimiento THEN se crea un seguimiento con fecha igual a completado más 180 días (CR-R7).
- GIVEN la última cita completada de un servicio de 90 días ocurrida hace 120 días WHEN registro el consentimiento THEN no se crea seguimiento (CR-R7).
- GIVEN una cita futura `confirmed` del mismo servicio WHEN registro el consentimiento THEN no se crea seguimiento (CR-R7).
- GIVEN tres citas completadas del mismo servicio WHEN registro el consentimiento THEN se evalúa solo la más reciente y se crea como máximo un seguimiento (CR-R7).
- GIVEN un seguimiento ya creado WHEN la revisión se ejecuta de nuevo THEN no se crea una segunda fila (CR-R7).
- Prioridad: Media. Fase: 9 (9.4).

### HU-26 Garantizar que no existan mensajes programados sin consentimiento
Como dueño del negocio quiero que ningún cliente sin consentimiento otorgado tenga mensajes programados para evitar contactos no autorizados.
- GIVEN un cliente con consentimiento `pending` y una cita completada de un servicio con intervalo WHEN la cita se cierra THEN no se crea ninguna fila en `scheduled_messages` (CR-R6, CL-R3).
- GIVEN un cliente sin consentimiento otorgado WHEN algo intenta insertar un seguimiento `pending` THEN la base de datos lo rechaza (CR-R6).
- Prioridad: Alta. Fases: 2, 9, 10 (2.5, 9.6, 10.4).

---

## Épica 5: Cierre del servicio

### HU-27 Cerrar una cita como Completada o No asistió
Como dueño del negocio quiero cerrar una cita con una confirmación explícita para registrar si el servicio se prestó.
- GIVEN una cita `confirmed` cuya hora ya pasó WHEN la marco Completada y confirmo THEN el estado es `completed` y se registra `completed_at` (CL-R1).
- GIVEN una cita `confirmed` cuya hora ya pasó WHEN la marco No asistió y confirmo THEN el estado es `no_show` y no se crea seguimiento (CL-R1).
- GIVEN una cita `pending` cuya hora ya pasó WHEN la marco Completada y confirmo THEN el estado es `completed` (CL-R1).
- GIVEN una cita `confirmed` cuya hora terminó hace 3 días sin acción WHEN transcurre el tiempo THEN sigue `confirmed` (CL-R1).
- GIVEN una cita `cancelled` WHEN intento cerrarla THEN se rechaza (CL-R1, CL-R5).
- Prioridad: Alta. Fases: 10, 17 (10.2, 17.1).

### HU-28 Cerrar anticipadamente con motivo
Como dueño del negocio quiero cerrar una cita antes de su hora, con motivo y confirmación reforzada, para registrar servicios adelantados sin perder la trazabilidad.
- GIVEN una cita `confirmed` que empieza mañana WHEN la marco Completada con motivo "Servicio adelantado por el cliente" y confirmación reforzada THEN pasa a `completed` y se guarda actor, instante y motivo (CL-R2).
- GIVEN la misma cita WHEN intento cerrarla sin motivo THEN se rechaza y la cita no cambia (CL-R2).
- GIVEN la misma cita con motivo WHEN la envío sin confirmación reforzada THEN se rechaza (CL-R2).
- GIVEN una cita de 10:00 a 11:00 con buffer de 15 cerrada anticipadamente a las 10:20 WHEN consulto los cupos THEN el bloque 10:00-11:15 sigue ocupado (CL-R2, SA-R2).
- GIVEN una cita futura WHEN elijo Completada en la interfaz THEN se exige motivo y un segundo paso de confirmación (UI-R6).
- Prioridad: Media. Fases: 10, 17 (10.3, 17.2).

### HU-29 Programar el seguimiento al completar
Como dueño del negocio quiero que al completar una cita se programe el seguimiento del servicio para recuperar ingresos recurrentes.
- GIVEN un cliente con consentimiento, un servicio con intervalo de 180 días y `followup_send_time` 09:00 WHEN la cita se completa el 2026-11-01 THEN existe una única fila `pending` programada para 2027-04-30 a las 09:00 hora local (CL-R3, BS-R4).
- GIVEN un seguimiento `pending` de un servicio WHEN se completa una nueva cita del mismo servicio THEN el anterior queda anulado como reemplazado y existe un único seguimiento calculado desde la nueva fecha (CL-R3).
- GIVEN una cita futura `confirmed` del mismo servicio WHEN una cita de ese servicio se completa THEN no se crea seguimiento (CL-R3).
- GIVEN un servicio sin intervalo, o un cliente sin consentimiento WHEN la cita se completa THEN no se crea fila (CL-R3, CR-R6).
- GIVEN este sprint WHEN se programan seguimientos THEN nunca se envía ningún mensaje (CL-R3).
- Prioridad: Alta. Fase: 10 (10.1, 10.4).

### HU-30 Corregir el cierre de una cita
Como dueño del negocio quiero corregir un cierre equivocado y la fecha de completado para que el historial y los seguimientos reflejen la realidad.
- GIVEN una cita `completed` con seguimiento pendiente WHEN la corrijo a `no_show` THEN el seguimiento queda anulado (CL-R4).
- GIVEN una cita `no_show` de cliente con consentimiento y servicio con intervalo WHEN la corrijo a `completed` THEN se crea exactamente un seguimiento pendiente (CL-R4).
- GIVEN una cita completada el 2026-11-01 con intervalo 90 días WHEN corrijo la fecha de completado al 2026-11-05 THEN el seguimiento se recalcula a 2027-02-03 sin duplicarse (CL-R4).
- GIVEN cualquier corrección WHEN se aplica THEN se registra quién, cuándo y por qué (CL-R4).
- Prioridad: Media. Fases: 10, 17 (10.5, 10.6, 17.3).

### HU-31 Devolver una cita cerrada a Confirmada
Como dueño del negocio quiero devolver una cita cerrada a `confirmed` con confirmación reforzada para deshacer un cierre hecho por error sin perder el bloque de tiempo.
- GIVEN una cita `completed` con seguimiento pendiente WHEN la devuelvo a `confirmed` con confirmación reforzada THEN queda `confirmed`, el seguimiento se anula y se registra quién, cuándo y por qué (CL-R4).
- GIVEN una cita `no_show` WHEN la devuelvo a `confirmed` con confirmación reforzada THEN queda `confirmed`, se registra la auditoría y su bloque sigue ocupado (CL-R4).
- GIVEN una cita `completed` WHEN intento devolverla sin la confirmación reforzada THEN la API responde 422 y sigue `completed` (CL-R4).
- GIVEN una cita cerrada WHEN elijo devolverla a Confirmada en la interfaz THEN se exige un segundo paso de confirmación reforzada (UI-R6).
- GIVEN una cita `cancelled` WHEN intento corregir su cierre THEN se rechaza e indica crear una cita nueva (CL-R5).
- Prioridad: Media. Fases: 10, 17 (10.5 a 10.7, 17.3, 17.4).

---

## Épica 6: Supresión de datos

### HU-32 Eliminar (anonimizar) a un cliente
Como dueño del negocio quiero eliminar a un cliente que pide la supresión de sus datos sin perder el historial operativo, para cumplir la Ley 1581.
- GIVEN un cliente con citas completadas, direcciones copiadas y un seguimiento `pending` WHEN lo elimino THEN conserva su `id` y sus citas, su nombre pasa a un alias como "Cliente eliminado (bear_1)", desaparecen teléfono, dirección, notas y direcciones copiadas, y el seguimiento queda anulado (CR-R2).
- GIVEN dos clientes anonimizados del mismo negocio WHEN comparo sus teléfonos THEN son marcadores aleatorios distintos que no son números E.164 válidos (CR-R2).
- GIVEN un cliente ya anonimizado WHEN repito la eliminación THEN no cambia ningún dato y responde éxito (CR-R2).
- GIVEN una persona anonimizada que vuelve a escribir desde el mismo teléfono WHEN se registra THEN se trata como un cliente nuevo con consentimiento `pending` (CR-R2).
- GIVEN un cliente anonimizado WHEN intento crearle una cita o registrarle consentimiento THEN se rechaza (CR-R2).
- Prioridad: Alta. Fases: 9, 16 (9.7, 9.8, 16.4). El registro de supresiones con HMAC queda como deuda del final del proyecto.

### HU-33 Eliminar (anonimizar) a un técnico
Como dueño del negocio quiero eliminar a un técnico conservando su historial atribuido a un alias para proteger sus datos personales sin romper la agenda.
- GIVEN un técnico con dos citas `confirmed` futuras WHEN intento eliminarlo THEN se rechaza con `schedule_conflict` (409), se listan las citas, se ofrece la propuesta y el técnico conserva sus datos (TS-R6).
- GIVEN un técnico con dos citas futuras y otro técnico libre WHEN acepto la propuesta y confirmo la eliminación THEN en una sola transacción las citas pasan al otro técnico con su horario intacto y el técnico queda anonimizado con un alias (TS-R6, TS-R7).
- GIVEN un técnico "Carlos" con citas completadas WHEN lo elimino THEN sus citas se conservan atribuidas a "Técnico eliminado (tiger_1)" y ni su nombre ni su teléfono permanecen (TS-R6).
- GIVEN un técnico ya anonimizado como `tiger_1` WHEN elimino a otro THEN el nuevo alias es distinto (TS-R6).
- GIVEN un técnico eliminado WHEN se inspeccionan los datos persistidos THEN no existe vínculo entre la persona y su alias (TS-R6).
- Prioridad: Media. Fases: 8, 13, 16 (8.7, 13.6, 16.4).

### HU-34 Retirar datos operativos sin perder el historial (borrado lógico)
Como dueño del negocio quiero que los servicios y demás datos operativos retirados se oculten sin eliminarse físicamente para conservar el historial de citas.
- GIVEN un servicio con `deleted_at` establecido WHEN consulto el listado con los filtros por defecto THEN no aparece y sus citas históricas siguen mostrando el nombre copiado (SC-R3).
- GIVEN la API WHEN se revisa su contrato THEN no existe `DELETE` de servicios, citas ni disponibilidad; `DELETE` existe solo para clientes y técnicos con semántica de anonimización (SC-R3, CR-R2, TS-R6).
- Prioridad: Media. Fases: 2, 3, 11 (2.2, 3.5, 11.3).

---

## Épica 7: PWA

### HU-35 Instalar la aplicación
Como dueño del negocio quiero instalar "Schedule App" en mi dispositivo para abrirla como una aplicación.
- GIVEN la aplicación abierta en un navegador compatible WHEN solicito instalarla THEN se instala con el nombre "Schedule App" y un ícono propio, con paleta primaria azul (UI-R1).
- Prioridad: Media. Fase: 12 (12.1, 12.5).

### HU-36 Ver una pantalla clara cuando no hay conexión
Como dueño del negocio quiero ver un aviso claro cuando no tengo conexión para entender por qué no puedo usar la agenda.
- GIVEN la aplicación instalada y sin conexión WHEN abro la agenda THEN veo "Sin conexión. Necesitas internet para ver y modificar la agenda. Reintenta cuando recuperes señal." y un botón "Reintentar", sin datos de agenda (UI-R1).
- GIVEN la pantalla sin conexión WHEN pulso "Reintentar" y ya hay conexión THEN la aplicación carga la agenda normalmente (UI-R1).
- Prioridad: Baja. Fase: 12 (12.5).

### HU-37 Usar la interfaz en español
Como dueño del negocio quiero que toda la interfaz esté en español neutro con tuteo para entenderla sin ambigüedades.
- GIVEN cualquier pantalla, error o confirmación WHEN la veo THEN el texto está en español neutro con tuteo, sin voseo (UI-R2).
- GIVEN que confirmo un cupo que otro ocupó WHEN la API devuelve `slot_taken` THEN veo "Cupo ocupado" y se ofrece elegir otro cupo (UI-R2).
- Prioridad: Media. Fases: 12, 13, 15 (12.3, 12.4, 13.7, 15.2).

---

## Tabla de trazabilidad: historia, requisitos de spec y tareas

| Historia | Requisitos de spec | Tareas |
|----------|--------------------|--------|
| HU-01 | BS-R1, BS-R2 | 2.6, 2.8, 3.1 a 3.3, 13.1 |
| HU-02 | BS-R3 | 3.2, 5.3, 7.1, 13.1 |
| HU-03 | BS-R4, UI-R5 | 3.2, 10.1, 13.1 |
| HU-04 | SC-R1, SC-R2 | 3.4, 3.7, 13.2 |
| HU-05 | SC-R3 | 3.5, 13.2 |
| HU-06 | SC-R4 | 3.6, 13.2 |
| HU-07 | TS-R1 | 4.1 a 4.5, 13.3 |
| HU-08 | TS-R2, TS-R4 | 8.4, 8.5, 13.4 |
| HU-09 | TS-R3, SA-R1, UI-R5 | 8.4, 13.4, 13.5 |
| HU-10 | TS-R5 | 8.6, 13.6 |
| HU-11 | TS-R7, AM-R4 | 8.2 a 8.4, 13.5 |
| HU-12 | UI-R3 | 6.6, 14.1, 14.2, 14.4 |
| HU-13 | UI-R3 | 14.1, 14.3, 14.4 |
| HU-14 | SA-R1, SA-R2, SA-R3 | 5.2 a 5.4, 6.2 |
| HU-15 | SA-R4 | 5.5, 5.6, 6.2 |
| HU-16 | AM-R1, CR-R4, SA-R6, UI-R4 | 6.3, 6.4, 15.1 |
| HU-17 | AM-R2, SA-R6, UI-R2, UI-R4 | 2.4, 6.7, 6.8, 15.2 |
| HU-18 | AM-R3, SA-R5, UI-R3, UI-R4 | 7.1 a 7.3, 14.2, 15.3 |
| HU-19 | AM-R4 | 7.4, 7.5, 15.4 |
| HU-20 | AM-R5, UI-R4 | 6.5, 15.4 |
| HU-21 | CR-R1, UI-R6 | 9.1, 16.1 |
| HU-22 | CR-R3, UI-R6 | 9.2, 16.3 |
| HU-23 | CR-R3, CR-R4, CR-R8, UI-R6 | 9.5, 16.2 |
| HU-24 | CR-R5, CR-R7 | 9.3, 16.5 |
| HU-25 | CR-R7 | 9.4 |
| HU-26 | CR-R6, CL-R3 | 2.5, 9.6, 10.4 |
| HU-27 | CL-R1, CL-R5 | 10.2, 17.1 |
| HU-28 | CL-R2, SA-R2, UI-R6 | 10.3, 17.2 |
| HU-29 | CL-R3, BS-R4, CR-R6 | 10.1, 10.4 |
| HU-30 | CL-R4 | 10.5, 10.6, 17.3 |
| HU-31 | CL-R4, CL-R5, UI-R6 | 10.5 a 10.7, 17.3, 17.4 |
| HU-32 | CR-R2 | 9.7, 9.8, 16.4 |
| HU-33 | TS-R6, TS-R7 | 8.7, 13.6, 16.4 |
| HU-34 | SC-R3, CR-R2, TS-R6 | 2.2, 3.5, 11.3 |
| HU-35 | UI-R1 | 12.1, 12.5 |
| HU-36 | UI-R1 | 12.5 |
| HU-37 | UI-R2 | 12.3, 12.4, 13.7, 15.2 |

Requisitos técnicos sin historia propia de dueño (cubiertos por tareas, no por una HU): UI-R7 contrato de API tipado (tareas 11.1 a 11.4, 12.4, 18.7).

Cobertura por spec: todos los requisitos de BS (R1 a R4), SC (R1 a R4), TS (R1 a R7), SA (R1 a R6), AM (R1 a R5), CR (R1 a R8), CL (R1 a R5) y UI (R1 a R6) aparecen en al menos una historia.
