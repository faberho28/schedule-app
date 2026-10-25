# Informe de archivo: sprint-1-owner-pwa

- Cambio: sprint-1-owner-pwa
- Fecha de archivo: 2026-10-22
- Modo de almacenamiento: openspec (con copia del informe en engram, topic_key `sdd/sprint-1-owner-pwa/archive-report`)
- Rama: feat/sprint-1-owner-pwa (HEAD 415417a al iniciar el archivo)
- Carpeta de destino: `openspec/changes/archive/2026-10-22-sprint-1-owner-pwa/` (pendiente de movimiento, ver sección 5)

## 1. Resultado de la verificación

- Veredicto de `verify-report.md`: PASS WITH WARNINGS.
- CRITICAL: 0. WARNING: 5. SUGGESTION: 5.
- Comandos verificados: pruebas de api (1238) y app (534), lint, typecheck, build, `openapi:check` y `gen:api:check` en verde. `npm audit` de api con 3 hallazgos altos en dependencia de desarrollo, registrados en `debts.md`.

### Brechas conocidas y compensaciones

| Brecha | Estado | Compensación declarada en el verify report |
|--------|--------|--------------------------------------------|
| El apply-progress (#799) no tiene la tabla "TDD Cycle Evidence" (RED / GREEN / TRIANGULATE / SAFETY NET) | Abierta. No se inventó la tabla. | El RED esperado está registrado en `tasks.md` para cada tarea; hay un commit por unidad con sus pruebas; todas las pruebas pasan en la ejecución actual; hay evidencia de mutación. |
| 14 pruebas de aceptación nacieron en verde (`api/test/acceptance/sprint-1.acceptance.int-spec.ts`) | Abierta: el RED no se observó directamente. | Mutación comprobada: `followup-policy` aceptando `pending` rompe 2 pruebas; quitar la anulación `closure_corrected` rompe 1; quitar `loadEnvFile` rompe 2 de 3 pruebas de arranque. |
| Verificación manual M1 a M5 (instalación PWA, offline, tamaño táctil de 44 px, carrera con dos pestañas, aspecto de la agenda) | Reportada por el usuario como ejecutada y aprobada. No verificable por el verificador. | No se cuenta como fallo. |
| Tareas 18.1 a 18.4 | Sin marcar a propósito. Corresponden a M1 a M4 y no pueden verificarse automáticamente. | Se dejan como están en `tasks.md`. |

## 2. Trazabilidad de artefactos (observaciones de engram)

| Artefacto | Observación engram | Archivo fuente |
|-----------|--------------------|----------------|
| proposal | #787 (`sdd/sprint-1-owner-pwa/proposal`) | `proposal.md` |
| spec | #791 (`sdd/sprint-1-owner-pwa/spec`) | `specs/*/spec.md` |
| design | #792 (`sdd/sprint-1-owner-pwa/design`) | `design.md` |
| tasks | #798 (`sdd/sprint-1-owner-pwa/tasks`) | `tasks.md`, `user-stories.md` |
| verify-report | #811 (`sdd/sprint-1-owner-pwa/verify-report`) | `verify-report.md` |

Los IDs se confirmaron con búsqueda. El archivo fuente de cada artefacto se usó como contenido porque el modo es openspec.

## 3. Alineaciones de documentación aplicadas antes de archivar

1. `specs/service-closure/spec.md`, requisito "Corrección del cierre": se añadió que toda corrección (cambio entre `completed` y `no_show`, cambio de fecha de completado y devolución a `confirmed`) MUST incluir motivo; sin motivo, la API responde 422 `correction_reason_required` y no cambia nada. Se añadió el escenario "Corrección sin motivo".
2. `design.md`, nueva subsección "D6.1 Convenciones de contrato de la API": cuerpos en `snake_case` y consultas en `camelCase`; asimetría de `DELETE` (técnicos 200 con cuerpo, clientes 204); precios mostrados en COP como supuesto del sprint 1.
3. `debts.md`: dos entradas nuevas con motivo y fase sugerida: asimetría de `DELETE` (en "Calidad y operación") y ventana visible por defecto de la agenda 07:00 a 19:00 (en "Interfaz").

## 4. Sincronización de specs principales

Las carpetas de `openspec/specs/` estaban vacías (solo `.gitkeep`), por lo que cada delta se copió como spec completo, según la regla del skill. El contenido se conserva tal cual, incluidos el encabezado "# Delta for {dominio}" y el bloque "## ADDED Requirements".

| Dominio | Acción | Requisitos |
|---------|--------|-----------|
| business-settings | Creado | 4 |
| service-catalog | Creado | 4 |
| technician-schedules | Creado | 7 |
| slot-availability | Creado | 6 |
| appointment-management | Creado | 5 |
| customer-records | Creado | 9 |
| service-closure | Creado (incluye la alineación del punto 3.1) | 5 |
| owner-agenda-ui | Creado | 7 |

Total: 8 dominios, 47 requisitos. No hubo requisitos que fusionar ni eliminados.

## 5. Movimiento de la carpeta (pendiente)

No hay herramienta disponible para mover carpetas en este entorno (sin Bash). Por eso la carpeta activa sigue en `openspec/changes/sprint-1-owner-pwa/`. El orquestador debe ejecutar:

```
git mv openspec/changes/sprint-1-owner-pwa openspec/changes/archive/2026-10-22-sprint-1-owner-pwa
```

Este informe ya está dentro de la carpeta activa, así que viaja con ella. No se copiaron artefactos a la carpeta de archivo para no duplicarlos.

## 6. Riesgos y notas

- `design.md` (D3 y D11) y el contrato de errores (D6) describen campos de cuerpo en camelCase (`confirmEarly`, `confirmReopen`) y el código de error `reopen_confirmation_required`. La nueva convención dice que los cuerpos son `snake_case`. Hay una inconsistencia que no se corrigió porque no estaba en el alcance: conviene revisarla con el código antes de publicar el contrato.
- El texto original del spec de `service-closure` exigía motivo solo al reabrir; el código exige motivo en toda corrección (verify report, WARNING 3). La alineación del punto 3.1 cubre el spec. No se verificó en esta fase si el código y el spec coinciden en cada endpoint.
- El apply-progress no tiene la tabla de evidencia TDD (ver sección 1). Queda como advertencia documentada.
- Las specs principales conservan el encabezado "# Delta for ..." y "## ADDED Requirements" porque no existía una spec previa que fusionar. Si se prefiere un encabezado de spec principal, es un cambio de formato que puede hacerse en una pasada aparte.
- `openspec/backlog.md` y `openspec/config.yaml` no se tocaron.
- No se modificó código fuente en `api/` ni en `app/`. No hubo commits ni push.
