import { sql, type Kysely } from 'kysely';

/**
 * Esquema base: negocios, servicios, técnicos, disponibilidad semanal y días libres.
 *
 * Todas las tablas hijas llevan `business_id` y claves foráneas compuestas
 * `(business_id, x_id)`, de modo que no se puede referenciar un registro de otro negocio.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Rango de horas del día; no existe de forma nativa en Postgres.
CREATE TYPE timerange AS RANGE (subtype = time);

CREATE TABLE businesses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  timezone          text NOT NULL DEFAULT 'America/Bogota',
  travel_buffer_min integer NOT NULL DEFAULT 0,
  settings          jsonb NOT NULL DEFAULT '{"followup_send_time": "09:00"}'::jsonb,
  wa_phone_id       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_travel_buffer_min_check CHECK (travel_buffer_min BETWEEN 0 AND 240)
);

CREATE TABLE services (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            uuid NOT NULL REFERENCES businesses (id),
  name                   text NOT NULL,
  duration_min           integer NOT NULL,
  price                  numeric(12, 2) NOT NULL,
  followup_interval_days integer,
  active                 boolean NOT NULL DEFAULT true,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT services_duration_min_check CHECK (duration_min > 0),
  CONSTRAINT services_price_check CHECK (price >= 0),
  CONSTRAINT services_followup_interval_days_check CHECK (followup_interval_days > 0)
);

CREATE UNIQUE INDEX uq_services_business_name
  ON services (business_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE TABLE technicians (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses (id),
  name          text,
  phone         text,
  active        boolean NOT NULL DEFAULT true,
  alias         text,
  anonymized_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technicians_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT uq_technicians_business_alias UNIQUE (business_id, alias)
);

CREATE TABLE availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  technician_id uuid NOT NULL,
  weekday       smallint NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_technician_fk FOREIGN KEY (business_id, technician_id)
    REFERENCES technicians (business_id, id),
  CONSTRAINT availability_weekday_check CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT availability_time_order_check CHECK (end_time > start_time),
  CONSTRAINT availability_no_overlap EXCLUDE USING gist (
    technician_id WITH =,
    weekday WITH =,
    timerange(start_time, end_time) WITH &&
  ) WHERE (deleted_at IS NULL)
);

CREATE TABLE time_off (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  technician_id uuid NOT NULL,
  period        tstzrange NOT NULL,
  reason        text,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_off_technician_fk FOREIGN KEY (business_id, technician_id)
    REFERENCES technicians (business_id, id),
  CONSTRAINT time_off_period_not_empty_check CHECK (NOT isempty(period)),
  CONSTRAINT time_off_no_overlap EXCLUDE USING gist (
    technician_id WITH =,
    period WITH &&
  ) WHERE (deleted_at IS NULL)
);
`,
    )
    .execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
DROP TABLE time_off;
DROP TABLE availability;
DROP TABLE technicians;
DROP TABLE services;
DROP TABLE businesses;
DROP TYPE timerange;
DROP EXTENSION btree_gist;
`,
    )
    .execute(db);
}
