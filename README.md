# schedule-app

Schedule App: agenda automática por WhatsApp para negocios de servicios. El PRD está en la raíz del repositorio y los artefactos de planificación en `openspec/`.

## Estructura

| Carpeta | Contenido |
|---------|-----------|
| `api/` | Backend NestJS + Kysely + Postgres (proyecto independiente) |
| `app/` | PWA del dueño en React + Vite (se crea en una fase posterior) |
| `openspec/` | Especificaciones, diseño y tareas del sprint |

Cada proyecto tiene su propio `package.json`; no hay workspace en la raíz.

## Desarrollo

Requisitos: Node 24 (`.nvmrc` en cada proyecto), Docker.

```bash
# 1. Base de datos local (Postgres 16)
docker compose up -d

# 2. Backend
cd api
cp .env.example .env
npm install
npm test
```

Los comandos completos del backend están en [`api/README.md`](api/README.md).
