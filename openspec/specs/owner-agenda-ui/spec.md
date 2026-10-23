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

Todo el texto visible MUST estar en español neutro con tuteo (sin voseo), incluidos etiquetas, errores y confirmaciones.

#### Scenario: Error de cupo ocupado

- GIVEN el dueño confirma un cupo que otro ocupó
- WHEN la API devuelve `slot_taken` (409)
- THEN la interfaz muestra "Cupo ocupado" en español y ofrece elegir otro cupo

### Requirement: Agenda día y semana por técnico

La agenda MUST ofrecer vista de día y de semana, con una columna por técnico, implementada con CSS Grid propio en un único componente encapsulado. La agenda MUST NOT ofrecer arrastrar y soltar.

#### Scenario: Vista de día

- GIVEN dos técnicos activos con citas el día seleccionado
- WHEN el dueño abre la vista de día
- THEN ve dos columnas con las citas de cada técnico en su horario

#### Scenario: Vista de semana

- GIVEN citas durante la semana
- WHEN el dueño cambia a la vista de semana
- THEN ve los siete días con las citas agrupadas por técnico

#### Scenario: Sin arrastre

- GIVEN una cita en la agenda
- WHEN el usuario intenta arrastrarla
- THEN no ocurre ningún cambio; mover requiere el diálogo de cupos

### Requirement: Diálogos de cita basados en cupos

La interfaz MUST permitir crear, mover y cancelar citas únicamente eligiendo entre cupos ofrecidos por el sistema, mostrando el técnico asignado y permitiendo la reasignación manual. Al mover, MUST indicar si cambia el técnico.

#### Scenario: Crear cita

- GIVEN un cliente y un servicio seleccionados
- WHEN el dueño abre el diálogo de nueva cita
- THEN ve solo cupos ofrecidos y no puede escribir un horario libre

#### Scenario: Cancelar con confirmación

- GIVEN una cita `confirmed`
- WHEN el dueño elige Cancelar y confirma
- THEN la cita desaparece de los cupos ocupados y se muestra como cancelada

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

## Open questions

Ninguna. Fuera de alcance: la futura agenda en caché de solo lectura deberá advertir que las citas pueden haber cambiado porque no hay conexión para validar reajustes.
