# schedule-app

Schedule App: agenda automática por WhatsApp para negocios de servicios. Este repositorio contiene la API de agendamiento (sprint 1) y la PWA del dueño, que en el sprint 2 pasó a ser un panel para escritorio y móvil. WhatsApp y el bot no forman parte de estos sprints.

Pantallas de la PWA (las rutas y los detalles están en [`app/README.md`](app/README.md)):

| Pantalla | Qué hace |
|----------|----------|
| Panel de control (`/`) | Cuatro tarjetas (servicios de hoy, técnicos activos, eficiencia de 30 días, servicios pendientes) y la lista "Servicios de hoy" |
| Agenda | Grilla de tiempo en escritorio (hasta 10 técnicos, "+N más") y lista de un día en móvil; filtros, "Por cerrar" y búsqueda global de servicios y clientes |
| Clientes, Técnicos, Tipos de servicio, Configuración | Altas, ediciones y datos del negocio |
| Perfil | Pantalla de demostración sin inicio de sesión (ver [`debts.md`](openspec/changes/sprint-2-owner-panel/debts.md)) |

Desde 1024 px de ancho la navegación es una barra lateral; por debajo, una barra inferior con "Más".

## Estructura

| Carpeta | Contenido |
|---------|-----------|
| `api/` | Backend NestJS + Kysely + Postgres 16 (proyecto independiente) |
| `app/` | PWA del dueño en React + Vite (proyecto independiente) |
| `openspec/` | Propuestas, especificaciones, diseños y tareas de cada sprint |
| `docker-compose.yml` | Postgres 16 para desarrollo local |

Cada proyecto tiene su propio `package.json`; no hay workspace en la raíz.

## Dónde está cada documento

| Documento | Qué contiene |
|-----------|--------------|
| `PRD — Agenda automática por WhatsApp para negocios de servicios.md` | Producto completo (los sprints 1 y 2 cubren una parte) |
| [`openspec/specs/`](openspec/specs/) | Especificaciones vigentes por capacidad (sprint 1 archivado) |
| [`openspec/changes/archive/2026-10-22-sprint-1-owner-pwa/`](openspec/changes/archive/2026-10-22-sprint-1-owner-pwa/) | Sprint 1 archivado: propuesta, historias, diseño, tareas, deudas e informes |
| [`openspec/changes/sprint-2-owner-panel/proposal.md`](openspec/changes/sprint-2-owner-panel/proposal.md) | Sprint 2: alcance, criterios de éxito y decisiones de producto |
| [`openspec/changes/sprint-2-owner-panel/user-stories.md`](openspec/changes/sprint-2-owner-panel/user-stories.md) | Sprint 2: historias de usuario |
| [`openspec/changes/sprint-2-owner-panel/specs/`](openspec/changes/sprint-2-owner-panel/specs/) | Sprint 2: cambios de requisitos por capacidad |
| [`openspec/changes/sprint-2-owner-panel/design.md`](openspec/changes/sprint-2-owner-panel/design.md) | Sprint 2: decisiones de diseño |
| [`openspec/changes/sprint-2-owner-panel/tasks.md`](openspec/changes/sprint-2-owner-panel/tasks.md) | Sprint 2: tareas por fase, trazabilidad de los criterios y verificación manual pendiente (M1 a M9) |
| [`openspec/changes/sprint-2-owner-panel/debts.md`](openspec/changes/sprint-2-owner-panel/debts.md) | Sprint 2: deudas y trabajo fuera del sprint |
| [`openspec/backlog.md`](openspec/backlog.md) | Trabajo futuro (por ejemplo, recaudo y precio acordado) |
| [`api/README.md`](api/README.md) | Comandos, esquema y migraciones, endpoints, códigos de error, dominio, búsqueda y pruebas de la API |
| [`app/README.md`](app/README.md) | Comandos, variables, shell adaptable, pantallas, vocabulario, cliente generado y PWA |

## Puesta en marcha local

Requisitos: Node 24 o superior (`engines.node >=24` y `.nvmrc` en cada proyecto) y Docker en ejecución.

```bash
# 1. Base de datos (Postgres 16 con usuario, contraseña y base "schedule")
docker compose up -d --wait

# 2. API
cd api
npm install
cp .env.example .env     # revisa los valores, ver más abajo
npm run db:migrate       # aplica las migraciones 001 a 005 (la 005 crea las extensiones unaccent y pg_trgm y los índices de búsqueda)
npm run db:seed          # siembra el negocio con DEFAULT_BUSINESS_ID (idempotente)
npm run start:dev        # http://localhost:3000

# 3. PWA (en otra terminal)
cd app
npm install
npm run dev              # http://localhost:5173, con proxy de /api hacia http://localhost:3000
```

Variables de `api/.env` (obligatorias `DATABASE_URL` y `DEFAULT_BUSINESS_ID`):

```
DATABASE_URL=postgres://schedule:schedule@localhost:5432/schedule
DEFAULT_BUSINESS_ID=00000000-0000-4000-8000-000000000001   # cualquier UUID válido; el seed crea el negocio con ese id
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

La PWA no necesita configuración en desarrollo. Las variables opcionales de `app/` están en [`app/README.md`](app/README.md).

## Pruebas y verificaciones

```bash
npm test --prefix api            # unidad e integración; las de integración levantan Postgres con Testcontainers (requiere Docker)
npm test --prefix app
npm run lint --prefix api        # y lo mismo con --prefix app
npm run typecheck --prefix api   # y lo mismo con --prefix app
npm run format:check --prefix app    # formato de app/ (en api/ se usa `npx prettier --check .` dentro de api/)
npm run build --prefix api       # y lo mismo con --prefix app
npm run openapi:check --prefix api   # api/openapi.json coincide con el código
npm run gen:api:check --prefix app   # el cliente de app/ coincide con api/openapi.json
```

Para revertir la última migración (por ejemplo la 005): `npm run db:rollback --prefix api`.

Cuando cambia un endpoint: `npm run openapi:export --prefix api` y luego `npm run gen:api --prefix app`, y se versionan ambos archivos generados.

## Verificación manual pendiente

Lo que solo se puede juzgar en un navegador o dispositivo (barra lateral y barra inferior, tamaño táctil, grilla con 10 técnicos, colores en tema claro y oscuro, búsqueda, instalación de la PWA, modo sin conexión) está listado, con los pasos M1 a M9, en [`openspec/changes/sprint-2-owner-panel/tasks.md`](openspec/changes/sprint-2-owner-panel/tasks.md), fase 15. La lista del sprint 1 está en `openspec/changes/archive/2026-10-22-sprint-1-owner-pwa/tasks.md`, fase 18.
