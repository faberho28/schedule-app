# schedule-app

Schedule App: agenda automática por WhatsApp para negocios de servicios. Este repositorio contiene el sprint 1: la API de agendamiento y la PWA del dueño. WhatsApp y el bot no forman parte de este sprint.

## Estructura

| Carpeta | Contenido |
|---------|-----------|
| `api/` | Backend NestJS + Kysely + Postgres 16 (proyecto independiente) |
| `app/` | PWA del dueño en React + Vite (proyecto independiente) |
| `openspec/` | Propuesta, especificaciones, diseño y tareas del sprint |
| `docker-compose.yml` | Postgres 16 para desarrollo local |

Cada proyecto tiene su propio `package.json`; no hay workspace en la raíz.

## Dónde está cada documento

| Documento | Qué contiene |
|-----------|--------------|
| `PRD — Agenda automática por WhatsApp para negocios de servicios.md` | Producto completo (el sprint 1 cubre una parte) |
| [`openspec/changes/sprint-1-owner-pwa/proposal.md`](openspec/changes/sprint-1-owner-pwa/proposal.md) | Alcance, criterios de éxito y decisiones de producto |
| [`openspec/changes/sprint-1-owner-pwa/user-stories.md`](openspec/changes/sprint-1-owner-pwa/user-stories.md) | Historias de usuario |
| [`openspec/changes/sprint-1-owner-pwa/specs/`](openspec/changes/sprint-1-owner-pwa/specs/) | Requisitos y escenarios por capacidad |
| [`openspec/changes/sprint-1-owner-pwa/design.md`](openspec/changes/sprint-1-owner-pwa/design.md) | Decisiones de diseño |
| [`openspec/changes/sprint-1-owner-pwa/tasks.md`](openspec/changes/sprint-1-owner-pwa/tasks.md) | Tareas por fase y trazabilidad de los criterios de aceptación |
| [`openspec/changes/sprint-1-owner-pwa/debts.md`](openspec/changes/sprint-1-owner-pwa/debts.md) | Deudas y trabajo fuera del sprint 1 |
| [`api/README.md`](api/README.md) | Comandos, esquema, endpoints, códigos de error, dominio y pruebas de la API |
| [`app/README.md`](app/README.md) | Comandos, variables, pantallas, cliente generado y PWA |

## Puesta en marcha local

Requisitos: Node 24 (`.nvmrc` en cada proyecto) y Docker en ejecución.

```bash
# 1. Base de datos (Postgres 16 con usuario, contraseña y base "schedule")
docker compose up -d --wait

# 2. API
cd api
npm install
cp .env.example .env     # revisa los valores, ver más abajo
npm run db:migrate       # aplica las migraciones
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
npm run openapi:check --prefix api   # api/openapi.json coincide con el código
npm run gen:api:check --prefix app   # el cliente de app/ coincide con api/openapi.json
```

Cuando cambia un endpoint: `npm run openapi:export --prefix api` y luego `npm run gen:api --prefix app`, y se versionan ambos archivos generados.

## Verificación manual pendiente

Lo que solo se puede juzgar en un navegador o dispositivo (instalación de la PWA, modo sin conexión, tamaño táctil, aspecto de la agenda) está listado, con los pasos, en `openspec/changes/sprint-1-owner-pwa/tasks.md`, fase 18.
