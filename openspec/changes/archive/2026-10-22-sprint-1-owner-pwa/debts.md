# Deudas y fuera de alcance del sprint 1

Lista de referencia, sin tareas asignadas. Cada elemento tiene el motivo en una línea y una fase sugerida. Las fases se refieren al orden del proyecto completo, no a las fases de `tasks.md`.

## Cumplimiento y datos

| Elemento | Motivo | Fase sugerida |
|----------|--------|---------------|
| Registro de supresiones (HMAC del identificador) y verificación tras restaurar respaldos | La anonimización en sitio no impide que un respaldo restaurado vuelva a traer a una persona suprimida (Ley 1581); hace falta un registro que vuelva a purgarla. | Final del proyecto |
| Autenticación y roles | Hoy el negocio sale de `DEFAULT_BUSINESS_ID` y el actor es el texto `'owner'`. Requiere tabla `users`, `recorded_by_user_id` en `consent_events` y actor real en los cierres. | Final del proyecto |
| Row Level Security | La preparación está hecha (`SET LOCAL app.business_id`); falta la política por negocio como migración aislada. | Junto con autenticación |
| `replace_availability` acumula filas con borrado lógico | Cada reemplazo de la disponibilidad deja filas con `deleted_at`; las filas se acumulan sin una limpieza periódica. | Mantenimiento tras el sprint 1 |
| Recalcular citas futuras al cambiar el buffer | Cambiar `travel_buffer_min` solo afecta a las citas nuevas (opción C de D1 diferida). | Cuando el dueño lo pida |

## Mensajería y bot (fuera de alcance, sin historias)

| Elemento | Motivo | Fase sugerida |
|----------|--------|---------------|
| Integración con WhatsApp: `MessagingPort`, worker de envío, recordatorios y ventana de 24 horas | Los seguimientos se programan en `scheduled_messages`, pero nada los envía en este sprint. | Sprint del bot |
| Verificar la política de opt-in de Meta | La autorización previa registrada por el dueño debe cumplir los requisitos de Meta antes de enviar. | Antes del sprint del bot |
| Bot de agendamiento y paso de `pending` a `confirmed` | Las citas creadas a mano nacen `confirmed`; `pending` queda reservado para el bot y sus transiciones aún no existen. | Sprint del bot |
| Bandeja de conversaciones | Depende de WhatsApp. | Sprint del bot |
| Fecha del seguimiento en la respuesta de la cita | La interfaz no puede mostrar cuándo se enviará el seguimiento; el aviso de cierre es genérico. | Con el worker de envío |

## Interfaz

| Elemento | Motivo | Fase sugerida |
|----------|--------|---------------|
| Arrastrar y soltar en la agenda | Fuera del sprint; las citas se mueven solo con cupos ofrecidos. | Mejora de agenda |
| Fotos de evidencia del servicio | El cierre no admite adjuntos. | Mejora de cierre |
| Caché sin conexión de la agenda | Solo el shell es instalable; una agenda en caché debe avisar de forma visible que las citas pueden haber cambiado. | Mejora de PWA |
| Endpoint para listar técnicos libres en un cupo exacto | El diálogo de reasignación lista todos los demás técnicos activos y la API responde "Cupo ocupado" si el elegido está ocupado. | Mejora de reasignación |
| Búsqueda de clientes insensible a acentos | "Maria" no encuentra "María". | Mejora de clientes |
| Validación E.164 en el cliente que acepte números locales sin prefijo | La interfaz precarga `+57`; si se borra, la validación local rechaza números sin prefijo aunque la API los normaliza. | Mejora de clientes |
| Ventana visible por defecto de la agenda (07:00 a 19:00) | Las citas fuera de esa ventana se omiten de la agenda sin aviso. Sugerencia: derivar la ventana de la disponibilidad de los técnicos. | Mejora de agenda |

## Calidad y operación

| Elemento | Motivo | Fase sugerida |
|----------|--------|---------------|
| Verificación manual en navegador y dispositivo | No hay prueba automatizada de la instalación de la PWA, el modo sin conexión, el tamaño táctil ni el aspecto de la agenda. Los pasos están en la fase 18 de `tasks.md`. | Antes de entregar al dueño |
| Hallazgos de `npm audit` en `api/` (3 altos) | Vienen de `kysely-codegen` mediante `micromatch` y `braces` (denegación de servicio por patrones anidados). Es una dependencia de desarrollo; la corrección sugerida baja `kysely-codegen` a 0.6.1 (cambio incompatible). `app/` no tiene hallazgos. | Cuando `kysely-codegen` publique una versión corregida |
| Arranque como proceso real | La prueba `src/bootstrap.int-spec.ts` cubre la carga del `.env` y la creación de la aplicación, pero no ejecuta `node dist/main.js` (`main.ts` solo llama a `createApplication` y escucha). | Opcional, con un smoke test de despliegue |
| Estado de pruebas de concurrencia en la interfaz | "Cupo ocupado" se prueba con MSW simulando el 409; la carrera real con dos pestañas es verificación manual. | Verificación manual |
| Asimetría en `DELETE`: `DELETE /technicians/:id` responde 200 con cuerpo y `DELETE /customers/:id` responde 204 | El borrado de técnicos puede traer reasignaciones, por eso devuelve cuerpo; el contrato no lo documentaba como excepción. Sugerencia: documentar la excepción en OpenAPI o unificar las respuestas. | Mejora de API, antes de integrar el bot |
