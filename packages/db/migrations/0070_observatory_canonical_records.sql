CREATE TABLE IF NOT EXISTS observatory_annotation (
 resource_id uuid PRIMARY KEY REFERENCES resource(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version > 0),
 metadata jsonb NOT NULL,
 requirement text NOT NULL CHECK(requirement IN ('required','optional','unspecified')),
 CONSTRAINT observatory_annotation_identity CHECK(metadata->>'resourceId' = resource_id::text)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_relation (
 id uuid PRIMARY KEY,
 source_id uuid NOT NULL REFERENCES resource(id) ON DELETE RESTRICT,
 target_id uuid NOT NULL REFERENCES resource(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version > 0), active boolean NOT NULL, record jsonb NOT NULL,
 CONSTRAINT observatory_relation_identity CHECK(source_id <> target_id AND record->>'id' = id::text AND record->>'sourceId' = source_id::text AND record->>'targetId' = target_id::text)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_relation_source ON observatory_relation(source_id,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_relation_target ON observatory_relation(target_id,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_provider_mapping (
 id uuid PRIMARY KEY,
 resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE RESTRICT,
 provider_resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE RESTRICT,
 feed_id text NOT NULL CHECK(feed_id = 'cloudflare'), component_id text NOT NULL,
 version integer NOT NULL CHECK(version > 0), active boolean NOT NULL, record jsonb NOT NULL,
 CONSTRAINT observatory_mapping_identity CHECK(record->>'id' = id::text AND record->>'resourceId' = resource_id::text AND record->>'providerId' = provider_resource_id::text)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_mapping_resource ON observatory_provider_mapping(resource_id,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_named_view (
 id uuid PRIMARY KEY, owner_id text NOT NULL, name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), version integer NOT NULL CHECK(version > 0), configuration jsonb NOT NULL, updated_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_view_owner ON observatory_named_view(owner_id,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_client_scope (
 client_id uuid PRIMARY KEY REFERENCES foundation_client(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version > 0), resource_ids jsonb NOT NULL CHECK(jsonb_typeof(resource_ids)='array'), updated_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_source (
 id uuid PRIMARY KEY, resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('infraagent-monitor','github-repository')), external_id text NOT NULL,
 enabled boolean NOT NULL, version integer NOT NULL CHECK(version > 0), freshness_seconds integer NOT NULL CHECK(freshness_seconds BETWEEN 30 AND 86400), provenance jsonb NOT NULL,
 last_attempt_at timestamptz, last_success_at timestamptz, last_error text,
 failures integer NOT NULL DEFAULT 0 CHECK(failures >= 0), next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_id uuid, lease_until timestamptz, snapshot jsonb,
 CONSTRAINT observatory_source_snapshot_size CHECK(snapshot IS NULL OR (jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=8388608))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_source_resource ON observatory_source(resource_id,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_source_due ON observatory_source(enabled,next_attempt_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_observation (
 source_id uuid NOT NULL REFERENCES observatory_source(id) ON DELETE RESTRICT, content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'), received_at timestamptz NOT NULL, observed_at timestamptz NOT NULL, raw_payload jsonb NOT NULL, signals jsonb NOT NULL,
 PRIMARY KEY(source_id,content_digest),
 CONSTRAINT observatory_observation_size CHECK(jsonb_typeof(raw_payload)='object' AND octet_length(raw_payload::text)<=8388608 AND jsonb_typeof(signals)='array')
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='observatory_observation_immutable' AND tgrelid='public.observatory_observation'::regclass) THEN CREATE TRIGGER observatory_observation_immutable BEFORE UPDATE OR DELETE ON observatory_observation FOR EACH ROW EXECUTE FUNCTION observatory_provider_history_immutable(); END IF; END $$;
--> statement-breakpoint
DO $$ DECLARE target_role record; privilege text; table_name text; BEGIN FOR target_role IN SELECT r.rolname FROM pg_roles r WHERE NOT r.rolsuper AND r.rolname<>current_user AND r.rolname<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.resource'::regclass) LOOP FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP IF has_table_privilege(target_role.rolname,'public.resource',privilege) AND has_table_privilege(target_role.rolname,'public.project_resource_link',privilege) THEN FOREACH table_name IN ARRAY ARRAY['observatory_annotation','observatory_relation','observatory_provider_mapping','observatory_named_view','observatory_client_scope','observatory_source','observatory_observation'] LOOP EXECUTE format('GRANT %s ON TABLE public.%I TO %I',privilege,table_name,target_role.rolname); END LOOP; END IF; END LOOP; END LOOP; END $$;
