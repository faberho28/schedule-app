# Deudas del cambio sprint-2-owner-panel

Cada entrada indica qué queda pendiente, por qué y en qué fase se resuelve. Revisión final al cierre de la implementación (tarea 16.4).

## Perfil simulado

- **Qué**: `app/src/features/profile/profile.mock.ts` entrega un Perfil de demostración ("Dueño del negocio") sin usuario real ni cierre de sesión.
- **Fase**: autenticación.
- **Qué hacer**: reemplazar `profile.mock.ts` por el usuario autenticado, retirar el mock y la guarda (`profile-mock.guard.test.ts`) y agregar una verificación en el pipeline de publicación cuando exista.
- **Riesgo**: nunca publicar a producción antes de contar con un inicio de sesión completo.

## Deudas aceptadas por el diseño

- **Clave de `localStorage` sin id de negocio**: la preferencia guardada (`schedule-app.agenda.technicians`) no distingue negocios. Aceptable mientras haya un solo negocio por dispositivo. Fase: autenticación o multinegocio.
- **`pending` fuera de "Servicios pendientes" (R11)**: los servicios en estado `pending` no se cuentan en esa tarjeta ni en "Por cerrar". Fase: sprint del bot, cuando haya servicios que nacen `pending`.
- **Índice trigram de `appointments`**: la búsqueda de servicios no tiene índice trigram sobre sus columnas. Fase: evaluarlo si un negocio supera unas 50.000 servicios.

## Deudas encontradas durante la implementación

- **Rango de color de los técnicos sin `created_at`**: el tipo `Technician` generado no trae `created_at`, así que `technicianColorMap` usa la posición en la lista (ya ordenada por antigüedad) como sustituto. Funciona mientras la API conserve ese orden. Sugerencia: agregar `created_at` a la respuesta de técnicos. Fase: primer sprint que toque la API de técnicos.
- **Semántica de "Volver a la grilla" y de la lista de "+N más"**: la franja filtra por solape con el rango del grupo oculto (no por inicio dentro de la franja), la lista puede mostrar más servicios que los N ocultos y "Volver a la grilla" solo existe en escritorio (en móvil la lista es la vista normal). Pendiente confirmar con el dueño si esa lectura es la esperada. Fase: próxima revisión de la agenda.
- **`EXPLAIN` de `GET /search` sin hacer**: no se midió el plan de consulta con volumen real, solo se creó el índice `ix_customers_name_search` y los de `appointments`. Fase: antes de un negocio con decenas de miles de servicios.
- **`npm audit` de `api/` (corregido con datos verificados)**: `npm audit --omit=dev` bajo Node 24.22.1 en `api/` da 4 hallazgos altos en dependencias de PRODUCCIÓN, no en una herramienta de desarrollo:
  - `body-parser` 2.0.0 a 2.3.0: denegación de servicio por bytes sobrantes tras un cuerpo comprimido (GHSA-27r3-jxmh-p828). Se corrige con `npm audit fix`, sin cambios incompatibles.
  - `multer` 2.0.0 a 2.4.0: denegación de servicio por un `fileFilter` asíncrono pendiente tras cerrarse la solicitud (GHSA-q7qp-rjg7-q26m). El arreglo requiere `npm audit fix --force`, que instala `@nestjs/platform-express` 11.1.1 (cambio incompatible). El hallazgo se propaga a `@nestjs/platform-express` y `@nestjs/core`.
  - Riesgo actual: bajo. La API no tiene carga de archivos ni autenticación y no está expuesta a internet. Debe resolverse antes de cualquier despliegue a producción.
  - Fase sugerida: una tarea dedicada de actualización de dependencias antes de la fase de autenticación y antes de producción.
  - `app/`: 1 hallazgo de severidad baja (según el verificador).
  - Corrección: los documentos del sprint 1 atribuyeron estos hallazgos a `kysely-codegen` (desarrollo), lo cual era inexacto. Los archivos archivados del sprint 1 no se editan.
- **La ficha del cliente no enlaza a cada servicio**: el historial del cliente lista los servicios sin vínculo a su ficha en la agenda, aunque el parámetro `appointment` ya lo permite. Fase: siguiente sprint de la PWA.
- **Comprobaciones solo por clase**: los 44 px de los objetivos táctiles, la contracción a íconos entre 1024 px y el ancho `xl` y el contraste en pantalla se comprueban por clases CSS y por cálculo (`tokens.test.ts`), no medidos en un navegador. jsdom no calcula estilos. Fase: verificación manual M1 a M3 (pendiente) y, a futuro, una prueba de navegador real.
- **`technicianIds` opcional en `GET /agenda/visible-hours`**: la ruta tolera la ausencia del parámetro en lugar de rechazarla. Fase: decidir si debe ser obligatorio cuando se revise el contrato.
- **Catálogo de la guarda de vocabulario**: `CATALOG_CONTEXTS` en `app/src/test/vocabulary-scan.ts` es una lista explícita de contextos donde "servicio" significa tipo de servicio. Un texto nuevo con ese sentido en otro lugar no se detecta. Fase: revisar la lista al agregar pantallas del catálogo.
- **Redondeo de la eficiencia**: la API devuelve `efficiency.rate` como fracción y la interfaz muestra `Math.round(rate * 100)`; con `rate` en coma flotante un valor exacto en .5 podría redondear distinto según la representación. No hay un caso real conocido. Fase: si aparece un desajuste, devolver el porcentaje entero desde la API.
- **Búsqueda con términos mixtos**: un término con texto y dígitos (por ejemplo `bear_1`) también busca esos dígitos en el teléfono de los clientes (`phoneDigitsContain`), lo que añade resultados poco relevantes. No expone datos ni lista anonimizados. Fase: afinar la relevancia de la búsqueda (solo usar teléfono si el término es casi todo dígitos).
- **Teléfono del anonimizado en las vistas de servicios**: `GET /appointments` devuelve `customer.phone` con el marcador `anon-...` del cliente anonimizado. No es un dato personal, pero la spec solo exige `name = null` y el alias. Fase: decidir si la vista debe devolver `phone = null`. Sugerencia del verificador: `GET /appointments` debe devolver `phone = null` para clientes anonimizados en lugar del marcador `anon-...`.
- **Sugerencia del verificador: `created_at` en técnicos**: agregar `created_at` a la respuesta de técnicos para eliminar el proxy de posición en la lista del rango de color (ver la entrada de rango de color).
- **Sugerencia del verificador: `technicianIds` obligatorio**: hacer `technicianIds` obligatorio en `GET /agenda/visible-hours` al revisar el contrato (ver la entrada de `technicianIds` opcional).

## Fuera de este sprint (de la propuesta)

- Reportes, vista Mes, Exportar PDF/Excel.
- Autenticación y roles (y por eso un Perfil real).
- WhatsApp, bot y fecha del seguimiento en la respuesta del servicio (deuda C, para el sprint del bot).
- Recaudo y precio acordado (`openspec/backlog.md`), pagos.
- Notificaciones push, arrastrar y soltar, caché sin conexión.
