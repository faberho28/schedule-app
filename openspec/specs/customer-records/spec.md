# Delta for customer-records

## ADDED Requirements

### Requirement: Creación manual de clientes con teléfono E.164

El sistema MUST permitir al dueño crear clientes con teléfono obligatorio, normalizado a formato E.164 por el DTO de la API (con `libphonenumber-js` o equivalente) y único por negocio. La interfaz MUST precargar el prefijo `+57` y la API MUST asumir `+57` como respaldo cuando el número llegue sin código de país. Un teléfono duplicado dentro del negocio MUST responder 409. El cliente MUST nacer con consentimiento `pending` (pendiente).

#### Scenario: Teléfono sin código de país

- GIVEN el formulario de cliente
- WHEN el dueño ingresa "300 123 4567"
- THEN el sistema guarda `+573001234567` y el consentimiento queda pendiente

#### Scenario: Teléfono inválido

- GIVEN el formulario de cliente
- WHEN el dueño ingresa "abc" o lo deja vacío
- THEN el sistema rechaza el envío con un error de validación

#### Scenario: Teléfono duplicado

- GIVEN un cliente con `+573001234567` en el negocio
- WHEN el dueño crea otro con el mismo número
- THEN la API responde 409 indicando que ya existe

### Requirement: Supresión de clientes mediante anonimización en sitio

El sistema MUST ejecutar la supresión de un cliente (`DELETE /customers/:id`) como una anonimización en sitio, no como un borrado en cascada. El `id` del cliente y todo su historial (citas, cierres, seguimientos, eventos de consentimiento y servicios prestados) MUST conservarse. Todo dato personal MUST reemplazarse por valores neutros y aleatorios: el nombre por un alias aleatorio único por negocio (mostrado como "Cliente eliminado (bear_1)"), el teléfono por un marcador único aleatorio de formato reservado no marcable que nunca coincida con un número E.164 real, y la dirección, las notas y la dirección copiada (`address_snapshot`) de todas sus citas, así como los textos libres de motivos y notas que puedan contener datos personales, por nulos o texto neutro. El cliente MUST quedar marcado como anonimizado, excluido de la mensajería y sin seguimientos `pending`. La operación MUST ejecutarse en una sola transacción y MUST ser idempotente. En el sprint 1 el sistema MUST NOT persistir ningún vínculo entre la persona original y el alias. El registro de supresiones (hash con clave HMAC del teléfono original) y su comprobación tras restaurar respaldos son deuda técnica fuera del sprint 1 y se implementan al final del proyecto. Es el mismo mecanismo que el alias de técnico eliminado (ver `technician-schedules`).

#### Scenario: Anonimizar cliente con historial

- GIVEN un cliente con citas completadas, una dirección copiada en cada cita y un seguimiento `pending`
- WHEN el dueño lo elimina
- THEN el cliente conserva su `id` y sus citas, su nombre pasa a un alias como "Cliente eliminado (bear_1)", su teléfono, dirección, notas y direcciones copiadas desaparecen y el seguimiento queda anulado

#### Scenario: Teléfono marcador único

- GIVEN dos clientes del mismo negocio anonimizados
- WHEN se comparan sus teléfonos
- THEN ambos son marcadores aleatorios distintos que no son números E.164 válidos

#### Scenario: Operación idempotente

- GIVEN un cliente ya anonimizado
- WHEN se repite la eliminación
- THEN no cambia ningún dato y la operación responde éxito

#### Scenario: Reaparición tras la supresión

- GIVEN una persona anonimizada que vuelve a escribir desde el mismo teléfono
- WHEN se registra
- THEN se trata como un cliente nuevo con consentimiento `pending` y sin vínculo con el cliente anonimizado

#### Scenario: Cliente anonimizado excluido

- GIVEN un cliente anonimizado
- WHEN el dueño intenta crearle una cita o registrarle consentimiento
- THEN el sistema rechaza la operación

El riesgo residual de reidentificación por combinaciones raras de fechas y servicios se acepta una vez eliminados nombres y direcciones.

### Requirement: Un cliente con citas futuras activas no se puede suprimir

El sistema MUST rechazar la supresión (`DELETE /customers/:id`) de un cliente que tenga citas `pending` o `confirmed` que empiezan desde ahora. La solicitud MUST responder 409 con el código `customer_has_future_appointments` e incluir `affected` (las citas, con la misma forma que en `schedule_conflict`) como miembro de primer nivel del problema. Cuando se rechaza, el sistema MUST NOT modificar ningún dato: ni la ficha, ni las direcciones copiadas, ni los seguimientos pendientes. El dueño MUST cancelar esas citas primero; el sistema MUST NOT cancelarlas automáticamente. La comprobación MUST ejecutarse en la misma transacción y bajo el mismo bloqueo del negocio que la anonimización, de modo que una reserva concurrente no pueda dejar una cita futura activa en un cliente anonimizado. Las citas canceladas, completadas, `no_show` o pasadas MUST NOT bloquear la supresión.

#### Scenario: Supresión bloqueada por citas futuras

- GIVEN un cliente con una cita `confirmed` y otra `pending` que empiezan desde ahora, y un seguimiento `pending`
- WHEN el dueño intenta eliminarlo
- THEN la API responde 409 `customer_has_future_appointments` con las dos citas en `affected`, y la ficha, las direcciones copiadas, los seguimientos y el estado de las citas permanecen sin cambios

#### Scenario: Supresión permitida tras cancelar

- GIVEN un cliente cuya eliminación fue rechazada por citas futuras
- WHEN el dueño cancela esas citas y repite la eliminación
- THEN el cliente queda anonimizado como en el escenario de anonimización

#### Scenario: Citas que no bloquean

- GIVEN un cliente con citas canceladas, completadas, `no_show` o que empezaron antes de ahora
- WHEN el dueño lo elimina
- THEN la eliminación se completa

#### Scenario: Cliente ya anonimizado con citas futuras

- GIVEN un cliente ya anonimizado
- WHEN se repite la eliminación
- THEN responde éxito sin revisar citas ni cambiar datos

#### Scenario: Reserva concurrente con la eliminación

- GIVEN una reserva para un cliente y su eliminación que llegan al mismo tiempo
- WHEN el sistema las serializa bajo el bloqueo del negocio
- THEN o la reserva gana y la eliminación se rechaza, o la eliminación gana y la reserva recibe `customer_anonymized`; nunca queda una cita futura activa en un cliente anonimizado

### Requirement: Autorización previa registrada por el dueño

El sistema MUST permitir al dueño registrar una autorización de tratamiento de datos previamente obtenida (Ley 1581 de 2012), con fecha y medio obligatorios. El medio MUST ser uno de los valores `in_person`, `phone_call`, `whatsapp`, `written` u `other`; la interfaz los muestra como "En persona", "Llamada telefónica", "WhatsApp", "Formulario o documento escrito" y "Otro". El registro MUST conservar un rastro de auditoría (quién, cuándo se registró, fecha y medio declarados) que MUST NOT poder sobrescribirse silenciosamente.

#### Scenario: Registrar autorización

- GIVEN un cliente con consentimiento pendiente
- WHEN el dueño registra autorización con fecha 2026-10-15 y medio `in_person` ("En persona")
- THEN el consentimiento pasa a otorgado y se guarda un registro de auditoría con esos datos

#### Scenario: Datos incompletos

- GIVEN un cliente con consentimiento pendiente
- WHEN el dueño intenta registrar autorización sin medio
- THEN el sistema rechaza el registro y el consentimiento sigue pendiente

#### Scenario: Auditoría consultable

- GIVEN un cliente con autorización registrada
- WHEN el dueño abre su ficha
- THEN ve la fecha, el medio y el registro de auditoría del consentimiento

### Requirement: Dirección guardada del cliente

La ficha del cliente MUST conservar su última dirección guardada, que la PWA precarga al crear una cita (la dirección de la cita es siempre obligatoria; ver `appointment-management`). Al crear una cita con una dirección editada, el sistema MUST actualizar la dirección guardada del cliente.

#### Scenario: Dirección actualizada al agendar

- GIVEN un cliente con dirección guardada "Calle 10 # 5-20"
- WHEN el dueño crea una cita con la dirección "Carrera 7 # 1-1"
- THEN la cita guarda "Carrera 7 # 1-1" y la ficha del cliente pasa a esa dirección

### Requirement: Efecto de la revocación del consentimiento

Al revocarse el consentimiento de un cliente, el sistema MUST cancelar de inmediato sus seguimientos pendientes en `scheduled_messages` (`cancel_reason='consent_revoked'`) y MUST conservar su ficha, citas e historial: revocar mensajes no es una solicitud de supresión. Si el cliente consiente de nuevo, MUST aplicarse la revisión de historial de consentimiento tardío.

#### Scenario: Revocación con seguimiento pendiente

- GIVEN un cliente con consentimiento otorgado y un seguimiento `pending`
- WHEN se registra la revocación
- THEN el seguimiento pasa a `cancelled` con `cancel_reason='consent_revoked'` y la ficha y las citas permanecen

#### Scenario: Nuevo consentimiento tras revocar

- GIVEN un cliente que revocó y luego vuelve a consentir
- WHEN se registra el nuevo consentimiento
- THEN se aplican las reglas de revisión de historial de consentimiento tardío

### Requirement: Sin mensajes programados sin consentimiento

El sistema MUST NOT crear filas en `scheduled_messages` para clientes cuyo consentimiento no esté otorgado.

#### Scenario: Cliente sin consentimiento

- GIVEN un cliente con consentimiento pendiente y una cita completada de un servicio con intervalo
- WHEN la cita se cierra
- THEN no se crea ninguna fila en `scheduled_messages`

### Requirement: Revisión de historial al registrar consentimiento tardío

Al registrarse el consentimiento de un cliente con historial, el sistema MUST revisar su historial y considerar únicamente la última cita `completed` de cada servicio con intervalo de seguimiento. Para cada una, MUST crear un seguimiento con fecha igual a la fecha de completado más el intervalo, salvo que esa fecha ya haya pasado, o que el cliente tenga una cita futura activa de ese servicio o un seguimiento pendiente de ese servicio. La operación MUST ser idempotente mediante una restricción de unicidad en la base de datos.

#### Scenario: Seguimiento creado por consentimiento tardío

- GIVEN una cita completada hace 30 días de un servicio con intervalo de 180 días, sin cita futura ni seguimiento pendiente
- WHEN el dueño registra el consentimiento
- THEN se crea un seguimiento con fecha igual a completado más 180 días

#### Scenario: Fecha ya pasada

- GIVEN la última cita completada de un servicio de intervalo 90 días ocurrida hace 120 días
- WHEN el dueño registra el consentimiento
- THEN no se crea seguimiento para ese servicio

#### Scenario: Cita futura o seguimiento pendiente existente

- GIVEN el cliente con una cita futura `confirmed` del mismo servicio
- WHEN el dueño registra el consentimiento
- THEN no se crea seguimiento para ese servicio

#### Scenario: Solo la última cita por servicio

- GIVEN tres citas completadas del mismo servicio
- WHEN el dueño registra el consentimiento
- THEN se evalúa únicamente la más reciente y se crea como máximo un seguimiento

#### Scenario: Idempotencia

- GIVEN el seguimiento ya creado por la revisión
- WHEN la revisión se ejecuta de nuevo (por ejemplo, por reintento)
- THEN no se crea una segunda fila

### Requirement: Historial de servicios del cliente

El sistema MUST mostrar en la ficha del cliente el historial de sus citas (servicio, fecha, técnico, estado, precio y dirección copiados), ordenado por fecha descendente.

#### Scenario: Ficha con historial

- GIVEN un cliente con una cita `completed` y una `cancelled`
- WHEN el dueño abre su ficha
- THEN ve ambas citas con su estado, de la más reciente a la más antigua

### Requirement: Búsqueda de clientes sin distinguir acentos ni mayúsculas

`GET /customers?search=` MUST filtrar los clientes por nombre o teléfono sin distinguir acentos ni mayúsculas y minúsculas, en ambos sentidos ("maria" encuentra "María" y "MARÍA" encuentra "Maria"). La búsqueda por teléfono MUST ignorar espacios y guiones del texto. Los caracteres `%`, `_` y `\` MUST tratarse como texto literal. Los clientes anonimizados MUST seguir ocultos por defecto. La consulta MUST limitarse al negocio actual. La pantalla Clientes y el selector de cliente del diálogo "Nuevo servicio" MUST usar este comportamiento.

#### Scenario: Sin acento encuentra con acento

- GIVEN el cliente "María Gómez"
- WHEN se consulta `GET /customers?search=maria`
- THEN la respuesta incluye a "María Gómez"

#### Scenario: Con acento y mayúsculas encuentra sin acento

- GIVEN el cliente "Maria Gomez"
- WHEN se consulta `GET /customers?search=MARÍA`
- THEN la respuesta incluye a "Maria Gomez"

#### Scenario: Teléfono con espacios

- GIVEN un cliente con teléfono `+573001234567`
- WHEN se consulta con `300 123`
- THEN la respuesta incluye al cliente

#### Scenario: Anonimizados ocultos

- GIVEN un cliente anonimizado con el alias `bear_1` (se muestra como "Cliente eliminado (bear_1)")
- WHEN se consulta con `bear` o con `eliminado`
- THEN la respuesta no incluye al cliente

#### Scenario: Comodines literales

- GIVEN clientes "Ana" y "100%Ana"
- WHEN se consulta con `%a`
- THEN solo se evalúa el texto literal y "Ana" no coincide

#### Scenario: Aislamiento por negocio

- GIVEN un cliente de otro negocio llamado "María"
- WHEN se consulta con `maria`
- THEN la respuesta no incluye ese cliente

#### Scenario: Pantalla Clientes y selector

- GIVEN el cliente "María Gómez"
- WHEN el dueño escribe "maria" en la pantalla Clientes y en el selector de cliente de "Nuevo servicio"
- THEN ambos listan a "María Gómez"

## Open questions

Ninguna.
