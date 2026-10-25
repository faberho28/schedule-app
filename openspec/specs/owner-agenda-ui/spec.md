# Delta for owner-agenda-ui

## ADDED Requirements

### Requirement: Shell de PWA instalable

La aplicación MUST ser instalable como PWA con nombre "Schedule App" y paleta primaria azul. El sprint MUST cubrir únicamente el shell instalable; la aplicación MUST NOT cachear datos de agenda para uso sin conexión.

#### Scenario: Instalación

- GIVEN la aplicación abierta en un navegador compatible
- WHEN el usuario solicita instalarla
- THEN se instala con el nombre "Schedule App" y un ícono propio

#### Scenario: Sin conexión

- GIVEN la aplicación instalada y sin conexión
- WHEN el usuario abre la agenda
- THEN se muestra una pantalla simple con el texto "Sin conexión. Necesitas internet para ver y modificar la agenda. Reintenta cuando recuperes señal." y un botón "Reintentar", sin datos de agenda

#### Scenario: Reintentar

- GIVEN la pantalla sin conexión
- WHEN el usuario pulsa "Reintentar" y ya hay conexión
- THEN la aplicación carga la agenda normalmente

### Requirement: Interfaz en español

Todo el texto visible MUST estar en español neutro con tuteo (sin voseo), incluidos etiquetas, errores y confirmaciones, y MUST seguir el vocabulario "servicio" y "Tipos de servicio" (ver "Vocabulario "servicio" y "Tipos de servicio"").

#### Scenario: Error de cupo ocupado

- GIVEN el dueño confirma un cupo que otro ocupó
- WHEN la API devuelve `slot_taken` (409)
- THEN la interfaz muestra "Cupo ocupado" en español y ofrece elegir otro cupo

#### Scenario: Vocabulario en un error

- GIVEN una confirmación de cancelación
- WHEN se muestra el diálogo
- THEN el texto dice "Cancelar servicio" y no usa la palabra "cita"

### Requirement: Agenda día y semana por técnico

En escritorio (desde 1024 px) la agenda MUST ser una única grilla de tiempo al estilo de Google Calendar, con vista de día y de semana, implementada con CSS Grid propio sin librería de calendario. Los servicios que coinciden en el tiempo MUST mostrarse lado a lado. Los técnicos visibles son los del selector (hasta 10) y se distinguen por color y por nombre o iniciales. La agenda MUST NOT ofrecer vista Mes ni arrastrar y soltar.

#### Scenario: Vista de día

- GIVEN dos técnicos seleccionados con servicios el día elegido
- WHEN el dueño abre la vista de día
- THEN ve una sola grilla de tiempo con los servicios de ambos técnicos, cada uno con su color y sus iniciales

#### Scenario: Servicios simultáneos

- GIVEN dos servicios de técnicos distintos de 10:00 a 11:00
- WHEN se muestra la grilla
- THEN aparecen lado a lado sin taparse

#### Scenario: Diez solapes

- GIVEN 10 servicios simultáneos de 10 técnicos
- WHEN se muestra la grilla
- THEN en la vista de día se ven 5 servicios con ancho propio y aparece "+5 más"

#### Scenario: Vista de semana

- GIVEN servicios durante la semana
- WHEN el dueño cambia a la vista de semana
- THEN ve los siete días con los servicios de los técnicos seleccionados, con el mismo modelo de color y de solapes

#### Scenario: Sin Mes ni arrastre

- GIVEN la barra de herramientas y un servicio en la grilla
- WHEN el dueño busca la vista Mes o intenta arrastrar el servicio
- THEN no hay vista Mes y no ocurre ningún cambio; mover requiere el diálogo de cupos

### Requirement: Diálogos de cita basados en cupos

La interfaz MUST permitir crear, mover y cancelar servicios únicamente eligiendo entre cupos ofrecidos por el sistema, mostrando el técnico asignado y permitiendo la reasignación manual. Al mover, MUST indicar si cambia el técnico. El diálogo de reasignar MUST listar solo los técnicos libres en el horario exacto del servicio, según la capacidad `technicians-free-at-slot`, en lugar de todos los técnicos activos.

#### Scenario: Crear servicio

- GIVEN un cliente y un tipo de servicio seleccionados
- WHEN el dueño abre el diálogo "Nuevo servicio"
- THEN ve solo cupos ofrecidos y no puede escribir un horario libre

#### Scenario: Cancelar con confirmación

- GIVEN un servicio `confirmed`
- WHEN el dueño elige "Cancelar servicio" y confirma
- THEN el servicio desaparece de los cupos ocupados y se muestra como cancelado

#### Scenario: Reasignar solo a técnicos libres

- GIVEN un servicio de 10:00 a 11:00 y solo un técnico distinto del actual libre en ese horario
- WHEN el dueño abre el diálogo de reasignar
- THEN solo ve a ese técnico

#### Scenario: Carrera en la reasignación

- GIVEN el técnico mostrado como libre es ocupado por otro servicio antes de confirmar
- WHEN el dueño confirma
- THEN la API responde `slot_taken` (409) y la interfaz muestra "Cupo ocupado"

### Requirement: Pantallas de configuración

La interfaz MUST permitir gestionar el negocio (zona horaria solo de lectura, buffer de 0 a 240 minutos y hora de envío del seguimiento `followup_send_time`, por defecto 09:00), servicios (incluida la desactivación y reactivación), técnicos (incluida la desactivación y reactivación mediante el flujo de cambio de horario), disponibilidad semanal y días libres. Ante un rechazo por citas afectadas, MUST listar dichas citas y presentar la propuesta de reasignación con las acciones Aceptar y Rechazar, indicando las citas no resueltas.

#### Scenario: Día libre rechazado

- GIVEN un técnico con citas el viernes
- WHEN el dueño intenta registrar el viernes como día libre
- THEN la interfaz lista las citas afectadas y muestra la propuesta de reasignación

#### Scenario: Aceptar propuesta

- GIVEN una propuesta visible
- WHEN el dueño pulsa Aceptar
- THEN la interfaz muestra el resultado y actualiza la lista de citas

#### Scenario: Configurar la hora de envío del seguimiento

- GIVEN la pantalla de configuración del negocio
- WHEN el dueño cambia la hora de envío del seguimiento a 10:30 y guarda
- THEN la interfaz muestra el valor guardado

### Requirement: Clientes y cierre en la interfaz

La interfaz MUST ofrecer creación de clientes con prefijo `+57` por defecto, registro de autorización previa (fecha y medio, con las etiquetas "En persona", "Llamada telefónica", "WhatsApp", "Formulario o documento escrito" y "Otro"), ficha con historial y cierre de citas. El cierre anticipado MUST exigir motivo y una confirmación reforzada. Devolver una cita cerrada a `confirmed` y corregir la fecha de completado MUST estar disponibles; la reapertura MUST exigir confirmación reforzada.

#### Scenario: Prefijo por defecto

- GIVEN el formulario de nuevo cliente
- WHEN se abre
- THEN el campo de teléfono muestra `+57` precargado

#### Scenario: Cierre anticipado

- GIVEN una cita futura
- WHEN el dueño elige Completada
- THEN la interfaz exige motivo y un segundo paso de confirmación antes de enviar

#### Scenario: Reabrir una cita cerrada

- GIVEN una cita `completed` o `no_show`
- WHEN el dueño elige devolverla a Confirmada
- THEN la interfaz exige un segundo paso de confirmación reforzada antes de enviar

### Requirement: Contrato de API tipado

La API MUST publicar un documento OpenAPI y el cliente de la aplicación MUST generarse a partir de él.

#### Scenario: Cliente generado

- GIVEN el documento OpenAPI vigente
- WHEN se ejecuta la generación del cliente
- THEN la aplicación compila usando los tipos generados

### Requirement: Navegación lateral desde 1024 px

Desde 1024 px de ancho la interfaz MUST mostrar una barra lateral oscura (tokens slate) con exactamente 7 secciones en este orden: "Panel de control", "Agenda", "Clientes", "Técnicos", "Tipos de servicio", "Configuración" y, al pie, "Perfil". La barra MUST contraerse a íconos en anchos intermedios (entre 1024 px y el ancho en que el menú completo cabe), sin perder el nombre accesible de cada entrada. La barra MUST NOT incluir entradas para funciones que no existen (Reportes, Exportar, Mes). "Configuración" MUST agrupar los datos del negocio (buffer y hora de envío del seguimiento).

#### Scenario: Siete secciones en orden

- GIVEN un ancho de 1280 px
- WHEN el dueño abre la aplicación
- THEN la barra lateral lista Panel de control, Agenda, Clientes, Técnicos, Tipos de servicio, Configuración y Perfil al pie, en ese orden

#### Scenario: Barra contraída

- GIVEN un ancho intermedio donde la barra está contraída
- WHEN el dueño la mira
- THEN cada entrada muestra su ícono y conserva su nombre accesible

#### Scenario: Sin entradas inexistentes

- GIVEN la barra lateral
- WHEN se revisan sus entradas
- THEN no existe "Reportes", "Exportar" ni "Mes"

### Requirement: Barra inferior bajo 1024 px

Por debajo de 1024 px la interfaz MUST mostrar una barra inferior en lugar de la barra lateral, con cinco entradas en este orden: "Panel" (nombre accesible "Panel de control"), "Agenda", "Clientes", "Técnicos" y "Más". "Más" MUST abrir un menú con "Tipos de servicio" y "Configuración". Perfil MUST NOT figurar en la barra inferior ni en el menú "Más": se abre desde el ícono del encabezado del Panel de control.

#### Scenario: Barra inferior

- GIVEN un ancho de 390 px
- WHEN el dueño abre la aplicación
- THEN ve la barra inferior con Panel, Agenda, Clientes, Técnicos y Más, en ese orden, sin barra lateral

#### Scenario: Menú "Más"

- GIVEN un ancho de 390 px
- WHEN el dueño toca "Más"
- THEN ve "Tipos de servicio" y "Configuración", y al elegir una abre su pantalla con botón para volver

#### Scenario: Perfil ausente

- GIVEN la barra inferior
- WHEN se revisan sus entradas
- THEN no hay una entrada "Perfil"

### Requirement: Entrada por el Panel de control y botón para volver

La ruta `/` MUST abrir el Panel de control en escritorio y en móvil, y MUST NOT redirigir a `/agenda`. Por debajo de 1024 px, cada pantalla a la que se llega desde el Panel de control (incluida la lista de la agenda abierta desde "Servicios pendientes", una ficha de servicio abierta desde "Servicios de hoy" y el Perfil) MUST mostrar un botón para volver, que regresa a la pantalla de origen.

#### Scenario: Raíz

- GIVEN el dueño visita `/` en 1280 px y en 390 px
- WHEN carga la aplicación
- THEN en ambos anchos ve el Panel de control

#### Scenario: Volver desde "Por cerrar"

- GIVEN 390 px y el Panel de control abierto
- WHEN el dueño toca "Servicios pendientes" y luego el botón para volver
- THEN regresa al Panel de control

#### Scenario: Botón de volver en el Perfil

- GIVEN 390 px y el Perfil abierto desde el Panel
- WHEN el dueño toca el botón para volver
- THEN regresa al Panel de control

### Requirement: Vocabulario "servicio" y "Tipos de servicio"

Todo el texto visible de la interfaz MUST usar "servicio" donde antes decía "cita" ("Nuevo servicio", "Servicios pendientes", "Cancelar servicio", "Buscar servicio o cliente") y MUST llamar al catálogo "Tipos de servicio" (nunca solo "Servicios" para el catálogo). La documentación de la aplicación (`app/README.md`) MUST seguir el mismo vocabulario. Una prueba de guarda MUST fallar cuando aparezca la palabra "cita" o "citas" (palabra completa, sin distinguir mayúsculas) en el texto visible: literales de texto y texto JSX de `app/src`, además de `app/index.html` y `app/pwa.config.ts`. Excepciones permitidas: identificadores de código (variables, funciones, tipos, rutas de archivo, rutas y campos de la API como `appointment`), comentarios de código, el archivo generado `schema.d.ts` y las pruebas. Cualquier otra excepción MUST declararse en una lista explícita con archivo, texto y motivo, vacía al empezar. Palabras que contienen "cita" como parte de otra ("necesitas", "solicita") MUST NOT contar como infracción. La prueba de guarda MUST fallar también ante formas comunes de voseo en el texto visible (por ejemplo "tenés", "podés", "querés", "elegí", "hacé", "vos").

#### Scenario: Palabra "cita" en un literal

- GIVEN un componente con el texto visible "Nueva cita"
- WHEN corre la prueba de guarda
- THEN falla indicando el archivo y el literal

#### Scenario: Excepción por identificador

- GIVEN un componente con la variable `appointmentId` y la ruta de API `/appointments`
- WHEN corre la prueba de guarda
- THEN pasa

#### Scenario: Palabras que contienen "cita"

- GIVEN el texto visible "Necesitas internet" y "Solicita un cupo"
- WHEN corre la prueba de guarda
- THEN pasa

#### Scenario: Voseo

- GIVEN un texto visible "Elegí un cupo"
- WHEN corre la prueba de guarda
- THEN falla

#### Scenario: Catálogo

- GIVEN la barra lateral y la pantalla del catálogo
- WHEN el dueño las abre
- THEN el catálogo se llama "Tipos de servicio" en ambas

### Requirement: Identidad visual y accesibilidad

La aplicación MUST llamarse "Schedule App" y usar un color primario azul alrededor de `#2563EB` con neutros slate de los tokens existentes, en tema claro y oscuro. Los colores semánticos de estado MUST acompañarse siempre de texto. Todo par de color de texto sobre fondo nuevo MUST cumplir contraste WCAG AA (al menos 4,5:1 para texto y 3:1 para componentes de interfaz) en tema claro y oscuro, verificado por una prueba de tokens. Los objetivos táctiles interactivos MUST medir al menos 44 px por 44 px.

#### Scenario: Nombre y color primario

- GIVEN la aplicación abierta
- WHEN se revisan el título, la barra lateral y el manifiesto
- THEN el nombre es "Schedule App" y el primario es un azul alrededor de `#2563EB`

#### Scenario: Contraste de los tokens nuevos

- GIVEN los tokens de la barra lateral, de estado y de la paleta de técnicos
- WHEN corre la prueba de tokens
- THEN cada par cumple AA en tema claro y en tema oscuro

#### Scenario: Objetivo táctil

- GIVEN un botón de la barra inferior o de la barra de herramientas
- WHEN se mide su área interactiva
- THEN es de al menos 44 px por 44 px

### Requirement: Barra de herramientas de la agenda

La barra de la agenda MUST ofrecer: alternar Día/Semana (en escritorio), navegación de fechas (anterior y siguiente), el botón "Hoy", el campo "Buscar servicio o cliente" (ver `global-search`) y el botón "Nuevo servicio". Los cuatro indicadores del Panel MUST NOT mostrarse en la agenda.

#### Scenario: Elementos de la barra

- GIVEN la agenda en escritorio
- WHEN el dueño la abre
- THEN ve Día/Semana, navegación de fechas, "Hoy", el campo de búsqueda y "Nuevo servicio"

#### Scenario: Botón "Hoy"

- GIVEN la agenda en un día distinto de hoy
- WHEN el dueño toca "Hoy"
- THEN la agenda muestra el día de hoy en la zona del negocio

### Requirement: Selector de técnicos visibles

En escritorio la agenda MUST ofrecer un selector con una casilla de color por técnico activo para elegir a los técnicos visibles. Se MUST poder elegir como máximo 10; al llegar al tope las demás casillas MUST quedar deshabilitadas con el aviso "Máximo 10 técnicos visibles". El selector MUST listar a los técnicos activos y, además, a los desactivados o eliminados que tengan servicios en el rango visible. Por defecto MUST estar seleccionados los 10 técnicos activos más antiguos (por fecha de alta, desempate por identificador); con menos de 10, todos. La selección MUST recordarse en el navegador (por dispositivo) y sobrevivir a recargar la página. Un técnico recordado que luego se desactivó o eliminó MUST permanecer en la selección mientras tenga servicios en el rango visible, mostrado con su color y marcado como inactivo; MUST salir de la selección cuando no tenga ninguno. Los ids desconocidos MUST descartarse; si queda vacía la selección recordada MUST aplicarse el valor por defecto. Si el dueño desmarca todos, la grilla MUST mostrar "Selecciona al menos un técnico".

#### Scenario: Valor por defecto

- GIVEN 14 técnicos activos y ninguna selección guardada
- WHEN el dueño abre la agenda
- THEN están marcados los 10 más antiguos

#### Scenario: Tope de 10

- GIVEN 10 técnicos marcados
- WHEN el dueño intenta marcar un undécimo
- THEN la casilla está deshabilitada y se muestra "Máximo 10 técnicos visibles"

#### Scenario: Persistencia

- GIVEN el dueño marcó solo a 3 técnicos
- WHEN recarga la página
- THEN siguen marcados esos 3

#### Scenario: Técnico recordado ya inactivo

- GIVEN una selección guardada que incluye a un técnico luego desactivado y que sigue con servicios en el rango visible
- WHEN el dueño abre la agenda
- THEN ese técnico sigue marcado, con su color y la marca de inactivo, y sus servicios se ven

#### Scenario: Técnico recordado inactivo sin servicios

- GIVEN una selección guardada que incluye a un técnico luego desactivado y sin servicios en el rango visible
- WHEN el dueño abre la agenda
- THEN ese técnico sale de la selección y los demás se conservan

### Requirement: Colores y tarjetas de la agenda de escritorio

Cada técnico MUST recibir un color de una paleta fija de 10 colores distinguibles entre sí, la misma para un técnico en todas las vistas. Cada tarjeta de servicio MUST mostrar el nombre o las iniciales del técnico (el color nunca es la única señal) y el estado como etiqueta con ícono y texto, con estas etiquetas, que concuerdan con "servicio" y reemplazan a las anteriores de `appointment-status.ts`: `confirmed` "Confirmado", `pending` "Pendiente", `completed` "Completado", `no_show` "No asistió", `cancelled` "Cancelado". Las casillas del selector MUST mostrar el color del técnico.

#### Scenario: Color estable

- GIVEN un técnico con color asignado
- WHEN se muestran la grilla día, la grilla semana y el selector
- THEN su color es el mismo en las tres

#### Scenario: No solo color

- GIVEN la tarjeta de un servicio
- WHEN se revisa
- THEN incluye las iniciales o el nombre del técnico y el estado con ícono y texto

#### Scenario: Paleta distinguible

- GIVEN la paleta de 10 colores
- WHEN corre la prueba de tokens
- THEN no hay dos colores iguales y, en ambos temas, el texto sobre el fondo de cada color cumple 4,5:1 o más y el color de acento (franja de la tarjeta) cumple 3:1 o más contra la superficie de la tarjeta

### Requirement: Horas visibles derivadas de la disponibilidad

La grilla de escritorio MUST derivar el rango de horas visibles de la disponibilidad semanal de los técnicos seleccionados, restando sus días libres: desde la hora de inicio más temprana hasta la de fin más tardía entre los días visibles, redondeadas a horas completas (el inicio hacia abajo y el fin hacia arriba). Un día libre que cubre el inicio o el final de un turno acorta el rango; un día en que nadie trabaja no aporta horas. Reemplaza la ventana fija 07:00-19:00. Si un servicio visible queda fuera de ese rango, el rango MUST ampliarse para incluirlo, de modo que ningún servicio quede fuera de la vista. La grilla MUST NOT mostrar franja de almuerzo ni sombrear horas no laborables. La disponibilidad de todos los técnicos seleccionados MUST obtenerse con una sola solicitud agregada (`GET /agenda/visible-hours`), no una por técnico; la solicitud MUST limitarse al negocio y a los técnicos pedidos, MUST NOT modificar datos y MUST rechazar con error de validación más de 10 técnicos o un rango de más de 62 días. Cuando ningún día visible tiene disponibilidad y no hay servicios, el rango por defecto MUST ser 07:00-19:00.

#### Scenario: Rango por disponibilidad

- GIVEN dos técnicos seleccionados con horarios de 08:00 a 14:00 y de 10:00 a 18:30
- WHEN el dueño abre la vista de día
- THEN la grilla muestra de 08:00 a 19:00

#### Scenario: Servicio fuera de horario

- GIVEN un servicio de 06:30 a 07:30 y disponibilidad desde las 08:00
- WHEN se muestra el día
- THEN la grilla incluye desde las 06:00 y el servicio es visible

#### Scenario: Una sola solicitud

- GIVEN 10 técnicos seleccionados
- WHEN se cargan las horas visibles
- THEN se hace una única solicitud de disponibilidad agregada

#### Scenario: Sin franja de almuerzo ni sombreado

- GIVEN la grilla de escritorio
- WHEN se revisa
- THEN no hay franja de almuerzo ni sombreado de horas no laborables

#### Scenario: Sin disponibilidad

- GIVEN técnicos seleccionados sin disponibilidad configurada y sin servicios
- WHEN se abre la agenda
- THEN la grilla muestra de 07:00 a 19:00 sin fallar

### Requirement: Desborde "+N más"

Cuando en una franja de la grilla coinciden más servicios de los que caben, la grilla MUST mostrar un botón "+N más" con N igual a los servicios no mostrados. Caben como máximo 6 columnas en la vista de día y 2 en la de semana; cuando se supera ese máximo se muestran las primeras columnas menos una y el botón "+N más" ocupa la última. Al activarlo MUST abrir la vista de lista (la de móvil) filtrada por ese día y esa franja horaria, con un indicador visible del filtro de franja y una forma de regresar a la grilla.

#### Scenario: Botón con conteo

- GIVEN 12 servicios que coinciden en una franja de la vista de día
- WHEN se muestra la grilla
- THEN se ven 5 servicios y aparece "+7 más" en esa franja

#### Scenario: Justo en el máximo

- GIVEN 6 servicios que coinciden en una franja de la vista de día
- WHEN se muestra la grilla
- THEN se ven los 6 servicios y no aparece "+N más"

#### Scenario: Vista de semana

- GIVEN 3 servicios que coinciden en una franja de un día de la vista de semana
- WHEN se muestra la grilla
- THEN se ve 1 servicio y aparece "+2 más"

#### Scenario: Abrir la lista de la franja

- GIVEN el botón "+4 más"
- WHEN el dueño lo activa
- THEN se muestra la lista del día con solo los servicios de esa franja

#### Scenario: Sin desborde

- GIVEN una franja donde caben todos los servicios
- WHEN se muestra la grilla
- THEN no aparece "+N más"

### Requirement: Agenda móvil de un solo día

Por debajo de 1024 px la agenda MUST mostrar un único día a la vez, navegado con anterior, siguiente y "Hoy". La agenda móvil MUST NOT ofrecer vista de semana ni el alternador Día/Semana; el dueño no puede ver una semana en móvil. El alternador Día/Semana MUST existir solo en la grilla de escritorio. La lista filtrada abierta desde "+N más" (franja de un día) y la lista "Por cerrar" abierta desde el Panel de control son listas filtradas independientes y MUST NOT considerarse una vista de semana.

#### Scenario: Sin control de semana

- GIVEN un ancho de 390 px
- WHEN el dueño abre la agenda
- THEN no hay alternador Día/Semana ni vista de semana

#### Scenario: Navegar entre días

- GIVEN la agenda móvil en el 2026-10-24
- WHEN el dueño toca siguiente, luego anterior dos veces y luego "Hoy"
- THEN la lista muestra el 2026-10-25, el 2026-10-23, el 2026-10-22 y por último el día de hoy, un solo día cada vez

#### Scenario: Listas filtradas no son semana

- GIVEN la lista de una franja abierta desde "+N más" y la lista "Por cerrar" abierta desde el Panel
- WHEN el dueño las revisa
- THEN cada una es una lista filtrada con su indicador de filtro y ninguna ofrece el alternador Día/Semana

### Requirement: Agenda móvil como lista cronológica

Por debajo de 1024 px la agenda MUST mostrar el día como una lista cronológica ordenada por hora de inicio, con desempate por técnico. Cada fila MUST mostrar inicio-fin, cliente, tipo de servicio, técnico y estado (texto y color). Los filtros MUST ser chips combinables: técnico, estado, tipo de servicio y "Por cerrar" (servicios `confirmed` con inicio pasado y sin cerrar, de todas las fechas, agrupados por día y con la misma definición de la tarjeta "Servicios pendientes", que se obtienen de `GET /agenda/to-close`); varios chips de una misma categoría (por ejemplo dos técnicos) MUST combinarse con O lógico y los chips de categorías distintas con Y lógico. "Por cerrar" MUST mostrar siempre todas las fechas, también dentro de la agenda. Cuando hay más de 200 servicios por cerrar, la lista MUST mostrar los 200 más antiguos (el más antiguo primero) y el aviso "Mostrando 200 de N", con N igual al total que cuenta la tarjeta. Los servicios `cancelled` MUST estar ocultos por defecto y un interruptor "Mostrar cancelados" MUST mostrarlos; seleccionar el chip de estado "Cancelado" MUST mostrar los cancelados aunque el interruptor esté apagado. Con ningún resultado MUST mostrarse "No hay servicios para estos filtros".

#### Scenario: Orden y desempate

- GIVEN dos servicios a las 09:00 de los técnicos "Beto" y "Ana" y uno a las 08:00
- WHEN se muestra la lista
- THEN el orden es 08:00, 09:00 Ana, 09:00 Beto

#### Scenario: Contenido de la fila

- GIVEN un servicio de 09:00 a 10:00
- WHEN se muestra la fila
- THEN muestra "09:00-10:00", el cliente, el tipo de servicio, el técnico y el estado como texto con color

#### Scenario: Chips combinados

- GIVEN servicios de dos técnicos y de dos estados
- WHEN el dueño activa el chip de un técnico y el de estado "Confirmado"
- THEN la lista muestra solo los servicios de ese técnico en ese estado

#### Scenario: Varios chips de la misma categoría

- GIVEN servicios de los técnicos "Ana", "Beto" y "Carla"
- WHEN el dueño activa los chips de "Ana" y de "Beto"
- THEN la lista muestra los servicios de Ana y de Beto, no los de Carla

#### Scenario: Chip "Cancelado" con el interruptor apagado

- GIVEN un servicio `cancelled` y uno `confirmed` en el día, y "Mostrar cancelados" apagado
- WHEN el dueño activa el chip de estado "Cancelado"
- THEN la lista muestra el servicio cancelado

#### Scenario: Por cerrar

- GIVEN un `confirmed` con inicio pasado de hace 3 días, un `pending` con inicio pasado y un `confirmed` futuro
- WHEN el dueño activa "Por cerrar"
- THEN la lista muestra solo el `confirmed` pasado, agrupado en su día

#### Scenario: Por cerrar ignora el día navegado

- GIVEN la agenda en el 2026-10-24 y un `confirmed` pasado del 2026-10-10
- WHEN el dueño activa "Por cerrar"
- THEN la lista muestra el servicio del 2026-10-10

#### Scenario: Más de 200 por cerrar

- GIVEN 340 servicios `confirmed` por cerrar
- WHEN el dueño abre "Por cerrar"
- THEN la lista muestra 200 servicios, el más antiguo primero, y el aviso "Mostrando 200 de 340"

#### Scenario: Cancelados ocultos

- GIVEN un servicio `cancelled` y uno `confirmed` en el día
- WHEN se muestra la lista y luego se activa "Mostrar cancelados"
- THEN al inicio solo aparece el `confirmed` y tras activar el interruptor aparecen ambos

### Requirement: Abrir un servicio por parámetro de URL

La agenda MUST poder abrir la ficha de un servicio indicando su identificador en el parámetro de URL `appointment` (`/agenda?view=day&date=YYYY-MM-DD&appointment=<id>`), junto con el día. Si el servicio no está en el rango cargado, la agenda MUST consultarlo por su identificador (`GET /appointments/:id`). Al cargar con ese parámetro, la agenda MUST mostrar el día del servicio y abrir su ficha. Si el servicio no existe o es de otro negocio, MUST mostrar "No se encontró el servicio" sin abrir ninguna ficha. Cerrar la ficha MUST quitar el parámetro de la URL.

#### Scenario: Abrir por enlace

- GIVEN un servicio del 2026-11-03
- WHEN el dueño abre la URL de la agenda con ese identificador
- THEN la agenda muestra el 2026-11-03 con la ficha abierta

#### Scenario: Identificador inexistente

- GIVEN un identificador que no existe
- WHEN se abre la URL
- THEN se muestra "No se encontró el servicio" y ninguna ficha

#### Scenario: Cerrar la ficha

- GIVEN la ficha abierta por URL
- WHEN el dueño la cierra
- THEN el parámetro desaparece de la URL

### Requirement: Cliente anonimizado en las respuestas y en la interfaz de servicios

`openspec/specs/appointment-management` no define la forma del cliente en las respuestas de servicios, por eso este requisito se agrega aquí. Las respuestas de la API que describen un servicio (`GET /appointments`, `GET /appointments/:id`, las acciones sobre servicios y `GET /agenda/to-close`) MUST devolver `customer.name` en `null` y el alias en `customer.alias` cuando el cliente está anonimizado (`anonymized_at` no nulo). Para los demás clientes MUST seguir devolviendo el nombre en `customer.name`. Los demás campos de la respuesta MUST NOT cambiar. La interfaz MUST mostrar "Cliente eliminado (alias)" con el formateador compartido de `shared/lib/people` (`customerLabel`, base de `customerRecordLabel`) en todo lugar donde muestre el nombre de un cliente proveniente de respuestas de servicios: grilla y lista de la agenda, resultados de búsqueda, "Servicios de hoy" del Panel, ficha del servicio y diálogos. Con alias nulo MUST mostrar "Cliente eliminado".

#### Scenario: Respuesta de la API

- GIVEN un servicio de un cliente anonimizado con alias `bear_1`
- WHEN se consulta `GET /appointments/:id`
- THEN `customer.name` es `null` y `customer.alias` es `bear_1`

#### Scenario: Cliente no anonimizado sin cambios

- GIVEN un servicio de la cliente "María Pérez" no anonimizada
- WHEN se consulta `GET /appointments/:id`
- THEN `customer.name` es "María Pérez"

#### Scenario: Agenda

- GIVEN un servicio de un cliente anonimizado con alias `bear_1` en la grilla de escritorio y en la lista móvil
- WHEN el dueño abre la agenda
- THEN la tarjeta y la fila muestran "Cliente eliminado (bear_1)"

#### Scenario: Resultados de búsqueda

- GIVEN un servicio de un cliente anonimizado con alias `bear_1` entre los resultados de la búsqueda global
- WHEN el dueño ve el desplegable
- THEN la fila muestra "Cliente eliminado (bear_1)"

#### Scenario: Lista del Panel

- GIVEN un servicio de hoy de un cliente anonimizado con alias `bear_1`
- WHEN el dueño abre el Panel de control
- THEN la fila de "Servicios de hoy" muestra "Cliente eliminado (bear_1)"

#### Scenario: Ficha y diálogos

- GIVEN la ficha de un servicio de un cliente anonimizado con alias `bear_1`
- WHEN el dueño abre la ficha y el diálogo de cancelar
- THEN ambos muestran "Cliente eliminado (bear_1)"

## Open questions

Ninguna. Fuera de alcance: la futura agenda en caché de solo lectura deberá advertir que las citas pueden haber cambiado porque no hay conexión para validar reajustes.
