# Informe de verificación: sprint-1-owner-pwa

- Change: sprint-1-owner-pwa
- Rama: feat/sprint-1-owner-pwa (HEAD 415417a)
- Mode: engram + archivo openspec
- Strict TDD: activo (api/ y app/, runner Vitest)
- Verifier: sdd-verify (sin modificar código fuente)

## Verdict: PASS WITH WARNINGS

CRITICAL: 0. WARNING: 5. SUGGESTION: 5. El paso sdd-archive puede ejecutarse.

## 1. Completeness

| Grupo | Resultado |
|-------|-----------|
| Fases 1 a 17 (tareas 1.1 a 17.5) | 100% marcadas `[x]`; coinciden con el código y con los 25 commits de la rama |
| Fase 18: 18.5 a 18.10 | Marcadas `[x]`, verificadas con ejecución real (sección 2) |
| Fase 18: 18.1 a 18.4 | Siguen `[ ]` por diseño (verificación manual M1 a M4) |
| Seguimiento F.1 y F.2 | Marcadas `[x]`; la regla `customer_has_future_appointments` existe en dominio, filtro HTTP, OpenAPI y pruebas |
| Verificación manual M1 a M5 | Reportada por el usuario como ejecutada y aprobada. No verificable por el verificador; no se cuenta como fallo. Los checkboxes 18.1 a 18.4 se dejan como están |

Nota: el apply-progress cita 528 pruebas de app y 1228 de api; la ejecución actual da 534 y 1238. La diferencia es coherente con los commits del seguimiento F.1 y F.2, posteriores a la fase 18.

## 2. Evidencia de ejecución (comandos reales)

| Comando | Resultado |
|---------|-----------|
| `npm test --prefix api` | exit 0. 72 archivos, 1238 pruebas pasan, 0 fallan (248 s, Testcontainers con Docker) |
| `npm test --prefix app` | exit 0. 40 archivos, 534 pruebas pasan |
| `npm run lint` api / app | exit 0 / exit 0 |
| `npm run typecheck` api / app | exit 0 / exit 0 |
| `npm run build` api / app | exit 0 / exit 0 |
| `npm run openapi:check --prefix api` | exit 0 |
| `npm run gen:api:check --prefix app` | exit 0 |
| `npm audit --prefix api` | 3 vulnerabilidades altas (kysely-codegen > micromatch > braces), dependencia de desarrollo, ya registrada en `debts.md` |
| `npm audit --prefix app` | 0 vulnerabilidades |
| Cobertura | No ejecutada: no hay herramienta de cobertura en el caché de capacidades. No es un fallo |

## 3. Cumplimiento de Strict TDD

| Verificación | Resultado | Detalle |
|--------------|-----------|---------|
| Tabla "TDD Cycle Evidence" en apply-progress | WARNING | La observación #799 (18 revisiones) describe el trabajo en prosa y no contiene la tabla RED / GREEN / TRIANGULATE / SAFETY NET. El módulo la clasifica como CRITICAL. Se degrada a WARNING porque el comportamiento está probado: `tasks.md` registra el RED esperado en cada tarea, hay un commit por unidad con sus pruebas, hay evidencia de mutación y todo pasa al ejecutarlo. Con lectura literal del módulo sería el único CRITICAL; se resuelve completando la tabla, sin tocar código |
| Archivos de prueba existen (RED) | OK | Los archivos citados en tasks.md existen (muestreo de fases 8, 9, 10 y 18) |
| GREEN | OK | 1238 + 534 pruebas pasan ahora |
| Triangulación | OK | `customers-erase.http.int-spec.ts` 19 casos; `schedule-changes.http.int-spec.ts` 46; `appointments-close.http.int-spec.ts` 25; `appointments-correct-closure.http.int-spec.ts` 21; `appointments-concurrency.http.int-spec.ts` 8 (2, 3 y 10 solicitudes simultáneas) |
| Evidencia de mutación | OK | Fase 18: `followup-policy` aceptando `pending` rompe 2 pruebas; quitar la anulación `closure_corrected` rompe 1; quitar `loadEnvFile` rompe 2 de 3 pruebas de arranque |
| Pruebas nacidas en verde | WARNING | Las 14 pruebas de `api/test/acceptance/sprint-1.acceptance.int-spec.ts` nacieron en verde (el comportamiento ya existía); declarado y compensado con mutación |

Auditoría de aserciones:

- `.only`, `.skip`, `xit`, `fit`: 0 coincidencias en `api/src`, `api/test`, `app/src`.
- Tautologías (`expect(true).toBe(true)`): 0.
- Bucles con aserciones: recorren colecciones fijas no vacías (`pwa-config.test.ts:39`, `error-messages.test.ts:84,95`, `seed.spec.ts:13`, `schedule-reader.int-spec.ts:74`). Sin ghost loops.
- `toBeDefined`/`toBeTruthy`/literales booleanos: 26 usos en 6 archivos (esquema de BD, OpenAPI, tokens). Son comprobaciones de existencia; SUGGESTION.

Distribución por capa: `app/` 534 pruebas de unidad y de componente (Vitest, Testing Library, MSW). `api/` 1238 pruebas: dominio puro (unitarias), integración con Postgres real (Testcontainers) y HTTP con supertest. No hay E2E de navegador (la verificación en navegador es manual).

## 4. Corrección frente a los specs

Una prueba cubre un escenario solo si pasó en la ejecución real de la sección 2. Los nombres de prueba están en español en el código.

### business-settings (4 requisitos)

| Requisito | Implementación | Prueba |
|-----------|----------------|--------|
| Negocio sembrado y multinegocio | `api/src/database/seed.ts`; FK compuestas `(business_id, x_id)` | `seed.spec.ts` (zona "Mars/Olympus" rechazada), `migrator.int-spec.ts`, `core-schema.int-spec.ts` |
| Zona horaria fija | `businesses.timezone`; el PATCH rechaza el campo | `business-settings.http.int-spec.ts` bloque "PATCH /business: zona horaria de solo lectura" (línea 112) |
| Buffer 0 a 240 | CHECK `businesses_travel_buffer_min_check`, `001_core_schema.ts:26`; DTO | `business-settings.http.int-spec.ts` (-5, 7.5, 241), `core-schema.int-spec.ts` |
| Hora de envío del seguimiento | `settings.followup_send_time`, default `09:00` (`001_core_schema.ts:23`) | `business-settings.http.int-spec.ts`; `followup-policy.spec.ts` "respeta una hora de envío distinta de 09:00" |

### service-catalog (4)

| Requisito | Prueba |
|-----------|--------|
| Alta y edición | `services.http.int-spec.ts` |
| Cambios no alteran citas | `appointments-move.http.int-spec.ts` "conserva dirección, precio y nombre del servicio aunque el catálogo haya cambiado"; `appointments-create.http.int-spec.ts` "conserva el buffer, el precio y el nombre del servicio vigentes al crear" |
| Retiro de servicios (sin DELETE) | `services.controller.ts` sin `@Delete`; `openapi.spec.ts` |
| Advertencia al cambiar duración | `services.http.int-spec.ts` (tarea 3.6) |

### technician-schedules (7)

| Requisito | Prueba |
|-----------|--------|
| Gestión de técnicos | `technicians.http.int-spec.ts` |
| Disponibilidad semanal | `schedule-changes.http.int-spec.ts`: "define el horario de lunes a viernes: guarda cinco franjas", "rechaza franjas solapadas del mismo técnico y día", "rechaza una franja con fin anterior al inicio" |
| Días libres | "sin citas: guarda el día libre...", "un día libre que solapa otro vigente responde schedule_overlap (409)" |
| Rechazo con citas afectadas (`schedule_conflict`) | "con dos citas confirmadas: rechaza con schedule_conflict, lista las dos y no guarda nada"; "reducir el martes a 08:00-14:00 con una cita a las 16:00 rechaza y lista esa cita" |
| Desactivar y reactivar | "desactivar con tres citas futuras rechaza...", "desactivar sin citas futuras...", "reactivar vuelve a dar cupos y asignaciones" |
| Eliminación con anonimización | `technician-erase.http.int-spec.ts`: alias aleatorio y único por negocio, "no persiste ninguna correspondencia entre la persona y el alias", bloqueo con `schedule_conflict`, historial con alias |
| Propuesta de reasignación (todo o nada, solo técnicos) | "acepta la propuesta: reasigna las dos citas...", "falla parcial: si el segundo destino quedó ocupado no se reasigna ninguna cita (slot_taken)", "conjunto cambiado: una cita nueva tras la vista previa responde proposal_stale", "nunca propone al técnico que cambia", "no propone técnicos inactivos ni anonimizados"; `plan-reassignments.spec.ts`; `schedule-changes-concurrency.http.int-spec.ts` (5 carreras) |

### slot-availability (6)

| Requisito | Prueba |
|-----------|--------|
| Cupos adaptativos y buffer | `slots.http.int-spec.ts` "ofrece 08:00 y 09:15 como primeros cupos (servicio 60, buffer 15)", "tras una cita 08:00-09:00 con buffer 15 el primer cupo libre es 09:15"; `generate-slots.spec.ts`; `generate-slots.property.spec.ts` |
| Bloque ocupado: todo estado no cancelado lo conserva | EXCLUDE `appointments_no_overlap` con condición `status <> cancelled` (`003_appointments.ts:56`); `slots.http.int-spec.ts` "no ofrece un cupo dentro del bloque de una cita completed ni no_show" y "ofrece de nuevo el cupo de una cita cancelada"; `appointments-schema.int-spec.ts`; `appointments-create.http.int-spec.ts` "una cita cerrada antes de tiempo conserva el resto del bloque" |
| Zona horaria y horario de verano | `zoned-clock.spec.ts`; `followup-policy.spec.ts` "convierte la hora local con el offset vigente en la fecha de envío (horario de verano)" |
| Asignación automática | `slots.http.int-spec.ts` "muestra cada inicio una sola vez con el técnico menos cargado", "ante carga igual asigna al técnico más antiguo"; `assign-technician.spec.ts` |
| Cupos para mover | `slots.http.int-spec.ts` (`excludeAppointmentId`, `preferredTechnicianId`, duración propia de la cita) |
| `slot_taken` frente a `slot_not_offered` | `appointments-move.http.int-spec.ts` "una colisión con otra cita responde slot_taken (409) antes que slot_not_offered"; `appointments-create.http.int-spec.ts` "rechaza una hora fuera de la grilla (08:40)"; `book-slot.spec.ts` |

### appointment-management (5)

| Requisito | Prueba |
|-----------|--------|
| Creación solo en cupos generados | `appointments-create.http.int-spec.ts` (confirmada con snapshots, fuera de grilla, cupo pasado, día libre, técnico o servicio inactivo, propiedades desconocidas como `status` o `buffer_min`) |
| Bloqueo absoluto de cruces | Restricción de BD + traductor `23P01` a `slot_taken` (`pg-error-translator.int-spec.ts`); "rechaza con slot_taken el solape por buffer: cita 10:00-11:00 con buffer 15 e intento a las 11:10"; `appointments-concurrency.http.int-spec.ts`; acceptance "una segunda cita en un bloque ocupado por el mismo técnico falla en SQL (23P01)" |
| Mover | `appointments-move.http.int-spec.ts`, `appointments-move-concurrency.http.int-spec.ts` |
| Reasignación manual | `appointments-reassign.http.int-spec.ts` (destino ocupado, inactivo, anonimizado, sin disponibilidad, con día libre: todos `slot_taken`) |
| Cancelación | `appointments-cancel.http.int-spec.ts`; acceptance "recorrido completo: crear en un cupo ofrecido, mover a otro, cancelar y liberar el cupo" |

Candado del negocio: `api/src/scheduling/infrastructure/persistence/business-lock-executor.ts:23` ejecuta `SELECT id FROM businesses WHERE id = ... FOR UPDATE` antes de cada comando de escritura.

### customer-records (9 requisitos, incluido el nuevo)

| Requisito | Prueba |
|-----------|--------|
| Creación con E.164 | `phone.spec.ts`, `customers.http.int-spec.ts` |
| Anonimización en sitio | `customers-erase.http.int-spec.ts`: "responde 204, conserva el id y reemplaza los datos personales", "no deja ningún dato personal original en ninguna tabla", "dos clientes anonimizados tienen teléfonos marcador distintos que no son E.164", "repetir la eliminación responde 204 y no cambia ningún dato", "la misma persona se registra como cliente nuevo con consentimiento pendiente" |
| Cliente con citas futuras activas no se suprime | Mismo archivo: "responde 409 customer_has_future_appointments con las citas afectadas y no cambia nada", "tras cancelar las citas futuras, la eliminación se completa", "una reserva que compite con la eliminación nunca deja una cita futura en un cliente anonimizado", "las citas canceladas, cerradas o pasadas no bloquean". Código: `scheduling/domain/errors.ts:157`, `problem-details.filter.ts:26` (409) |
| Autorización previa | `customers-consent.http.int-spec.ts` (medio obligatorio, evento inmutable, fecha futura rechazada) |
| Dirección guardada | `appointments-create.http.int-spec.ts` "actualiza la dirección guardada del cliente cuando se edita al agendar", "la cita conserva su dirección cuando el cliente cambia la suya después" |
| Revocación | `customers-consent.http.int-spec.ts` "cancela el seguimiento pendiente con consent_revoked y conserva ficha y citas", "un nuevo consentimiento tras revocar reactiva el seguimiento cuya fecha no pasó" |
| Sin mensajes sin consentimiento (trigger) | Trigger `004_scheduled_messages.ts:64`; `scheduled-messages-schema.int-spec.ts`; acceptance "la base de datos rechaza un seguimiento pendiente para un cliente sin consentimiento"; "un cliente con historial que nunca consintió no tiene filas en scheduled_messages" |
| Consentimiento tardío (relleno) | "crea el seguimiento: fecha de completado más el intervalo a las 09:00 de Bogotá", "evalúa solo la última cita completada de cada servicio", "no crea seguimiento si la fecha de envío ya pasó", "es idempotente: repetir el consentimiento no crea una segunda fila", "dos consentimientos simultáneos dejan una sola fila de seguimiento" |
| Historial | `customers.http.int-spec.ts` (orden descendente con snapshots) |

### service-closure (5)

| Requisito | Prueba |
|-----------|--------|
| Cierre con confirmación explícita | `appointments-close.http.int-spec.ts` "no cierra por el paso del tiempo: tres días después la cita sigue confirmada", "marca no asistió sin completed_at y sin crear seguimiento" |
| Cierre anticipado auditado | "cierra con motivo y confirmación reforzada, y audita quién, cuándo y por qué", "pide el motivo antes que la confirmación reforzada", "el bloque sigue ocupado..." |
| Seguimiento al completar (09:00 local) | "programa un único seguimiento pendiente a la fecha de completado más 180 días, a las 09:00", "usa la fecha local del negocio, no la fecha UTC...", "una nueva finalización reemplaza el seguimiento pendiente anterior como superseded", "no crea seguimiento si el cliente tiene una cita futura confirmada del mismo servicio" |
| Corrección, incluido volver a `confirmed` | `appointments-correct-closure.http.int-spec.ts`: "devuelve una completada a confirmada, anula el seguimiento y limpia el cierre", "devuelve una cita no asistida a confirmada y su bloque sigue ocupado", "recalcula el seguimiento pendiente a 2027-02-03 sin duplicarlo", "alternar varias veces nunca deja más de un seguimiento activo ni filas duplicadas" |
| Canceladas no se reabren | `appointments-close.http.int-spec.ts` "una cita cancelada indica crear una cita nueva"; `appointment-status.spec.ts` |

### owner-agenda-ui (7)

| Requisito | Prueba / implementación |
|-----------|--------------------------|
| Shell de PWA instalable y pantalla sin conexión | `app/src/pwa-config.test.ts` y pruebas del componente "Sin conexión" y del hook de conectividad; `npm run build` genera `sw.js`. Instalación y offline real: reportado por el usuario (M5), no verificable |
| Interfaz en español | `app/src/shared/lib/error-messages.test.ts` (traducción de todo código documentado; sin voseo) |
| Agenda propia día/semana, sin arrastrar ni librería de calendario | `AgendaGrid.test.tsx` (26 casos: "muestra los siete días con las citas agrupadas por técnico", "arrastrar una cita no dispara callbacks ni la mueve de columna", "limita las columnas al técnico elegido y vuelve a mostrar todas"); `app/package.json` sin dependencias de calendario ni de arrastrar y soltar |
| Diálogos basados en cupos | `CreateAppointmentDialog.test.tsx` (mensaje "Cupo ocupado", recarga de cupos y opción de elegir otro), `MoveAppointmentDialog.test.tsx`, pruebas de cancelar y reasignar |
| Pantallas de configuración | `app/src/features/settings/*.test.tsx`, `ScheduleConflictDialog.test.tsx` |
| Clientes y cierre | Pruebas de las fases 16 y 17, incluido el diálogo de eliminación con citas afectadas (F.2) |
| Contrato tipado | `gen:api:check` y `openapi:check` en verde; `api/src/openapi/openapi.spec.ts` |

Resultado: 0 requisitos sin implementación y 0 requisitos sin prueba que pase. El comportamiento en navegador (instalación, offline real, 44 px, carrera con dos pestañas) solo tiene verificación manual, reportada por el usuario.

## 5. Coherencia con el diseño

| Decisión de diseño | Resultado |
|--------------------|-----------|
| Dominio hexagonal puro | OK. Búsqueda de imports de `@nestjs`, `kysely`, `pg`, `express` y `luxon` en `api/src/scheduling/domain`: única coincidencia `domain/time/zoned-clock.ts:1` (`luxon`) |
| Módulos CRUD planos | OK. `modules/business-settings`, `services`, `technicians`, `customers` |
| Candado del negocio en cada escritura | OK. `business-lock-executor.ts`; 4 archivos de concurrencia |
| Errores problem+json | OK. `problem-details.filter.ts` y su spec |
| OpenAPI versionado y sincronizado | OK. `openapi:check` y `gen:api:check` exit 0 |
| Independencia de `api/` y `app/` | OK. Cada una con su `package.json` y su lockfile; la app solo lee `../api/openapi.json` al generar el cliente |
| Soft delete de datos operativos | OK. Sin `DELETE` de servicios, citas ni disponibilidad (`openapi.spec.ts`) |
| Zona horaria fija | OK. Rechazo del campo en PATCH; conversión solo en `zoned-clock.ts` |

## 6. Desviaciones y decisiones documentadas

| Desviación | Juicio |
|------------|--------|
| Sin plugin CLI de swagger; decoradores explícitos | Aceptable. Documentada en tasks 11.1; el documento no depende de cómo se ejecute |
| `slot_taken` antes que `slot_not_offered` | Aceptable. Es lo que exige el requisito de diferenciación, con prueba |
| `correction_reason_required` en toda corrección | WARNING. Más estricto que el spec, que exige motivo al reabrir; alinear spec y código al archivar |
| Cuerpos snake_case y consultas camelCase | SUGGESTION. Coherente en todo el proyecto; documentar la convención en el diseño |
| `DELETE /technicians/:id` responde 200 con cuerpo (mientras `DELETE /customers/:id` responde 204) | WARNING. No viola un spec, pero es una asimetría de contrato que no figura en `debts.md` ni en el diseño |
| Diálogo de reasignación lista todos los técnicos y se apoya en `slot_taken` | Aceptable. Está en `debts.md`; el spec solo exige rechazo con `slot_taken` |
| Precio mostrado en COP | SUGGESTION. Coherente con `America/Bogota`; documentar como supuesto |
| Filtro por técnico siempre visible | Aceptable. El spec no lo prohíbe; hay prueba de que no se muestra con un solo técnico |
| Ventana visible por defecto 07:00 a 19:00 | SUGGESTION. Una cita fuera de la ventana se omite de la agenda (prueba "omite una cita fuera de la ventana visible"); derivar la ventana de la disponibilidad o avisar. No figura en `debts.md` |
| Revocación con interfaz (tarea 16.5) | Aceptable. Reflejada en `design.md` y `user-stories.md`; `proposal.md` no la menciona y no la contradice |

Exactitud de `debts.md`: coincide con lo observado (3 hallazgos altos de `npm audit` en `api/`, 0 en `app/`; `bootstrap.int-spec.ts` no ejecuta `node dist/main.js`; verificación de navegador solo manual). Faltan: la respuesta 200 con cuerpo de `DELETE /technicians` y la ventana horaria visible por defecto.

## 7. Controles de calidad

| Control | Resultado |
|---------|-----------|
| Código de depuración | Solo `console.log` en los CLI de utilidad `api/src/database/cli.ts` y `api/src/openapi/cli.ts`; aceptable |
| TODO / FIXME / HACK | 0 en `api/src`, `api/test`, `app/src` |
| `.only` / skip | 0 |
| Secretos | Solo credenciales locales de desarrollo (`schedule:schedule@localhost`) en README y pruebas, y cadenas ficticias en pruebas de arranque. Sin secretos reales |
| `.env` en git | `git ls-files` lista solo `api/.env.example` y `app/.env.example` |
| CRLF en blobs | `git ls-files --eol`: 0 archivos con `i/crlf` |
| `api/package-lock.json` | Figura modificado solo por ruido de autocrlf: `git diff --numstat` no devuelve filas. No se debe preparar para commit |
| `openspec/backlog.md` | Sin seguimiento en git (untracked); decidir si se versiona |
| Historial de commits | 25 commits desde `main` con conventional commits por unidad de trabajo. Búsqueda de `co-authored`, `claude`, `anthropic` y `generated with` en los mensajes: 0 coincidencias |
| Datos personales en fixtures | No se hallaron datos reales; los teléfonos de prueba son ficticios |

## 8. Issues

### CRITICAL (0)

Ninguno.

### WARNING (5)

1. El apply-progress (#799) no contiene la tabla "TDD Cycle Evidence" que exige el módulo Strict TDD. La evidencia existe de forma dispersa. Acción: añadir la tabla o registrar la excepción antes de archivar. Por lectura literal sería CRITICAL.
2. `DELETE /technicians/:id` responde 200 con cuerpo y `DELETE /customers/:id` 204; asimetría no documentada.
3. `correction_reason_required` exigido en toda corrección, más estricto que el texto del spec de `service-closure`.
4. Las pruebas de aceptación de la fase 18 nacieron en verde; compensado con mutación, pero el RED no se observó directamente.
5. La verificación en navegador (instalación PWA, offline, 44 px, dos pestañas) es reportada por el usuario y no verificable aquí; 18.1 a 18.4 siguen sin marcar.

### SUGGESTION (5)

1. Reforzar las aserciones de existencia (`toBeDefined`/`toBeTruthy`, 26 usos en 6 archivos) con valores concretos.
2. La ventana visible por defecto 07:00 a 19:00 puede ocultar citas; derivarla de la disponibilidad.
3. Documentar la convención snake_case/camelCase en `design.md`.
4. Documentar que los precios se muestran en COP.
5. Decidir si `openspec/backlog.md` se versiona.

## 9. Conclusión

La implementación cumple los 8 specs, el diseño y las tareas. Todos los comandos pasan con los conteos de la sección 2. Sin CRITICAL bajo el criterio aplicado; el único punto que escalaría con lectura literal del módulo Strict TDD es la ausencia de la tabla de evidencia en el apply-progress. Siguiente paso: sdd-archive.
