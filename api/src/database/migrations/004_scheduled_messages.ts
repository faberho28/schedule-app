import { sql, type Kysely } from 'kysely';

/**
 * Mensajes programados (seguimientos) con dos garantías en la base de datos:
 *
 * - Idempotencia: un solo mensaje por cita y tipo, y un solo seguimiento pendiente por
 *   cliente y servicio.
 * - Consentimiento: ningún mensaje puede quedar `pending` si el cliente no está en
 *   `granted`. Se usa un trigger y no una clave foránea sobre el estado porque la FK
 *   bloquearía la revocación del consentimiento.
 *
 * El `CHECK` de `kind` solo admite `followup`; los recordatorios futuros lo ampliarán
 * con su propia migración.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
CREATE TABLE scheduled_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL,
  customer_id    uuid NOT NULL,
  appointment_id uuid NOT NULL,
  service_id     uuid NOT NULL,
  kind           text NOT NULL,
  send_at        timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  cancel_reason  text,
  attempts       integer NOT NULL DEFAULT 0,
  wa_message_id  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_messages_customer_fk FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id),
  CONSTRAINT scheduled_messages_appointment_fk FOREIGN KEY (business_id, appointment_id)
    REFERENCES appointments (business_id, id),
  CONSTRAINT scheduled_messages_service_fk FOREIGN KEY (business_id, service_id)
    REFERENCES services (business_id, id),
  CONSTRAINT scheduled_messages_kind_check CHECK (kind IN ('followup')),
  CONSTRAINT scheduled_messages_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  CONSTRAINT uq_scheduled_messages_appointment_kind UNIQUE (appointment_id, kind)
);

CREATE UNIQUE INDEX uq_followup_pending
  ON scheduled_messages (customer_id, service_id)
  WHERE kind = 'followup' AND status = 'pending';

CREATE FUNCTION enforce_scheduled_message_consent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' AND NOT EXISTS (
    SELECT 1 FROM customers c
     WHERE c.id = NEW.customer_id AND c.consent_status = 'granted'
  ) THEN
    RAISE EXCEPTION 'customer % has no granted consent', NEW.customer_id
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'scheduled_messages_consent_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scheduled_messages_consent_required
  BEFORE INSERT OR UPDATE OF status ON scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION enforce_scheduled_message_consent();
`,
    )
    .execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
DROP TABLE scheduled_messages;
DROP FUNCTION enforce_scheduled_message_consent();
`,
    )
    .execute(db);
}
