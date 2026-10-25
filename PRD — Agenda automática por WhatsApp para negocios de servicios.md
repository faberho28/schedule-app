# PRD — Agenda automática por WhatsApp para negocios de servicios

Oct 21, 2026 · @Faber Hoyos

## Resumen y problema

Un asistente de WhatsApp que agenda, confirma y recuerda citas para cualquier negocio de servicios, y vuelve a contactar al cliente cuando le toca el siguiente servicio. Lo acompaña un panel web (PWA) donde el dueño y sus técnicos ven y gestionan la agenda.

**Para quién:** negocios pequeños de servicios en Colombia que hoy agendan por WhatsApp a mano. Por ejemplo: mantenimiento de aires, plomería, fumigación, lavado de muebles, peluquerías, veterinarias y recarga de extintores.

**El problema:**

- El dueño responde cada mensaje a mano, a cualquier hora, y pierde solicitudes cuando está trabajando.
- Las citas se anotan en cuadernos o chats sueltos, lo que genera cruces de horario y olvidos.
- Los clientes no asisten porque nadie les recordó la cita.
- Nadie vuelve a contactar al cliente cuando le toca el siguiente mantenimiento, y ese ingreso recurrente se pierde.

**La apuesta:** el cliente no instala nada porque ya usa WhatsApp, y el negocio solo necesita un número de WhatsApp Business y configurar sus servicios.

## Objetivos, no-objetivos y métricas

El MVP tiene éxito si un negocio real deja de agendar a mano durante 30 días seguidos.

**Objetivos**

- Que un cliente agende una cita completa por WhatsApp, sin intervención humana, en menos de 2 minutos.
- Que ninguna cita confirmada quede sin sus recordatorios.
- Que cada servicio recurrente genere su mensaje de seguimiento en la fecha correcta.
- Que un negocio nuevo quede configurado en menos de 30 minutos.

**No-objetivos (por ahora)**

- Cobros o pagos en línea.
- Facturación electrónica.
- Apps nativas para iOS o Android.
- Inventario, nómina o contabilidad.
- Conversación libre con IA desde el día uno.

**Métricas**

| Métrica | Meta del MVP |
| --- | --- |
| Citas agendadas por el bot sin ayuda humana | ≥ 70 % |
| Inasistencias (no-show) frente a la línea base del negocio | −50 % |
| Clientes que agendan desde un mensaje de seguimiento | ≥ 20 % |
| Mensajes recordatorio entregados a tiempo | ≥ 99 % |
| Conversaciones que piden hablar con una persona | ≤ 15 % |

## Usuarios

Hay tres tipos de usuario, y solo uno de ellos (el cliente final) nunca toca el panel.

| Usuario | Quién es | Qué necesita | Dónde lo usa |
| --- | --- | --- | --- |
| Dueño del negocio | Tiene de 1 a 10 técnicos, trabaja en campo y responde WhatsApp entre servicios | Ver la agenda del día, configurar servicios y horarios, atender lo que el bot no resuelve | Panel PWA en el celular |
| Técnico | Ejecuta los servicios | Ver sus citas con dirección y notas, y marcarlas como completadas | Panel PWA en el celular |
| Cliente final | Persona u hogar que contrata el servicio | Agendar rápido, saber cuándo llegan, reprogramar sin llamar | WhatsApp |

## Alcance: MVP y fases posteriores

El MVP cubre un negocio piloto completo de punta a punta, pero con el modelo multi-negocio ya construido.

| Capacidad | MVP | Fase 2 | Fase 3 |
| --- | --- | --- | --- |
| Agendar por WhatsApp con botones y listas | Sí |  |  |
| Autorización de datos (Ley 1581) | Sí |  |  |
| Recordatorios 3 días antes y el mismo día | Sí |  |  |
| Confirmar, reprogramar y cancelar desde el recordatorio | Sí |  |  |
| Paso a humano ("hablar con alguien") | Sí |  |  |
| Panel PWA: agenda del día y marcar completado | Sí |  |  |
| Seguimiento recurrente por servicio | Sí |  |  |
| Varios técnicos y asignación automática | Uno solo | Sí |  |
| Calificación después del servicio |  | Sí |  |
| Onboarding de negocios sin ayuda (self-service) |  | Sí |  |
| Notificaciones push en el panel |  | Sí |  |
| Interpretación de texto libre con IA |  |  | Sí |
| Reportes (ingresos, recurrencia, no-show) |  |  | Sí |
| Recordatorios por correo o SMS como respaldo |  |  | Sí |

## Requisitos funcionales

Toda la conversación es una máquina de estados guardada por cliente, con botones y listas interactivas de WhatsApp en lugar de texto libre.

### RF1. Primer contacto y consentimiento

1. Si el número no existe como cliente del negocio, el bot saluda y pide autorización de tratamiento de datos con los botones *Acepto* y *No acepto*.
2. Sin autorización, el bot no guarda datos ni programa mensajes, y ofrece el contacto directo del negocio.
3. Se guarda la fecha y hora de la autorización.

### RF2. Agendar una cita

1. El cliente elige el servicio en una lista interactiva (máximo 10 opciones por lista).
2. El bot pide la dirección, o propone la última guardada con *Sí* u *Otra*.
3. El bot muestra los próximos cupos libres según duración del servicio, horario del técnico, días libres y citas existentes. La última opción es *Ver más fechas*.
4. El bot muestra un resumen con *Confirmar* o *Cambiar*.
5. Al confirmar, en una sola transacción: se crea la cita y se programan sus recordatorios.
6. Si dos clientes eligen el mismo cupo, la base de datos rechaza el segundo y el bot le ofrece otros cupos.

### RF3. Recordatorios

1. Se envían con plantillas aprobadas por Meta, 3 días antes y la mañana del mismo día. Ambos tiempos son configurables por negocio.
2. Cada recordatorio trae los botones *Confirmo*, *Reprogramar* y *Cancelar*.
3. *Reprogramar* vuelve al paso de cupos de RF2 conservando el servicio y la dirección.
4. *Cancelar* libera el cupo y anula los mensajes pendientes de esa cita.

### RF4. Cierre del servicio y seguimiento

1. El técnico marca la cita como *Completada* o *No asistió* desde el panel.
2. Si el servicio tiene intervalo de seguimiento, se programa un mensaje para la fecha de completado más ese intervalo.
3. El mensaje de seguimiento ofrece *Agendar* (entra a RF2 con el servicio ya elegido) o *Ahora no*.

### RF5. Paso a humano

1. En cualquier estado, escribir "asesor" o tocar *Hablar con alguien* pausa el bot para ese cliente.
2. El panel muestra la conversación pendiente y el dueño la retoma desde su WhatsApp Business.
3. El dueño reactiva el bot desde el panel.

### RF6. Conversaciones abandonadas

Si una conversación lleva 30 minutos sin respuesta en un paso intermedio, vuelve al inicio. Ningún cupo queda reservado sin confirmar.

### RF7. Panel web (PWA)

- Agenda del día y de la semana, por técnico.
- Crear, mover y cancelar citas a mano (por si el cliente llama).
- Ficha de cliente con historial de servicios.
- Configuración: servicios (nombre, duración, precio, intervalo de seguimiento), técnicos, horarios y días libres, textos del bot.
- Bandeja de conversaciones pasadas a humano.
- Instalable en el celular y usable con conexión inestable.

## Requisitos no funcionales

Lo crítico es que ningún recordatorio se pierda ni se envíe dos veces.

- **Respuesta del bot:** el webhook responde 200 a Meta en menos de 1 segundo y procesa el mensaje en segundo plano. El cliente recibe respuesta en menos de 3 segundos.
- **Idempotencia:** cada mensaje entrante se registra por su ID de WhatsApp. Si Meta lo reenvía, se ignora.
- **Envío confiable:** el worker toma los mensajes programados con `FOR UPDATE SKIP LOCKED`, reintenta con espera creciente y marca como fallido tras 3 intentos, con alerta al dueño.
- **Zona horaria:** todas las fechas se guardan en `timestamptz` y se muestran en la zona del negocio (por defecto `America/Bogota`).
- **Seguridad:** se valida la firma `X-Hub-Signature-256` de cada webhook. Tokens de Meta en variables de entorno o un gestor de secretos. Panel con login y roles (dueño, técnico).
- **Aislamiento entre negocios:** toda consulta filtra por `business_id`, idealmente reforzado con Row Level Security de Postgres.
- **Habeas data (Ley 1581 de 2012):** autorización explícita registrada, política de tratamiento de datos publicada, y opción de que el cliente pida borrar sus datos escribiendo "borrar mis datos".
- **Copias de seguridad:** respaldo diario de Postgres a Object Storage (OCI o Cloudflare R2), con prueba de restauración mensual.
- **Observabilidad:** logs estructurados, monitor de uptime del webhook y alerta si el worker deja de procesar.

## Arquitectura técnica

Todo corre en la VM de OCI que ya tienes, expuesta con Cloudflare Tunnel; el único servicio externo es la Cloud API de WhatsApp.

&#91;embedded content: arquitectura · 8 componentes\]

Meta entrega cada mensaje del cliente a la API por webhook; el worker, por su lado, lee la cola en Postgres y envía las plantillas programadas.

- **Backend:** un solo servicio con el webhook, la máquina de estados del bot y la API del panel. Node (Fastify) o Python (FastAPI).
- **Worker:** proceso aparte que corre cada minuto; puede vivir en el mismo contenedor al inicio.
- **Base de datos:** Postgres 16 en Docker, con la extensión `btree_gist`.
- **Panel:** PWA (por ejemplo, SvelteKit o React con Vite) desplegada en Cloudflare Pages, en un subdominio como `app.tudominio.com`.
- **Entrada:** Cloudflare Tunnel publica `api.tudominio.com` sin abrir puertos en la VM; HTTPS incluido.
- **Despliegue:** Docker Compose en la VM ARM, con respaldos diarios a Object Storage.

## Modelo de datos

Nueve tablas en Postgres; todo cuelga de `businesses`, lo que hace al sistema multi-negocio desde el día uno.

| Tabla | Para qué sirve | Campos clave |
| --- | --- | --- |
| `businesses` | Cada negocio | `wa_phone_id`, `timezone`, `settings` (jsonb) |
| `services` | Servicios configurables | `duration_min`, `price`, `followup_interval_days` |
| `technicians` | Quién ejecuta | `name`, `phone`, `active` |
| `availability` | Horario semanal | `weekday`, `start_time`, `end_time` |
| `time_off` | Días libres y vacaciones | `period` (tstzrange) |
| `customers` | Clientes por negocio | `phone` (único por negocio), `address`, `consent_at` |
| `appointments` | Citas | `slot` (tstzrange), `status`, `completed_at` |
| `scheduled_messages` | Cola de recordatorios y seguimientos | `kind`, `send_at`, `status`, `wa_message_id` |
| `conversations` | Estado del bot por cliente | `state`, `context` (jsonb) |

Tres decisiones de diseño:

- **Sin doble agendamiento:** `appointments` tiene una restricción `EXCLUDE USING gist (technician_id WITH =, slot WITH &&)` para citas activas. La base de datos, no el código, impide cruces.
- **La cola manda:** el worker no calcula fechas; solo envía lo que ya está en `scheduled_messages`. Cancelar una cita es marcar sus mensajes como `cancelled`.
- **Lo genérico vive en `services`:** el intervalo de seguimiento (180 días para aires, 90 para fumigación, 30 para peluquería) es lo que adapta el producto a cada rubro.

Estados de una cita: `pending` → `confirmed` → `completed`, con salidas a `cancelled` y `no_show`.

## Costos estimados

Con la infraestructura que ya existe, el único costo variable real es la mensajería de WhatsApp. Las cifras son aproximadas y deben verificarse antes de cotizar a un negocio.

| Concepto | Opción | Costo mensual aproximado |
| --- | --- | --- |
| Servidor (backend, worker, Postgres) | VM ARM de la capa gratuita de OCI | USD 0 |
| Dominio, DNS, HTTPS, túnel | Cloudflare (plan gratuito + Tunnel) | USD 0 (el dominio ya está pago) |
| Panel PWA | Cloudflare Pages | USD 0 |
| Respaldos | OCI Object Storage o Cloudflare R2 (capas gratuitas) | USD 0 |
| Mensajería WhatsApp | Cloud API de Meta, cobro por plantilla enviada | Variable según volumen y tarifa vigente para Colombia |

Cómo se comporta el costo de WhatsApp:

- Responder al cliente dentro de las 24 horas siguientes a su último mensaje cuesta mucho menos que iniciar la conversación, o nada, según la tarifa vigente.
- Lo que sí se paga son los mensajes que inicia el negocio: recordatorios y seguimientos. Una cita típica genera 2 recordatorios y, si es recurrente, 1 seguimiento.
- Meta ha cambiado su modelo de precios varias veces; se debe revisar la tabla oficial de tarifas antes de fijar precios.

Frente a la propuesta original (USD 35–145 al mes), el costo fijo baja a casi cero; solo queda el variable de mensajería.

## Riesgos y mitigaciones

El riesgo mayor es depender de Meta: sus reglas de plantillas, verificación y precios definen qué se puede hacer.

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Meta rechaza o tarda en aprobar plantillas | Sin recordatorios ni seguimientos | Redactar plantillas tipo *utility* sin lenguaje promocional; enviarlas a aprobación en la semana 1 |
| Bloqueo del número por mal uso | El negocio pierde su canal principal | Solo API oficial; nunca librerías no oficiales; respetar el consentimiento y la opción de dejar de recibir mensajes |
| Verificación del negocio en Meta (Business Manager) | Retrasa la salida a producción | Iniciar la verificación desde el día 1; desarrollar con el número de prueba |
| Cambios de precio de Meta | El costo por negocio sube | Medir mensajes por negocio desde el inicio; recordatorios configurables |
| Clientes que escriben texto libre en vez de tocar botones | El bot no entiende y frustra | Reenviar las opciones; tras 2 intentos, ofrecer paso a humano; IA en fase 3 |
| Caída de la VM de OCI (o reclamo de recursos ociosos en la capa gratuita) | No se envían recordatorios | Monitor de uptime, respaldos diarios, despliegue reproducible con Docker Compose |
| Incumplimiento de habeas data | Sanciones de la SIC | Consentimiento registrado, política publicada, borrado a solicitud |

## Roadmap e hitos

El MVP está listo en unas 5 semanas de trabajo parcial, y se valida con 30 días de uso real antes de abrirlo a más negocios. Las duraciones son estimadas.

&#91;embedded content: roadmap · 4 fases, 3 compuertas\]

Cada fase empieza solo cuando se cumple la compuerta anterior; la aprobación de plantillas de Meta es lo primero porque no depende de ti.

## Preguntas abiertas

- [ ] ¿Cuál es el negocio piloto? ¿El de aires acondicionados de la propuesta original?
- [ ] ¿Lenguaje y framework del backend (Node con Fastify, Python con FastAPI, Go)?
- [ ] ¿El piloto ya tiene WhatsApp Business App en ese número? Migrarlo a la Cloud API exige pasos específicos.
- [ ] ¿Quién verifica el negocio en Meta Business Manager: el dueño o el desarrollador?
- [ ] ¿Los técnicos reciben sus citas también por WhatsApp, o solo en el panel?
- [ ] ¿Los horarios del recordatorio del mismo día (por ejemplo, 7:00 a. m.) son fijos o los elige cada negocio?
- [ ] ¿El proyecto queda personal y gratuito, o se abre a otros negocios con algún costo para cubrir la mensajería?
- [ ] Nombre del producto y subdominio.
