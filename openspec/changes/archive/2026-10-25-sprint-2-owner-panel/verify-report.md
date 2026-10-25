# Verify Report: sprint-2-owner-panel

Fecha: 2026-10-25. Rama: `feat/sprint-2-owner-panel`. Node v24.22.1. Modo: Strict TDD.

## Verdict: PASS WITH WARNINGS

CRITICAL: 0. WARNING: 3. SUGGESTION: 3.

## Ejecución real

| Comando | Resultado |
|---|---|
| `npm test --prefix api` | 92 archivos, 1472 pruebas pasan (Testcontainers) |
| `npm test --prefix app` | 65 archivos, 951 pruebas pasan |
| lint, typecheck, build (api y app) | OK |
| `openapi:check` (api) | "api/openapi.json está al día." |
| `gen:api:check` (app) | "schema.d.ts está al día con api/openapi.json." |
| `format:check` (app), `prettier --check .` (api) | OK |

## Completitud

Fases 1 a 16 con todas las tareas marcadas `[x]`, salvo 15.5 (verificación manual M1 a M9): pendiente, la ejecuta el usuario; no verificable por el verificador y no cuenta como fallo. Ver M1 a M9 en tasks.md.

## Correctness contra las specs

La tabla de trazabilidad de tasks.md (criterios 1 a 13) se revisó contra el código y las ejecuciones: cada archivo citado existe dentro de las suites que pasan. Cobertura por spec:

- dashboard: `dashboard-kpis.spec.ts`, `get-dashboard-summary.spec.ts`, `working-day.spec.ts`, `dashboard.http.int-spec.ts`, `DashboardPage.test.tsx`, `dashboard-format.test.ts`. Límite de 200 en Por cerrar: `agenda-to-close.http.int-spec.ts` (340 devuelve 200 y total 340).
- global-search: `search.http.int-spec.ts` (privacidad), `agenda-search.int-spec.ts`, `text-search.int-spec.ts`, `GlobalSearch.test.tsx`, `search-api.test.tsx`; `GET /customers?search=` sin acentos en `customers-search.http.int-spec.ts` y en la aceptación S2.
- technicians-free-at-slot: `free-technicians.http.int-spec.ts` (14 escenarios, paridad con reasignar), `ReassignDialog.test.tsx` (11).
- profile-mock: `profile-mock.guard.test.ts`, `ProfilePage.test.tsx`.
- owner-agenda-ui: `Sidebar`, `BottomNav`, `AgendaGrid`, `AgendaList`, `TechnicianSelector`, `technician-selection`, `agenda-layout`, `tokens.test.ts` (AA), `vocabulary.test.ts`.
- customer-records: `appointments-view-anonymized.int-spec.ts`, `CustomerDetailPage.test.tsx`, `people.test.ts`.

Sin requisitos sin implementación. Sin requisitos sin prueba, salvo las partes que dependen de navegador real (M1 a M9, ver debts.md).

## Coherencia con el diseño

- Dominio puro: el único import externo bajo `api/src/scheduling/domain` es `luxon` en `time/zoned-clock.ts` (más `domain-independence.spec.ts`).
- Migración 005 con `up`/`down` cubierta por `migrator.int-spec.ts` y `migration-005.int-spec.ts`.
- Sin códigos de error nuevos (20, los mismos); OpenAPI y cliente generado en sincronía.
- Claves de TanStack Query: `['appointments', ...]` para servicios; visible-hours bajo `['technicians','visible-hours',...]`, tal como fija design.md línea 141.
- Accesibilidad por lectura: `nav aria-label="Navegación principal"` en Sidebar y BottomNav; `aria-current` en "Más"; combobox con `role`, `aria-expanded`, `aria-controls`, `aria-activedescendant` en `GlobalSearch.tsx`.

## Strict TDD

El apply-progress (obs. #829) no trae tabla formal "TDD Cycle Evidence"; se juzga por notas por lote, commits y mutaciones, igual que en sprint 1.

- RED registrado por lote (módulo inexistente, stubs, falla de N pruebas antes de implementar).
- Pruebas nacidas en verde (lote 13.6, lote 12 navegación, lote 15 aceptación) compensadas con mutación que falló y se revirtió.
- Lote 11: la página se escribió antes de sus pruebas; compensado con 18 pruebas existentes que fallaron y mutaciones de límite y de parámetro.
- Guardas con mutación comprobada (15.4).
- Sin `.only`/skip; sin TODO/FIXME; `console.log` solo en CLIs (`database/cli.ts`, `openapi/cli.ts`).

## Calidad

- `git ls-files`: solo `api/.env.example` y `app/.env.example`.
- Commits desde `7e88071`: 20, convencionales y por unidad de trabajo; sin "Co-Authored-By" ni atribución de IA en ningún mensaje.
- `api/package-lock.json` modificado: solo ruido autocrlf (`--ignore-cr-at-eol` no muestra diferencias). Los blobs del índice son LF.

## Desviaciones reportadas

Aceptables, documentadas y con cobertura: forma de `FreeTechnician`; `ToCloseListSchema`; claves `{customers, services}`; tipo de servicio buscado por `service_name_snapshot`; rango de color por posición en la lista; `onEmptySlotSelect(day)`; `CATALOG_CONTEXTS` explícito; `technicianIds` opcional; teléfono marcador en `GET /appointments`; coincidencia de dígitos en términos mixtos. Página antes de pruebas (lote 11) y REDs por stub: WARNING menor, compensado.

## CRITICAL

Ninguno.

## WARNING

1. `debts.md` es inexacto en `npm audit` de `api/`: dice "3 hallazgos altos ... por `kysely-codegen` (herramienta de desarrollo)". La ejecución real da 5 altos: `body-parser` 2.0.0-2.3.0, `multer` 2.0.0-2.4.0 y la cadena `@nestjs/platform-express`/`core`/`testing`; con `--omit=dev` aparecen `body-parser` y `multer`, o sea dependencias de ejecución. Corregir la entrada antes de archivar. En `app/`: 1 low.
2. 15.5 (M1 a M9) pendiente: contraste en pantalla, 44 px, transición a 1024 px y carrera de pestañas solo se probaron por clases y cálculo.
3. Sin tabla formal de TDD en el apply-progress y varias pruebas nacidas en verde (compensadas por mutación).

## SUGGESTION

1. Devolver `phone = null` para anonimizados en `GET /appointments` (deuda registrada).
2. Agregar `created_at` a la respuesta de técnicos para eliminar el proxy de rango de color.
3. Hacer `technicianIds` obligatorio en visible-hours al revisar el contrato.

## Próximo paso

Sin CRITICAL: se puede archivar tras corregir la entrada de `npm audit` en debts.md y tras que el usuario ejecute o difiera M1 a M9.
