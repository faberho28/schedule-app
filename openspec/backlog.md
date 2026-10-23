# Backlog de mejoras futuras

Ideas acordadas con el dueño del producto que no pertenecen a un sprint en curso. Cada una pasa por la ronda de preguntas de SDD antes de convertirse en un cambio.

## Recaudo por servicios completados y precio acordado de la cita

**Origen:** pedido del usuario durante el cierre del sprint 1.

**Qué se quiere**
- Guardar los servicios completados y cuánto se recaudó por ellos.
- Cada servicio tiene un precio, pero el dueño puede modificar el precio de una cita concreta, por ejemplo al llegar a un acuerdo con el cliente.

**Qué ya existe y se puede aprovechar**
- La cita guarda una copia del precio del servicio al crearla (`price_snapshot`), así que el precio de la lista no cambia el historial.
- El cierre del servicio ya registra quién, cuándo y por qué, con corrección y reapertura auditadas.

**Puntos a decidir en la ronda de preguntas**
- Diferencia entre precio acordado y monto realmente cobrado, y si se registra el medio de pago.
- Quién puede cambiar el precio y cuándo (antes de agendar, antes de cerrar, después de cerrar), con motivo y registro de auditoría.
- Cómo afectan al recaudo la corrección de un cierre y devolver una cita a `confirmed`.
- Si el monto se pide al completar el servicio o se edita después.
- Moneda y formato (hoy el precio se muestra en COP, supuesto del sprint 1).
- Relación con la anonimización: los montos no son datos personales y deben conservarse al anonimizar al cliente o al técnico.

**Límites a respetar**
- El PRD deja fuera cobros o pagos en línea y facturación electrónica. Esto es un registro interno de recaudo, no una pasarela de pago ni una factura.
- Los reportes (ingresos, recurrencia, no asistencia) están en la fase 3 del PRD. Este registro es su base de datos.

**Fase sugerida:** sprint propio, antes de los reportes.
