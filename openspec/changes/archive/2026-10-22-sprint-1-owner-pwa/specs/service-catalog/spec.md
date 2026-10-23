# Delta for service-catalog

## ADDED Requirements

### Requirement: Alta y edición de servicios

El sistema MUST permitir al dueño crear y editar servicios con `name` (obligatorio), `duration_min` (entero mayor que 0), `price` (decimal mayor o igual a 0) y `followup_interval_days` (opcional; entero mayor que 0 o ausente).

#### Scenario: Crear servicio con seguimiento

- GIVEN el catálogo vacío
- WHEN el dueño crea "Mantenimiento de aire" con 90 minutos, precio 120000 e intervalo de seguimiento 180
- THEN el servicio queda guardado y aparece en el listado

#### Scenario: Servicio sin seguimiento

- GIVEN el formulario de servicio
- WHEN el dueño crea un servicio sin `followup_interval_days`
- THEN el servicio queda guardado y no genera seguimientos al completarse sus citas

#### Scenario: Datos inválidos

- GIVEN el formulario de servicio
- WHEN el dueño envía duración 0, nombre vacío o precio negativo
- THEN el sistema rechaza el envío con errores de validación por campo

### Requirement: Cambios de servicio no alteran citas existentes

El sistema MUST NOT modificar el precio ni la duración ya registrados en citas existentes cuando se edita un servicio.

#### Scenario: Cambio de precio

- GIVEN una cita creada con precio 100000
- WHEN el dueño cambia el precio del servicio a 130000
- THEN la cita existente conserva 100000 y las citas nuevas usan 130000

### Requirement: Retiro de servicios

El sistema MUST permitir dejar de ofrecer un servicio mediante desactivación (`active = false`) y, de forma reservada, mediante borrado lógico (`deleted_at`). Los servicios MUST NOT eliminarse físicamente y el sistema MUST NOT exponer un endpoint `DELETE` de servicios. Un servicio desactivado no se ofrece para citas nuevas, y las filas con borrado lógico se ocultan de los listados por defecto; en ambos casos el historial de citas se conserva intacto. El dueño MUST poder reactivar un servicio desactivado.

#### Scenario: Desactivar servicio con historial

- GIVEN un servicio con citas completadas
- WHEN el dueño lo desactiva
- THEN el servicio deja de aparecer al crear citas y las citas históricas lo siguen mostrando

#### Scenario: Reactivar servicio

- GIVEN un servicio desactivado
- WHEN el dueño lo reactiva
- THEN el servicio vuelve a ofrecerse para citas nuevas

#### Scenario: Servicio con borrado lógico oculto

- GIVEN un servicio con `deleted_at` establecido
- WHEN el dueño consulta el listado de servicios con los filtros por defecto
- THEN el servicio no aparece y sus citas históricas siguen mostrando el nombre copiado

### Requirement: Advertencia informativa al cambiar la duración

Al guardar un cambio de `duration_min`, el sistema MUST mostrar una advertencia informativa con el número de citas futuras (no canceladas ni cerradas) del servicio que conservan la duración anterior. La advertencia MUST NOT bloquear el cambio. El sistema MUST NOT modificar nunca las citas existentes, y las citas nuevas MUST usar la duración nueva.

#### Scenario: Cambio de duración con citas futuras

- GIVEN un servicio de 60 minutos con 5 citas futuras
- WHEN el dueño cambia la duración a 90 minutos y guarda
- THEN el cambio se guarda, la interfaz muestra "Hay 5 citas futuras que conservan la duración anterior" y las 5 citas conservan 60 minutos

#### Scenario: Cambio de duración sin citas futuras

- GIVEN un servicio sin citas futuras
- WHEN el dueño cambia la duración y guarda
- THEN el cambio se guarda sin advertencia y las citas nuevas usan la duración nueva

## Open questions

Ninguna.
