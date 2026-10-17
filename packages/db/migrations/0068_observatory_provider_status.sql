CREATE TABLE IF NOT EXISTS observatory_provider_feed (
  id text PRIMARY KEY CHECK (id = 'cloudflare'),
  enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  etag text,
  snapshot jsonb,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  CONSTRAINT observatory_provider_snapshot_bounded CHECK (snapshot IS NULL OR (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 2097152))
);
--> statement-breakpoint
INSERT INTO observatory_provider_feed (id) VALUES ('cloudflare') ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_provider_notice (
  provider_id text NOT NULL REFERENCES observatory_provider_feed(id) ON DELETE RESTRICT,
  id text NOT NULL,
  record jsonb NOT NULL,
  source_updated_at timestamptz NOT NULL,
  active boolean NOT NULL,
  reconciled_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY(provider_id, id),
  CONSTRAINT observatory_provider_notice_identity CHECK (record->>'id' = id AND jsonb_typeof(record) = 'object' AND octet_length(record::text) <= 1048576)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_provider_notice_page ON observatory_provider_notice(provider_id, active, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_provider_history (
  provider_id text NOT NULL REFERENCES observatory_provider_feed(id) ON DELETE RESTRICT,
  notice_id text NOT NULL,
  update_id text NOT NULL,
  content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  record jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY(provider_id, notice_id, update_id, content_digest),
  CONSTRAINT observatory_provider_history_identity CHECK (record->>'id' = update_id AND jsonb_typeof(record) = 'object' AND octet_length(record::text) <= 524288)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_provider_envelope (
 id uuid PRIMARY KEY,
 provider_id text NOT NULL REFERENCES observatory_provider_feed(id) ON DELETE RESTRICT,
 content_digest text NOT NULL UNIQUE CHECK (content_digest ~ '^[a-f0-9]{64}$'),
 raw_payload jsonb NOT NULL CHECK (jsonb_typeof(raw_payload) = 'object' AND octet_length(raw_payload::text) <= 2097152),
 received_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION observatory_provider_history_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Provider source history is immutable'; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='observatory_provider_history_immutable' AND tgrelid='public.observatory_provider_history'::regclass) THEN CREATE TRIGGER observatory_provider_history_immutable BEFORE UPDATE OR DELETE ON observatory_provider_history FOR EACH ROW EXECUTE FUNCTION observatory_provider_history_immutable(); END IF; END $$;
--> statement-breakpoint
DO $$ DECLARE target_role record; privilege text; table_name text; BEGIN FOR target_role IN SELECT r.rolname FROM pg_roles r WHERE NOT r.rolsuper AND r.rolname<>current_user AND r.rolname<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.resource'::regclass) LOOP FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP IF has_table_privilege(target_role.rolname,'public.resource',privilege) AND has_table_privilege(target_role.rolname,'public.project_resource_link',privilege) THEN FOREACH table_name IN ARRAY ARRAY['observatory_provider_feed','observatory_provider_notice','observatory_provider_history','observatory_provider_envelope'] LOOP EXECUTE format('GRANT %s ON TABLE public.%I TO %I',privilege,table_name,target_role.rolname); END LOOP; END IF; END LOOP; END LOOP; END $$;

--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='observatory_provider_envelope_immutable' AND tgrelid='public.observatory_provider_envelope'::regclass) THEN CREATE TRIGGER observatory_provider_envelope_immutable BEFORE UPDATE OR DELETE ON observatory_provider_envelope FOR EACH ROW EXECUTE FUNCTION observatory_provider_history_immutable(); END IF; END $$;
