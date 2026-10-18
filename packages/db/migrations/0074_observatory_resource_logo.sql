-- Owner-reviewed processed repository logos. Existing records and grants are unchanged.
CREATE TABLE IF NOT EXISTS observatory_resource_logo (
 resource_id uuid PRIMARY KEY REFERENCES resource(id) ON DELETE RESTRICT,
 version integer NOT NULL, active boolean NOT NULL, digest text NOT NULL, image bytea NOT NULL,
 source jsonb NOT NULL, provenance jsonb NOT NULL, updated_at timestamptz NOT NULL,
 CONSTRAINT observatory_logo_valid CHECK(version > 0 AND digest ~ '^[a-f0-9]{64}$' AND octet_length(image) BETWEEN 33 AND 262144 AND source->>'kind' IN ('upload','repository_file'))
);
--> statement-breakpoint
DO $$ DECLARE target_role record; privilege text; BEGIN FOR target_role IN SELECT r.rolname FROM pg_roles r WHERE NOT r.rolsuper AND r.rolname<>current_user AND r.rolname<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.resource'::regclass) LOOP FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP IF has_table_privilege(target_role.rolname,'public.resource',privilege) AND has_table_privilege(target_role.rolname,'public.observatory_annotation',privilege) THEN EXECUTE format('GRANT %s ON TABLE public.observatory_resource_logo TO %I',privilege,target_role.rolname); END IF; END LOOP; END LOOP; END $$;
