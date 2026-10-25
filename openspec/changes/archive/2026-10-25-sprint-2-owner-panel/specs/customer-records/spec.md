# Delta for customer-records

## ADDED Requirements

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
