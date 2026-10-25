import { sql, type Kysely } from 'kysely';

/**
 * Citas y auditoría de cierres.
 *
 * `slot` es el bloque ocupado `[starts_at, ends_at + buffer_min)`. La restricción
 * `appointments_no_overlap` lo protege de forma absoluta para toda cita distinta de
 * `cancelled`; por eso `completed`, `no_show` y los cierres anticipados conservan su
 * bloque y una corrección o reapertura nunca puede provocar un cruce.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
CREATE TABLE appointments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL,
  customer_id           uuid NOT NULL,
  service_id            uuid NOT NULL,
  technician_id         uuid NOT NULL,
  status                text NOT NULL DEFAULT 'confirmed',
  starts_at             timestamptz NOT NULL,
  ends_at               timestamptz NOT NULL,
  buffer_min            integer NOT NULL DEFAULT 0,
  slot                  tstzrange NOT NULL,
  address_snapshot      text,
  price_snapshot        numeric(12, 2) NOT NULL,
  service_name_snapshot text NOT NULL,
  technician_changed    boolean NOT NULL DEFAULT false,
  completed_at          timestamptz,
  closed_at             timestamptz,
  closed_early          boolean NOT NULL DEFAULT false,
  closure_reason        text,
  cancelled_at          timestamptz,
  cancel_reason         text,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT appointments_customer_fk FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id),
  CONSTRAINT appointments_service_fk FOREIGN KEY (business_id, service_id)
    REFERENCES services (business_id, id),
  CONSTRAINT appointments_technician_fk FOREIGN KEY (business_id, technician_id)
    REFERENCES technicians (business_id, id),
  CONSTRAINT appointments_status_check
    CHECK (status IN ('pending', 'confirmed', 'completed', 'no_show', 'cancelled')),
  CONSTRAINT appointments_buffer_min_check CHECK (buffer_min BETWEEN 0 AND 240),
  CONSTRAINT appointments_time_order_check CHECK (ends_at > starts_at),
  CONSTRAINT appointments_slot_check
    CHECK (lower(slot) = starts_at AND upper(slot) >= ends_at),
  CONSTRAINT appointments_closed_early_reason_check
    CHECK (NOT closed_early OR closure_reason IS NOT NULL),
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    technician_id WITH =,
    slot WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE TABLE appointment_closures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL,
  appointment_id      uuid NOT NULL,
  outcome             text NOT NULL,
  previous_outcome    text,
  early               boolean NOT NULL DEFAULT false,
  reason              text,
  completed_at_before timestamptz,
  completed_at_after  timestamptz,
  actor               text NOT NULL DEFAULT 'owner',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_closures_appointment_fk FOREIGN KEY (business_id, appointment_id)
    REFERENCES appointments (business_id, id),
  CONSTRAINT appointment_closures_outcome_check
    CHECK (outcome IN ('completed', 'no_show', 'reopened', 'completion_date_corrected')),
  CONSTRAINT appointment_closures_previous_outcome_check
    CHECK (previous_outcome IN ('pending', 'confirmed', 'completed', 'no_show'))
);

-- Solo inserción; el motivo de texto libre se puede vaciar al anonimizar al cliente.
CREATE TRIGGER appointment_closures_append_only
  BEFORE UPDATE OR DELETE ON appointment_closures
  FOR EACH ROW EXECUTE FUNCTION audit_rows_append_only('reason');
`,
    )
    .execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
DROP TABLE appointment_closures;
DROP TABLE appointments;
`,
    )
    .execute(db);
}
