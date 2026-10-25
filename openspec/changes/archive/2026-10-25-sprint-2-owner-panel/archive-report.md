# Informe de archivo: sprint-2-owner-panel

- Cambio: sprint-2-owner-panel
- Fecha de archivo: 2026-10-25
- Modo de almacenamiento: openspec (con copia del informe en engram, topic_key `sdd/sprint-2-owner-panel/archive-report`)
- Rama: feat/sprint-2-owner-panel
- Carpeta de destino: `openspec/changes/archive/2026-10-25-sprint-2-owner-panel/` (pendiente de movimiento, ver sección 6)

## 1. Resultado de la verificación

- Veredicto de `verify-report.md`: PASS WITH WARNINGS.
- CRITICAL: 0. WARNING: 3. SUGGESTION: 3.
- Comandos verificados (Node v24.22.1): pruebas de api (92 archivos, 1472 pruebas) y app (65 archivos, 951 pruebas), lint, typecheck, build, `openapi:check`, `gen:api:check` y formato en verde.

### Brechas conocidas y compensaciones

| Brecha | Estado | Compensación |
|--------|--------|--------------|
| El apply-progress (#829) no tiene la tabla formal "TDD Cycle Evidence" | Abierta. No se inventó la tabla. | RED registrado por lote, un commit por unidad de trabajo, pruebas en verde y mutaciones comprobadas. |
| Pruebas nacidas en verde (lote 13.6, navegación del lote 12, aceptación del lote 15) | Abierta: el RED no se observó directamente. | Cada una se compensó con una mutación que falló y se revirtió (tarea 15.4). |
| Lote 11: la página se escribió antes de sus pruebas | Abierta, WARNING menor. | 18 pruebas existentes que fallaron más mutaciones de límite y de parámetro. |
| Verificación manual M1 a M9 (tarea 15.5) | El usuario reportó el 2026-10-25 que todas pasaron en un navegador real ("Todo check"). El verificador no pudo comprobarlo. | Se marcaron `[x]` en `tasks.md` con la nota de que son reportadas por el usuario. No se cuentan como verificadas por el agente. |

### Hallazgo de `npm audit` corregido

El `debts.md` original decía que `api/` tenía 3 hallazgos altos por `kysely-codegen` (herramienta de desarrollo). Los datos verificados (`npm audit --omit=dev`, Node 24.22.1, en `api/`) son otros: 4 hallazgos altos en dependencias de PRODUCCIÓN.

- `body-parser` 2.0.0 a 2.3.0: denegación de servicio por bytes sobrantes tras un cuerpo comprimido (GHSA-27r3-jxmh-p828). Se corrige con `npm audit fix`, sin cambios incompatibles.
- `multer` 2.0.0 a 2.4.0: denegación de servicio por un `fileFilter` asíncrono pendiente tras cerrarse la solicitud (GHSA-q7qp-rjg7-q26m). Requiere `npm audit fix --force`, que instala `@nestjs/platform-express` 11.1.1 (cambio incompatible). Se propaga a `@nestjs/platform-express` y `@nestjs/core`.
- Riesgo actual bajo: la API no tiene carga de archivos ni autenticación y no está expuesta a internet. Debe resolverse antes de cualquier despliegue a producción, con una tarea dedicada de actualización de dependencias antes de la fase de autenticación.
- `app/`: 1 hallazgo de severidad baja.
- Los documentos del sprint 1 atribuyeron estos hallazgos a `kysely-codegen`; era inexacto. Los archivos archivados del sprint 1 no se editaron.

### Sugerencias del verificador (registradas en `debts.md`)

1. `GET /appointments` debe devolver `phone = null` para clientes anonimizados (hoy devuelve el marcador `anon-...`).
2. Agregar `created_at` a la respuesta de técnicos para eliminar el proxy de posición del rango de color.
3. Hacer `technicianIds` obligatorio en `GET /agenda/visible-hours` al revisar el contrato.

## 2. Trazabilidad de artefactos (observaciones de engram)

| Artefacto | Observación engram | Archivo fuente |
|-----------|--------------------|----------------|
| proposal | #818 (`sdd/sprint-2-owner-panel/proposal`) | `proposal.md` |
| spec | #821 (`sdd/sprint-2-owner-panel/spec`) | `specs/*/spec.md` |
| design | #824 (`sdd/sprint-2-owner-panel/design`) | `design.md` |
| tasks | #828 (`sdd/sprint-2-owner-panel/tasks`) | `tasks.md`, `user-stories.md` |
| apply-progress | #829 (`sdd/sprint-2-owner-panel/apply-progress`) | no aplica |
| verify-report | #830 (`sdd/sprint-2-owner-panel/verify-report`) | `verify-report.md` |
| reconciliación | #826 (`sdd/sprint-2-owner-panel/reconciliation`) | no aplica |

Los IDs se confirmaron con búsqueda. Como el modo es openspec, el contenido se tomó de los archivos fuente.

## 3. Documentación actualizada antes de archivar

1. `tasks.md`: tarea 15.5 y M1 a M9 marcadas `[x]`, cada una con la nota "reportado por el usuario el 2026-10-25; el verificador no pudo comprobarlo". El resto no se tocó.
2. `debts.md`: entrada de `npm audit` corregida con los datos verificados; se agregaron las 3 sugerencias del verificador.

## 4. Sincronización de specs principales

| Dominio | Acción | Requisitos antes | Requisitos después |
|---------|--------|------------------|--------------------|
| dashboard | Creado (9 ADDED) | n/a | 9 |
| global-search | Creado (5 ADDED) | n/a | 5 |
| technicians-free-at-slot | Creado (4 ADDED) | n/a | 4 |
| profile-mock | Creado (3 ADDED) | n/a | 3 |
| owner-agenda-ui | Fusionado: 14 ADDED agregados, 3 MODIFIED reemplazados ("Interfaz en español", "Agenda día y semana por técnico", "Diálogos de cita basados en cupos") | 7 | 21 |
| customer-records | Fusionado: 1 ADDED agregado ("Búsqueda de clientes sin distinguir acentos ni mayúsculas") | 9 | 10 |

Total de las capacidades tocadas: 52 requisitos. Total de `openspec/specs/` tras el archivo: 12 dominios y 83 requisitos (62 de los 8 dominios previos más 21 de los 4 nuevos). No hubo requisitos REMOVED.

Notas de la fusión:

- Las líneas "(Previously: ...)" de los MODIFIED no se copiaron a la spec principal.
- Los requisitos MODIFIED conservan su nombre (incluido "Diálogos de cita basados en cupos"), porque así figura en el delta; el texto interno ya usa "servicio".
- Las 4 specs nuevas conservan el encabezado "# Delta for ..." y "## ADDED Requirements", igual que en el sprint 1.
- El párrafo de glosario que abre el delta de `owner-agenda-ui` no se copió a la spec principal; el glosario vive en `app/README.md`.
- La observación #821 menciona 8 requisitos para dashboard; el archivo de delta tiene 9 (incluye "Consulta de servicios por cerrar"). Se fusionaron los 9 del archivo.
- Se releyó `owner-agenda-ui` y `customer-records` tras editar y no hay encabezados duplicados ni huérfanos.

## 5. Archivos

Creados:

- `openspec/specs/dashboard/spec.md`
- `openspec/specs/global-search/spec.md`
- `openspec/specs/technicians-free-at-slot/spec.md`
- `openspec/specs/profile-mock/spec.md`
- `openspec/changes/sprint-2-owner-panel/archive-report.md`

Editados:

- `openspec/specs/owner-agenda-ui/spec.md`
- `openspec/specs/customer-records/spec.md`
- `openspec/changes/sprint-2-owner-panel/tasks.md`
- `openspec/changes/sprint-2-owner-panel/debts.md`

Sin cambios: `openspec/backlog.md`, `openspec/config.yaml`, `api/`, `app/` y el archivo del sprint 1.

## 6. Movimiento de la carpeta (pendiente)

No hay herramienta para mover carpetas en este entorno. El orquestador debe ejecutar:

```
git mv openspec/changes/sprint-2-owner-panel openspec/changes/archive/2026-10-25-sprint-2-owner-panel
```

Este informe ya está dentro de la carpeta activa y viaja con ella. Después, un commit de documentación (conventional commit, sin atribución de IA).

## 7. Riesgos y notas

- `api/package-lock.json` aparece modificado solo por ruido de autocrlf (según el verify report); no debe incluirse en el commit de archivo.
- Las dependencias de producción con hallazgos altos de `npm audit` (`body-parser`, `multer`) quedan como deuda a resolver antes de producción.
- M1 a M9 dependen de la palabra del usuario; no hay evidencia automatizada de contraste en pantalla, 44 px reales, transición a 1024 px ni carrera entre pestañas.
