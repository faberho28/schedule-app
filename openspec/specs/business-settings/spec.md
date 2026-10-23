# Delta for business-settings

## ADDED Requirements

### Requirement: Negocio sembrado y modelo multinegocio

El modelo de datos MUST soportar varios negocios (`businesses`), pero el sprint 1 MUST sembrar un único negocio por defecto, que es el que resuelve la API hasta que exista autenticación. Todas las tablas del dominio MUST llevar `business_id` y toda consulta MUST filtrar por él.

#### Scenario: Negocio disponible tras la siembra

- GIVEN una base de datos recién migrada y sembrada
- WHEN el dueño consulta la configuración del negocio
- THEN el sistema devuelve el negocio sembrado con zona horaria `America/Bogota`

#### Scenario: Aislamiento por negocio

- GIVEN registros de dos negocios distintos en la base de datos
- WHEN se listan servicios o técnicos del negocio A
- THEN el resultado no contiene registros del negocio B

### Requirement: Zona horaria del negocio

El sistema MUST almacenar una única zona horaria por negocio como identificador IANA, con valor por defecto `America/Bogota`, que se fija al crear el negocio y MUST NOT ser editable en el sprint 1. Cupos, recordatorios, seguimientos y visualización MUST usar esa zona para todas las personas; los clientes no tienen zona horaria propia. Todos los instantes MUST persistirse como `timestamptz` y MUST convertirse a la zona del negocio en un único punto del sistema.

#### Scenario: Zona horaria fijada al crear el negocio

- GIVEN un negocio creado con zona `America/Bogota`
- WHEN el dueño abre la configuración del negocio
- THEN ve la zona horaria como valor de solo lectura

#### Scenario: Intento de cambiar la zona horaria

- GIVEN un negocio ya creado
- WHEN se envía a la API un cambio de zona horaria, por ejemplo a `America/Mexico_City`
- THEN el sistema rechaza el cambio y conserva la zona original

#### Scenario: Zona horaria inválida al crear

- GIVEN la creación (siembra) de un negocio
- WHEN se indica el identificador `Mars/Olympus`
- THEN el sistema rechaza el valor con un error de validación

### Requirement: Buffer de desplazamiento por negocio

El sistema MUST permitir configurar un buffer de desplazamiento en minutos enteros entre 0 y 240 (ambos inclusive) por negocio, con valor por defecto 0. El buffer MUST aplicarse entre citas del mismo técnico (ver `slot-availability`). La cita MUST guardar una copia (`buffer_min`) del buffer vigente al crearla y al moverla.

#### Scenario: Guardar buffer

- GIVEN un negocio sin buffer configurado explícitamente
- WHEN el dueño establece el buffer en 20 minutos
- THEN el sistema guarda 20 y los cupos posteriores usan 20 minutos

#### Scenario: Buffer negativo o no entero

- GIVEN el formulario de configuración del negocio
- WHEN el dueño envía un buffer de -5, de 7,5 o de 241
- THEN el sistema rechaza el valor con un error de validación

#### Scenario: El cambio de buffer no altera citas existentes

- GIVEN una cita ya creada con buffer de 15 minutos
- WHEN el dueño cambia el buffer a 30 minutos
- THEN la cita existente conserva su horario y los cupos nuevos se calculan con 30 minutos

### Requirement: Hora de envío del seguimiento

El sistema MUST permitir configurar por negocio la hora de envío del seguimiento (`followup_send_time`, formato `HH:MM`, por defecto `09:00`). La fecha y hora del seguimiento MUST calcularse en la zona horaria del negocio. La pantalla de configuración del negocio MUST permitir ver y editar este valor.

#### Scenario: Valor por defecto

- GIVEN un negocio que no ha configurado la hora de envío
- WHEN el dueño abre la configuración del negocio
- THEN ve `09:00` como hora de envío del seguimiento

#### Scenario: Cambiar la hora de envío

- GIVEN un negocio con hora de envío `09:00`
- WHEN el dueño la cambia a `10:30`
- THEN la configuración queda guardada y los seguimientos que se programen después usan `10:30` hora local del negocio

#### Scenario: Hora de envío inválida

- GIVEN el formulario de configuración del negocio
- WHEN el dueño envía "25:61" o "9am"
- THEN el sistema rechaza el valor con un error de validación y conserva la hora anterior

## Open questions

Ninguna. Resueltas: el buffer por defecto es 0 y su rango es 0 a 240; un cambio de buffer no modifica citas existentes (cada cita conserva su copia).
