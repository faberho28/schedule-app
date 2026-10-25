# Propuesta: Sprint 2 - Panel del dueño para escritorio

## Intención (Intent)

El sprint 1 entregó una PWA pensada para el celular: barra inferior, agenda con una columna por técnico y un filtro de un solo técnico. Al probarla, el dueño esperaba un panel administrativo de escritorio, y la grilla de una columna por técnico no funciona con 10 a 20 técnicos. Este sprint convierte la PWA en un panel del dueño que funciona en escritorio y con muchos técnicos. Toma la estructura del mockup de referencia (OpsSchedule), pero conserva la identidad del producto. El éxito significa que el dueño ve el estado del día en un panel de control, opera la agenda de muchos técnicos en una sola grilla de tiempo y encuentra cualquier servicio o cliente desde la agenda, sin perder ninguno de los flujos del sprint 1.

## Alcance (Scope)

### Dentro del alcance (In Scope)

- **Identidad:** "Schedule App", primario azul alrededor de `#2563EB`, neutros slate de los tokens existentes (la barra lateral oscura usa tokens slate), colores semánticos de estado siempre con texto, contraste AA verificado por prueba, temas claro y oscuro, objetivos táctiles de 44 px, español neutro con tuteo.
- **Vocabulario de la interfaz:** "cita" pasa a "servicio" ("Nuevo servicio", "Servicios pendientes", "Cancelar servicio", "Buscar servicio o cliente"). El catálogo se llama "Tipos de servicio". Código, rutas de la API, base de datos y OpenAPI conservan `appointment` y `services`. Se migra todo el texto de la interfaz del sprint 1 y la documentación (`app/README.md`).
- **Shell:** desde 1024 px, barra lateral oscura con 7 secciones en este orden: Panel de control, Agenda, Clientes, Técnicos, Tipos de servicio, Configuración (datos del negocio: buffer y hora de envío del seguimiento) y Perfil al pie. Se contrae a íconos en anchos intermedios. Por debajo de 1024 px se mantiene la barra inferior. Sin entradas para funciones que no existen.
- **Panel de control:** cuatro tarjetas y una lista corta.
  - "Servicios hoy": servicios del día sin contar los cancelados.
  - "Técnicos activos X/Y": Y = técnicos activos (ni desactivados ni eliminados); X = los que trabajan hoy: su horario semanal cubre hoy y ningún día libre cubre todo su turno de hoy. Un día libre que cubre todo su turno (aunque no dure 24 horas, por ejemplo turno 08:00-17:00 con día libre 07:00-18:00 o igual al turno) lo saca de X; un día libre que deja libre cualquier parte del turno (12:00-13:00) sigue contando; un técnico sin horario hoy no cuenta en X.
  - "Eficiencia de servicios": completados sobre los servicios que debían cerrarse en los últimos 30 días, sin contar cancelados, con la fecha de corte visible.
  - "Servicios pendientes": solo servicios `confirmed` cuya hora de inicio ya pasó y siguen sin cerrar, de cualquier fecha. `pending` no cuenta; se decide en el sprint del bot. Enlaza a la lista de la agenda con el filtro nuevo "Por cerrar", que usa la consulta nueva `GET /agenda/to-close` (misma definición).
  - Lista "Servicios de hoy": los que faltan del día, por hora, sin cancelados, con cliente, tipo de servicio y técnico. Incluye los `pending` y `confirmed` de hoy que aún no empiezan y los que ya empezaron y siguen sin cerrar. Tocar uno abre la agenda en ese día con su ficha. Nota: sus estados (`pending` + `confirmed` de hoy) difieren a propósito de los de "Servicios pendientes" (solo `confirmed`, cualquier fecha).
  - Sin gráficos ni listas de seguimiento.
- **Navegación de entrada:** la raíz `/` abre el Panel de control en escritorio y en móvil. En móvil el Panel de control es la vista principal: cada pantalla a la que se llega desde él tiene un botón para volver. Perfil se abre desde el Panel (por ejemplo, un ícono en su encabezado) y también tiene ese botón. La barra inferior tiene cinco entradas: Panel, Agenda, Clientes, Técnicos y "Más" (que abre Tipos de servicio y Configuración); Perfil no aparece.
- **Agenda en móvil (menos de 1024 px):** lista cronológica del día (desempate por técnico), filtros combinables en chips (técnico, estado, tipo de servicio, "Por cerrar"), canceladas ocultas por defecto con un interruptor. Cada fila muestra inicio-fin, cliente, tipo de servicio, técnico y estado (texto y color).
- **Agenda en escritorio:** una sola grilla de tiempo por día, al estilo de Google Calendar, y el mismo modelo en la semana.
  - Los servicios simultáneos se muestran lado a lado.
  - Un color por técnico (paleta de 10). La tarjeta muestra el nombre o las iniciales del técnico y el estado con ícono y texto.
  - Un selector con casillas de color elige a los técnicos visibles: máximo 10, por defecto los 10 más antiguos, y la selección se recuerda en el navegador (por dispositivo).
  - Las horas visibles salen de la disponibilidad de los técnicos elegidos. Reemplazan la ventana fija de 07:00 a 19:00 (deuda A).
  - Cuando coinciden más servicios de los que caben en una franja, la grilla muestra un botón "+N más" que abre la vista de lista (la misma de móvil) filtrada por ese día y esa franja. El umbral es de 6 columnas en Día y 2 en Semana (diseño D19).
  - Sin franja de almuerzo, sin sombrear horas no laborables, sin vista Mes y sin arrastrar y soltar.
  - Se mantienen Día/Semana, la navegación de fechas, "Hoy" y "Nuevo servicio".
- **Búsqueda global:** el campo "Buscar servicio o cliente" de la barra de la agenda usa un endpoint nuevo.
  - Busca clientes por nombre o teléfono, y servicios por cliente, tipo de servicio o técnico, en todas las fechas.
  - Muestra dos grupos ("Clientes", "Servicios") de hasta 10 resultados cada uno, con consulta de 2 a 100 caracteres y pausa al escribir. Los servicios se ordenan por cercanía en días calendario a hoy, luego los no cancelados primero, luego la hora de inicio y luego el identificador; el tope de 10 se aplica después de ordenar.
  - No distingue acentos.
  - Privacidad: el grupo "Clientes" nunca lista clientes anonimizados. El grupo "Servicios" sí puede incluir servicios de clientes anonimizados (mostrados con su alias y encontrados solo por técnico o tipo de servicio, nunca por el nombre original) y servicios de técnicos eliminados (mostrados con su alias).
  - Un cliente abre su ficha. Un servicio abre la agenda en su día con su ficha.
- **Cliente anonimizado en las respuestas de servicios:** hoy la API guarda el alias también en `customers.name` y la vista de servicios devuelve ese valor como nombre, por lo que la interfaz muestra `bear_1` en lugar de "Cliente eliminado (bear_1)". En este sprint la consulta de vista de servicios devuelve `customer.name = null` (con un `CASE` sobre `anonymized_at`) y el alias aparte, y la interfaz muestra "Cliente eliminado (alias)" con el formateador compartido (`customerLabel`, base de `customerRecordLabel`) en la grilla y la lista de la agenda, los resultados de búsqueda, "Servicios de hoy", la ficha y los diálogos. El esquema OpenAPI ya admitía `name` nulo; se regeneran `api/openapi.json` y el cliente generado.
- **Búsqueda de clientes sin acentos (deuda del sprint 1):** la misma normalización se aplica a `GET /customers?search=`, que usan la pantalla Clientes y el selector de cliente de "Nuevo servicio".
- **Técnicos libres en un horario exacto (deuda B):** endpoint nuevo que el diálogo de reasignar usa para listar solo a los técnicos que pueden atender el servicio.
- **Perfil simulado:** pantalla (`/profile`) con un nombre genérico ("Dueño del negocio"). El mock vive en un solo archivo marcado como mock; una prueba de guarda falla si algo fuera de `features/profile` lo importa o si pierde su marcador. Se registra en `debts.md` y como tarea de la fase de autenticación, y no debe llegar a producción antes de que exista un login completo.

### Fuera del alcance (Out of Scope)

- Reportes, vista Mes, Exportar PDF/Excel.
- Autenticación y roles (y por eso un Perfil real).
- WhatsApp, bot, fecha del seguimiento en la respuesta del servicio (deuda C, para el sprint del bot).
- Recaudo y precio acordado (`openspec/backlog.md`), pagos.
- Notificaciones push, arrastrar y soltar, caché sin conexión.

## Capacidades (Capabilities)

### New Capabilities

- `dashboard`: Panel de control con las cuatro tarjetas, sus definiciones (ventanas, exclusiones, división por cero), la lista "Servicios de hoy" y la consulta `GET /agenda/to-close` (sexta lectura nueva de la API), que comparte la definición de "Servicios pendientes".
- `global-search`: endpoint y desplegable de búsqueda de clientes y servicios, sin distinguir acentos, con límites, orden y reglas de privacidad (clientes anonimizados fuera del grupo "Clientes"; alias en el grupo "Servicios").
- `technicians-free-at-slot`: consulta de los técnicos activos libres en un inicio y una duración exactos, con las mismas reglas que la reasignación manual.
- `profile-mock`: pantalla de Perfil simulada y sus salvaguardas para que no llegue a producción.

### Modified Capabilities

- `owner-agenda-ui`:
  - "Agenda día y semana por técnico" se reemplaza por la grilla única con colores por técnico, el selector de hasta 10, las horas derivadas de la disponibilidad y la lista en móvil con filtros, incluido "Por cerrar".
  - "Interfaz en español" agrega el vocabulario "servicio" / "Tipos de servicio".
  - "Diálogos de cita basados en cupos" cambia la reasignación para que liste solo técnicos libres y agrega la apertura de un servicio por enlace.
  - Se agrega la navegación lateral de 7 secciones, la barra inferior de cinco entradas con "Más", la entrada por el Panel de control (`/`) con botón para volver en móvil, y el botón "+N más" de la grilla.
  - Se agrega el requisito de cliente anonimizado en las respuestas de servicios y en la interfaz ("Cliente eliminado (alias)"). `openspec/specs/appointment-management` no define la forma del cliente en las respuestas, así que el requisito se agrega como ADDED en este delta y el cambio de API se describe en el diseño (D17).
  - Se agrega el abrir un servicio por el parámetro `appointment` y la lista "Por cerrar" (todas las fechas) que usa `GET /agenda/to-close`.
- `customer-records`: se agrega la búsqueda de clientes por nombre o teléfono sin distinguir acentos en `GET /customers?search=` (hoy no hay un requisito de búsqueda en la spec).
- Sin cambios de requisitos en `appointment-management`, `slot-availability`, `technician-schedules`, `service-closure`, `service-catalog` ni `business-settings`. Las capacidades nuevas de la API solo leen; la única corrección a una lectura existente es el nombre nulo del cliente anonimizado en la vista de servicios.

## Enfoque (Approach)

- **Punto de partida real:**
  - `AppLayout.tsx` tiene un encabezado y una barra inferior de 5 entradas ("Agenda", "Clientes", "Servicios", "Técnicos", "Negocio"). `/` redirige a `/agenda`.
  - `AgendaGrid.tsx` dibuja una columna por técnico, `agenda-layout.ts` fija 07:00-19:00 en `visibleHoursFor` y `packOverlaps` ya reparte bloques solapados.
  - `AppointmentFlows.tsx` abre los diálogos desde la agenda, pero la agenda no abre una cita por su identificador.
  - "cita" aparece unas 400 veces en 56 archivos de `app/src`, incluidas pruebas y `schema.d.ts` (generado: no se toca a mano).
- **Shell:** el layout pasa a ser adaptable (barra lateral o barra inferior según el ancho). Las rutas existentes se conservan y se suman Panel de control y Perfil; `/` deja de redirigir a `/agenda` y abre el Panel de control. Las pruebas de `AppLayout` y `routes` se actualizan primero (TDD estricto).
- **Agenda:** `AgendaPage` elige entre la lista (móvil) y la grilla única (escritorio). `agenda-layout.ts` evoluciona a funciones puras con pruebas (solapes en columnas, horas desde la disponibilidad, paleta por técnico). La URL suma un parámetro para abrir la ficha de un servicio y el filtro "Por cerrar". Los diálogos de `features/appointments` se conservan, y solo cambian su texto y la reasignación.
- **API:**
  - Las consultas nuevas viven en `scheduling/application` como casos de uso de solo lectura con puertos. Técnicos libres reutiliza `isTechnicianFree` del dominio puro.
  - La búsqueda vive como consulta de lectura. El diseño eligió `unaccent` con una función `immutable_unaccent` y `pg_trgm` (D13), con su migración de bajada. `GET /customers?search=` usa la misma normalización.
  - Toda ruta nueva sigue el flujo documentado: DTO y `*.schema.ts`, `@ApiProblems`, luego `npm run openapi:export --prefix api` y `npm run gen:api --prefix app`, y los archivos generados se versionan en el mismo commit. `openapi:check` y `gen:api:check` vigilan el desfase.
- **Vocabulario:** la migración del texto se hace en una unidad de trabajo propia, con una prueba de guarda que recorre el texto visible (o el código fuente de `app/src`, sin contar `schema.d.ts` ni los identificadores) y falla ante "cita" en la interfaz y ante formas de voseo frecuentes. Los identificadores en inglés no cambian.

## Áreas afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `app/src/app/AppLayout.tsx`, `routes.tsx` | Modificado | Barra lateral adaptable, rutas de Panel de control y Perfil |
| `app/src/features/agenda/` | Modificado | Lista móvil, grilla única, selector, filtros, horas visibles, búsqueda |
| `app/src/features/appointments/` | Modificado | Texto "servicio", reasignación con técnicos libres |
| `app/src/features/dashboard/`, `features/profile/` | Nuevo | Panel de control, Perfil simulado |
| `app/src/features/{customers,settings}/`, `shared/lib/error-messages.ts` | Modificado | Vocabulario y nombres de secciones |
| `app/src/index.css`, `app/src/theme/tokens.test.ts` | Modificado | Paleta de 10 técnicos y tokens de la barra lateral con prueba AA |
| `api/src/scheduling/` | Nuevo / Modificado | Consultas de técnicos libres, búsqueda, indicadores, horas visibles y `GET /agenda/to-close`; la vista de servicios devuelve el nombre del cliente anonimizado como nulo |
| `api/src/modules/customers/` | Modificado | `GET /customers?search=` sin distinguir acentos |
| `api/src/database/migrations/` | Nuevo | Extensión o normalización para acentos e índices de búsqueda |
| `api/openapi.json`, `app/src/shared/api/schema.d.ts` | Modificado | Contrato regenerado |
| `app/README.md`, `api/README.md` | Modificado | Documentación de pantallas, endpoints y vocabulario |
| `openspec/changes/sprint-2-owner-panel/debts.md` | Nuevo | Perfil simulado como deuda |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Grilla ilegible con muchos servicios simultáneos y 10 técnicos | Alta | Tope de 10 técnicos; botón "+N más" que abre la lista filtrada por día y franja (el diseño fija el umbral por celda); pruebas puras de `packOverlaps` con 10 solapes |
| El color como única señal; contraste AA de 10 colores en claro y oscuro | Media | Nombre o iniciales y estado con texto en cada tarjeta; la paleta es un token con prueba AA en ambos temas |
| Búsqueda lenta o que distingue acentos en Postgres | Media | `unaccent` o columna normalizada con índice (`pg_trgm`), mínimo de 2 caracteres, límite de 10 por grupo y prueba de integración con "maria" / "María" |
| Fuga de datos personales en la búsqueda | Media | El grupo "Clientes" excluye anonimizados; en "Servicios" los anonimizados solo coinciden por técnico o tipo de servicio y se muestran con alias (el nombre original ya no existe en la base); pruebas para ambos grupos; la respuesta devuelve solo los campos necesarios |
| Zona horaria y cambio de horario en "hoy" y en la ventana de 30 días | Media | Calcular en la API con la zona del negocio en un solo lugar (`zoned-clock`); pruebas con reloj fijo |
| "Eficiencia" sin servicios que cerrar (división por cero) | Media | La spec define un estado vacío ("Sin datos") en lugar de 0 % o 100 % |
| Confusión entre "servicio" y "tipo de servicio" | Media | Glosario en la spec y prueba de guarda del vocabulario; "Tipos de servicio" siempre con su nombre completo |
| El Perfil simulado llega a producción | Baja | Mock en un solo archivo marcado, prueba de guarda de importaciones y marcador, registrado en `debts.md` y como tarea de autenticación |
| La interfaz muestra el alias como nombre de un cliente anonimizado (`bear_1`) | Alta (existente) | **Resuelto en este sprint:** la vista de servicios devuelve `customer.name` nulo con un `CASE` sobre `anonymized_at` y la interfaz formatea "Cliente eliminado (alias)"; pruebas de API y de interfaz (agenda, búsqueda, Panel) |
| Regresiones en flujos del sprint 1 | Media | Las pruebas existentes de diálogos, cierre y clientes siguen activas (solo cambian textos); prueba de aceptación de la API sin cambios |
| Más peticiones al cargar la disponibilidad de 10 técnicos | Media | Resuelto: endpoint agregado `GET /agenda/visible-hours` (una sola petición para hasta 10 técnicos) |
| Navegación móvil centrada en el Panel desorienta al volver | Baja | Botón para volver en cada pantalla alcanzada desde el Panel, con prueba de rutas |

## Plan de reversión (Rollback)

La rama `feat/sprint-2-owner-panel` sale de `feat/sprint-1-owner-pwa` y no está en `main`. Cada unidad de trabajo es un commit que se puede revertir por separado. La migración de búsqueda trae su bajada (`npm run db:rollback --prefix api`) y no modifica datos existentes. El vocabulario es solo texto de la interfaz. Revertir el sprint completo es volver a la punta de `feat/sprint-1-owner-pwa`.

## Dependencias

- Sprint 1 integrado en la rama base (aún sin fusionar en `main`).
- Extensiones `unaccent` y `pg_trgm` disponibles en `postgres:16-alpine` (el diseño las da por incluidas en `contrib` y la primera prueba de migración lo confirma).

## Criterios de éxito

- [ ] Desde 1024 px se ve la barra lateral con las 7 secciones en el orden acordado; por debajo, la barra inferior (Panel, Agenda, Clientes, Técnicos y "Más", sin Perfil) y la agenda en lista de un solo día.
- [ ] `/` abre el Panel de control en escritorio y en móvil; en móvil, las pantallas alcanzadas desde el Panel y el Perfil tienen botón para volver.
- [ ] Ningún texto visible usa "cita"; el catálogo se llama "Tipos de servicio"; una prueba lo vigila junto con el voseo.
- [ ] El Panel de control muestra las cuatro tarjetas con las definiciones acordadas (cancelados fuera de "Servicios hoy", un día libre que cubre todo el turno de hoy saca al técnico de X y uno parcial no, caso sin datos de "Eficiencia" y fecha de corte) y la lista "Servicios de hoy" sin cancelados, con los que aún no empiezan y los ya empezados sin cerrar.
- [ ] "Servicios pendientes" cuenta solo `confirmed` con inicio pasado y lleva a la lista de la agenda con "Por cerrar" aplicado, con los mismos servicios (`GET /agenda/to-close`).
- [ ] Un cliente anonimizado se muestra como "Cliente eliminado (alias)" en la agenda, la búsqueda, el Panel, la ficha y los diálogos.
- [ ] La grilla de escritorio muestra a hasta 10 técnicos elegidos, con color, iniciales y estado en texto; la selección sobrevive a recargar la página.
- [ ] Las horas visibles salen de la disponibilidad de los técnicos elegidos y ningún servicio queda fuera de la vista.
- [ ] Cuando no caben todos los servicios de una franja, "+N más" abre la lista de ese día y franja.
- [ ] "maria" encuentra a "María" en la búsqueda global y en `GET /customers?search=`; el grupo "Clientes" no lista anonimizados; en "Servicios" los anonimizados y los técnicos eliminados aparecen solo con alias; cada resultado abre la ficha o el servicio correctos.
- [ ] El diálogo de reasignar solo lista técnicos libres en ese horario exacto.
- [ ] Todos los colores nuevos pasan la prueba AA en tema claro y oscuro.
- [ ] `openapi:check` y `gen:api:check` pasan; las pruebas de `api/` y `app/` pasan.

## Estimación de carga de revisión (Review Workload Forecast)

- Líneas cambiadas estimadas: 6.500-8.500 (sin lockfiles ni archivos generados), según el diseño. Subió desde 5.500-7.500 por la consulta `to-close`, el puerto de lectura y el vocabulario.
- Estrategia de entrega: `exception-ok`. La guarda no detiene la implementación; se mantienen 14 commits por unidad de trabajo, cada uno con sus pruebas, con los 5 de la API primero.
- Decision needed before apply: No
- Chained PRs recommended: No
- 400-line budget risk: High
- Unidades de trabajo (diseño D24, el orden final lo confirma `sdd-tasks`):
  1. API: migración 005, `text-search.ts` y `GET /customers?search=` sin acentos.
  2. API: `workingRangesOn` y `GET /appointments/:id/free-technicians`.
  3. API: `GET /agenda/visible-hours`.
  4. API: `AgendaReadModel`, `GET /dashboard/summary` y `GET /agenda/to-close`.
  5. API: `GET /search` y nombre nulo del cliente anonimizado en la vista de servicios.
  6. App: migración del vocabulario y prueba de guarda.
  7. App: paleta, tokens con AA y colores de técnicos.
  8. App: shell (`Sidebar`, `BottomNav` con "Más", `PageHeader` con "Volver"), Perfil simulado, guarda y `debts.md`.
  9. App: parámetros de la agenda y enlace a un servicio.
  10. App: lista de la agenda, chips, "Por cerrar" e interruptor de cancelados.
  11. App: grilla única, "+N más", selector y horas visibles.
  12. App: Panel de control en `/`.
  13. App: búsqueda global.
  14. App: reasignación con técnicos libres.

## Ronda de preguntas de la propuesta

Hecha con el usuario antes de esta fase (engram `decision/sprint-2-question-round`, `decision/sprint-2-question-round-final`, `decision/sprint-2-panel-content`, `decision/sprint-2-identity-rule`). Las decisiones están reflejadas arriba y no se reabren.

## Decisiones resueltas tras la propuesta

Respuestas del usuario a las preguntas abiertas de la primera versión. Ya están reflejadas en el alcance, las capacidades y los criterios de éxito.

1. **Cancelados:** "Servicios hoy" no cuenta los cancelados y la lista "Servicios de hoy" tampoco los muestra. La lista incluye los servicios que aún no empiezan y los que ya empezaron y siguen sin cerrar (confirmado por el usuario).
2. **Día libre y "Técnicos activos":** el técnico sigue contando como que trabaja hoy en X mientras algún tramo de su turno de hoy quede libre. Un día libre que cubre todo su turno de hoy lo saca de X, aunque no dure 24 horas; un técnico sin horario hoy tampoco cuenta en X.
3. **Entrada y navegación móvil:** `/` abre el Panel de control en escritorio y en móvil. En móvil el Panel es la vista principal, y cada pantalla alcanzada desde él tiene un botón para volver. Perfil se abre desde el Panel (por ejemplo, un ícono en su encabezado), también con ese botón, y no es una entrada de la barra inferior. La barra inferior tiene Panel, Agenda, Clientes, Técnicos y "Más" (Tipos de servicio y Configuración).
4. **Privacidad en la búsqueda:** el grupo "Clientes" nunca lista clientes anonimizados. El grupo "Servicios" puede incluir servicios de clientes anonimizados (con alias, encontrados por técnico o tipo de servicio, nunca por el nombre original) y de técnicos eliminados (con alias). Esto precisa la regla "los clientes anonimizados nunca aparecen", que aplica al grupo "Clientes".
5. **Acentos en clientes:** la búsqueda sin acentos también se aplica a `GET /customers?search=` (pantalla Clientes y selector de cliente). Resuelve la deuda del sprint 1.
6. **Desborde de la grilla:** cuando coinciden más servicios de los que caben, la grilla muestra "+N más", que abre la vista de lista de ese día y franja (la misma lista de móvil, filtrada). El umbral por celda es un detalle del diseño.

7. **Indicadores del Panel:** salen de un **endpoint nuevo de resumen**. "Eficiencia de servicios" sobre 30 días y "Técnicos activos" (disponibilidad y días libres de todos los técnicos) no se resuelven bien con los endpoints existentes. Su forma exacta está en el diseño (D12): `GET /dashboard/summary`, con la zona horaria del negocio.
8. **Técnicos libres:** el endpoint **recibe el identificador del servicio**, no el inicio y la duración. Así excluye el bloque del propio servicio al calcular quién está libre y sirve al diálogo de reasignar.
9. **Horas visibles de la grilla:** se cargan con un **endpoint agregado**, no con una petición por técnico. Su forma exacta está en el diseño (D15): `GET /agenda/visible-hours`.
10. **Servicios pendientes solo `confirmed`:** la tarjeta, la lista "Por cerrar" y `GET /agenda/to-close` cuentan solo `confirmed` con inicio pasado y sin cerrar. `pending` se decide en el sprint del bot. La lista "Servicios de hoy" conserva `pending` y `confirmed` de hoy; los dos conjuntos de estados difieren a propósito.
11. **Cliente anonimizado visible como "Cliente eliminado (alias)":** se corrige en este sprint con el nombre nulo en la vista de servicios (ver el alcance). Resuelve el riesgo R3 del diseño.
12. **Etiquetas de estado en masculino:** Pendiente, Confirmado, Completado, No asistió, Cancelado, para que concuerden con "servicio". Se cambian `appointment-status.ts` y sus pruebas en el commit de vocabulario.
13. **Alias de técnico eliminado:** no se puede buscar por alias.
14. **Ventana de eficiencia:** hoy y los 29 días anteriores (30 días con hoy), con la fecha de corte visible (dd/mm/aaaa, por ejemplo 25/09/2026 si hoy es 24/10/2026) y el porcentaje redondeado al entero más cercano.
15. **"Por cerrar" siempre muestra todas las fechas** (`toClose=1`), también dentro de la agenda.
16. **Lista por cerrar con tope:** `GET /agenda/to-close` devuelve como máximo 200 servicios, del más antiguo al más reciente, más el total; con más de 200 la lista muestra "Mostrando 200 de N". La tarjeta del Panel cuenta todos.
17. **Técnico desactivado en la selección:** un técnico recordado que luego se desactivó o eliminó sigue en la selección mientras tenga servicios en el rango visible, con su color y marcado como inactivo; sale de la selección cuando no tiene ninguno.
18. **Chips:** el chip de estado "Cancelado" muestra los cancelados aunque el interruptor "Mostrar cancelados" esté apagado. Varios chips de una misma categoría se combinan con O; categorías distintas, con Y.
19. **Búsqueda de "Servicios" por cliente:** coincide solo por el nombre del cliente; el teléfono se busca en el grupo "Clientes".

## Preguntas abiertas

Ninguna.
