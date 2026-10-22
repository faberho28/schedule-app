import { sql, type Kysely } from 'kysely';

/**
 * Clientes y auditoría de consentimiento.
 *
 * `consent_events` es solo de inserción. Un trigger bloquea `UPDATE` y `DELETE`, con una
 * única excepción: se puede vaciar una columna de texto libre (`notes`) porque la
 * anonimización de clientes (CR-R2) debe poder borrar datos personales de ese texto.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      String.raw`
CREATE TABLE customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES businesses (id),
  name           text NOT NULL,
  phone          text NOT NULL,
  address        text,
  notes          text,
  consent_status text NOT NULL DEFAULT 'pending',
  consent_at     timestamptz,
  alias          text,
  anonymized_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT uq_customers_business_phone UNIQUE (business_id, phone),
  CONSTRAINT uq_customers_business_alias UNIQUE (business_id, alias),
  CONSTRAINT customers_consent_status_check
    CHECK (consent_status IN ('pending', 'granted', 'revoked')),
  CONSTRAINT customers_phone_e164_check
    CHECK (anonymized_at IS NOT NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT customers_consent_granted_at_check
    CHECK (consent_status <> 'granted' OR consent_at IS NOT NULL)
);

CREATE TABLE consent_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  kind        text NOT NULL,
  occurred_at timestamptz NOT NULL,
  medium      text NOT NULL,
  source      text NOT NULL DEFAULT 'owner_panel',
  recorded_by text NOT NULL DEFAULT 'owner',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_events_customer_fk FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id),
  CONSTRAINT consent_events_kind_check CHECK (kind IN ('granted', 'revoked')),
  CONSTRAINT consent_events_medium_check
    CHECK (medium IN ('in_person', 'phone_call', 'whatsapp', 'written', 'other')),
  CONSTRAINT consent_events_source_check CHECK (source IN ('owner_panel', 'bot'))
);

-- Tablas de auditoría: solo inserción. El primer argumento del trigger es la única
-- columna que se puede modificar (texto libre que la anonimización debe poder vaciar).
CREATE FUNCTION audit_rows_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_NARGS = 1
     AND (to_jsonb(NEW) - TG_ARGV[0]) = (to_jsonb(OLD) - TG_ARGV[0]) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only (% not allowed)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER consent_events_append_only
  BEFORE UPDATE OR DELETE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION audit_rows_append_only('notes');
`,
    )
    .execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
DROP TABLE consent_events;
DROP FUNCTION audit_rows_append_only();
DROP TABLE customers;
`,
    )
    .execute(db);
}
