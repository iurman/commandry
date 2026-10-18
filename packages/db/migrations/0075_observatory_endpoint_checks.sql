-- Operator-configured native HTTP/TCP probes; existing records/grants are preserved.
ALTER TABLE observatory_source DROP CONSTRAINT IF EXISTS observatory_source_kind_check;
--> statement-breakpoint
ALTER TABLE observatory_source ADD CONSTRAINT observatory_source_kind_check CHECK(kind IN ('infraagent-monitor','github-repository','http-readiness','endpoint-check','cloudflare-account','namecheap-account') AND (kind <> 'http-readiness' OR external_id = 'commandry-web-readiness'));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS observatory_inventory_resource (
 external_key text PRIMARY KEY,
 source_id uuid NOT NULL REFERENCES observatory_source(id) ON DELETE RESTRICT,
 resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE RESTRICT,
 provider_name text NOT NULL, provider_url text NOT NULL,
 last_seen_at timestamptz NOT NULL
);
--> statement-breakpoint
DO $$ DECLARE target_role record; privilege text; BEGIN FOR target_role IN SELECT r.rolname FROM pg_roles r WHERE NOT r.rolsuper AND r.rolname<>current_user AND r.rolname<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.resource'::regclass) LOOP FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP IF has_table_privilege(target_role.rolname,'public.resource',privilege) AND has_table_privilege(target_role.rolname,'public.observatory_source',privilege) THEN EXECUTE format('GRANT %s ON TABLE public.observatory_inventory_resource TO %I',privilege,target_role.rolname); END IF; END LOOP; END LOOP; END $$;

--> statement-breakpoint
ALTER TABLE foundation_client DROP CONSTRAINT IF EXISTS foundation_client_operations_valid;
--> statement-breakpoint
ALTER TABLE foundation_client ADD CONSTRAINT foundation_client_operations_valid CHECK (jsonb_typeof(operations) = 'array' AND jsonb_array_length(operations) BETWEEN 1 AND 20 AND operations <@ '["foundation.read","work.read","resources.read","observatory.read","observatory.signals.read","observatory.security.read","observatory.providers.read","observatory.inventory.read","work.propose","evidence.record","memory.propose","memory.revise","configuration.record","evaluation.record","improvement.read","improvement.propose","finding.read","finding.propose","onboarding.read","onboarding.propose"]'::jsonb);
