-- REFERENCE ONLY: adapt names and foreign keys to the existing Budisa schema.
CREATE TABLE trackers (
  id bigserial PRIMARY KEY,
  imei varchar(17) NOT NULL UNIQUE,
  iccid varchar(32),
  model varchar(32) NOT NULL DEFAULT 'FTC887',
  truck_id bigint NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tracker_positions (
  id bigserial PRIMARY KEY,
  event_id char(64) NOT NULL UNIQUE,
  tracker_id bigint NOT NULL REFERENCES trackers(id),
  packet_id char(64) NOT NULL,
  recorded_at timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  altitude integer,
  angle integer,
  satellites integer,
  speed integer,
  priority integer,
  ignition boolean,
  movement boolean,
  odometer_m bigint,
  raw_io jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tracker_positions_tracker_time_idx ON tracker_positions (tracker_id, recorded_at DESC);

