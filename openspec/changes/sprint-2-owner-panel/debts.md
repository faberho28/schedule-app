# Deudas del cambio sprint-2-owner-panel

Cada entrada indica qué queda pendiente, por qué y en qué fase se resuelve.

## Perfil simulado

- **Qué**: `app/src/features/profile/profile.mock.ts` entrega un Perfil de demostración ("Dueño del negocio") sin usuario real ni cierre de sesión.
- **Fase**: autenticación.
- **Qué hacer**: reemplazar `profile.mock.ts` por el usuario autenticado, retirar el mock y la guarda (`profile-mock.guard.test.ts`) y agregar una verificación en el pipeline de publicación cuando exista.
- **Riesgo**: nunca publicar a producción antes de contar con un inicio de sesión completo.

## Deudas aceptadas por el diseño

- **Clave de `localStorage` sin id de negocio**: la preferencia guardada en el navegador no distingue negocios. Aceptable mientras haya un solo negocio por dispositivo; revisar con la autenticación.
- **`pending` fuera de "Servicios pendientes" (R11)**: los servicios en estado `pending` no se cuentan en esa lista. Revisar si el negocio lo necesita.
- **Índice trigram de `appointments`**: la búsqueda no tiene índice trigram. Evaluarlo si un negocio supera unas 50.000 servicios.

## Fuera de este sprint (de la propuesta)

- Reportes, vista Mes, Exportar PDF/Excel.
- Autenticación y roles (y por eso un Perfil real).
- WhatsApp, bot y fecha del seguimiento en la respuesta del servicio (deuda C, para el sprint del bot).
- Recaudo y precio acordado (`openspec/backlog.md`), pagos.
- Notificaciones push, arrastrar y soltar, caché sin conexión.
