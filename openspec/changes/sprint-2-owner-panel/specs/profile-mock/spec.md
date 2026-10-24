# Delta for profile-mock

Capacidad nueva: pantalla de Perfil simulada, sin autenticación real. Es temporal y se registra como deuda de la fase de autenticación.

## ADDED Requirements

### Requirement: Pantalla de Perfil simulada

La interfaz MUST ofrecer una pantalla de Perfil con datos genéricos simulados (por ejemplo el nombre "Dueño del negocio") y un aviso visible que indique que no es un usuario real (por ejemplo "Perfil de demostración. Aún no hay inicio de sesión."). La pantalla MUST NOT incluir botón de cierre de sesión. En escritorio el Perfil MUST abrirse desde la entrada "Perfil" al pie de la barra lateral. En pantallas menores a 1024 px MUST abrirse desde un ícono accesible en el encabezado del Panel de control, NOT desde la barra inferior, y MUST tener un botón para volver al Panel.

#### Scenario: Contenido y aviso

- GIVEN el dueño abre el Perfil
- WHEN se muestra la pantalla
- THEN ve el nombre genérico, el aviso de que no es un usuario real y ningún botón de cierre de sesión

#### Scenario: Acceso en móvil

- GIVEN un ancho menor a 1024 px y el Panel de control abierto
- WHEN el dueño toca el ícono de Perfil del encabezado
- THEN se abre el Perfil con un botón para volver, y la barra inferior no tiene entrada de Perfil

#### Scenario: Volver

- GIVEN el Perfil abierto desde el Panel en móvil
- WHEN el dueño toca el botón para volver
- THEN regresa al Panel de control

#### Scenario: Acceso en escritorio

- GIVEN un ancho de 1024 px o más
- WHEN el dueño toca "Perfil" al pie de la barra lateral
- THEN se abre el Perfil

### Requirement: Datos simulados aislados en un solo archivo

Los datos simulados MUST vivir en un único archivo marcado explícitamente como mock (nombre `profile.mock.ts` y un comentario de encabezado con `MOCK`). Ningún módulo fuera de la funcionalidad de Perfil MUST importar ese archivo.

#### Scenario: Importación permitida

- GIVEN el archivo de mock
- WHEN la prueba de guarda recorre los imports de `app/src`
- THEN solo los módulos de la funcionalidad de Perfil lo importan y la prueba pasa

#### Scenario: Importación fuera del Perfil

- GIVEN un módulo de otra funcionalidad que importa el mock
- WHEN corre la prueba de guarda
- THEN la prueba falla indicando el archivo infractor

### Requirement: Salvaguardas contra su llegada a producción

El proyecto MUST incluir una prueba de guarda automática (`profile-mock.guard.test.ts`) que falle si cualquier archivo fuera de `app/src/features/profile/` importa `profile.mock`, o si el archivo del mock pierde su marcador `MOCK` en el encabezado. No se usa una bandera de compilación de producción, para que `npm run build` siga pasando; mientras no exista un pipeline de despliegue, la garantía de que el mock no llega a producción es esta guarda más la deuda registrada. Cuando exista un pipeline de publicación, se agrega allí una verificación que falle si el archivo existe. La deuda MUST registrarse en `debts.md` del cambio como tarea de la fase de autenticación: sustituir el Perfil simulado por el usuario real y retirar el mock y la guarda.

#### Scenario: Marcador del mock

- GIVEN el archivo del mock sin el marcador `MOCK` en su encabezado
- WHEN corre la prueba de guarda
- THEN falla con un mensaje que nombra el archivo

#### Scenario: Construcción de desarrollo

- GIVEN el mock importado solo desde `features/profile/`
- WHEN corre `npm run build`
- THEN la construcción pasa

#### Scenario: Deuda registrada

- GIVEN `debts.md` del cambio
- WHEN se revisa
- THEN contiene una entrada del Perfil simulado asignada a la fase de autenticación

## Open questions

Ninguna. La ruta del Perfil es `/profile` y la salvaguarda es la prueba de guarda descrita arriba (diseño D22).
