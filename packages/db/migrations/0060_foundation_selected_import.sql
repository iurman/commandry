CREATE TABLE "foundation_import_original_source" (
	"revision_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"evidence_id" uuid NOT NULL,
	"content_digest" text NOT NULL,
	"original_content" "bytea" NOT NULL,
	CONSTRAINT "foundation_import_original_source_revision_id_ordinal_pk" PRIMARY KEY("revision_id","ordinal"),
	CONSTRAINT "foundation_import_original_order_valid" CHECK ("foundation_import_original_source"."ordinal" between 0 and 999),
	CONSTRAINT "foundation_import_original_digest_valid" CHECK ("foundation_import_original_source"."content_digest" = encode(sha256("foundation_import_original_source"."original_content"), 'hex'))
);
--> statement-breakpoint
CREATE TABLE "foundation_import_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"external_id" text NOT NULL,
	"memory_id" uuid NOT NULL,
	"memory_version" integer NOT NULL,
	"source_count" integer NOT NULL,
	"environment" text NOT NULL,
	"record" jsonb NOT NULL,
	"creation_transaction" text DEFAULT pg_current_xact_id()::text NOT NULL,
	CONSTRAINT "foundation_import_version_valid" CHECK ("foundation_import_revision"."memory_version" > 0),
	CONSTRAINT "foundation_import_count_valid" CHECK ("foundation_import_revision"."source_count" between 1 and 1000),
	CONSTRAINT "foundation_import_alias_valid" CHECK (length(trim("foundation_import_revision"."namespace")) between 1 and 100 and length(trim("foundation_import_revision"."external_id")) between 1 and 500),
	CONSTRAINT "foundation_import_environment_valid" CHECK ("foundation_import_revision"."environment" in ('local','test','preview','production')),
	CONSTRAINT "foundation_import_record_valid" CHECK ((jsonb_typeof("foundation_import_revision"."record") = 'object' and "foundation_import_revision"."record"->'schemaVersion' = '1'::jsonb and "foundation_import_revision"."record"->>'id' = "foundation_import_revision"."id"::text and "foundation_import_revision"."record"->>'projectId' = "foundation_import_revision"."project_id"::text and "foundation_import_revision"."record"->'alias' = jsonb_build_object('namespace', "foundation_import_revision"."namespace", 'externalId', "foundation_import_revision"."external_id") and "foundation_import_revision"."record"->>'memoryId' = "foundation_import_revision"."memory_id"::text and "foundation_import_revision"."record"->'memoryVersion' = to_jsonb("foundation_import_revision"."memory_version") and "foundation_import_revision"."record"->'sourceCount' = to_jsonb("foundation_import_revision"."source_count") and "foundation_import_revision"."record"->>'environment' = "foundation_import_revision"."environment" and jsonb_typeof("foundation_import_revision"."record"->'sourceFingerprint') = 'string' and "foundation_import_revision"."record"->>'sourceFingerprint' ~ '^[a-f0-9]{64}$' and jsonb_typeof("foundation_import_revision"."record"->'selectionFingerprint') = 'string' and "foundation_import_revision"."record"->>'selectionFingerprint' ~ '^[a-f0-9]{64}$' and jsonb_typeof("foundation_import_revision"."record"->'memoryContentDigest') = 'string' and "foundation_import_revision"."record"->>'memoryContentDigest' ~ '^[a-f0-9]{64}$' and "foundation_import_revision"."record"->>'sourceTier' in ('public','private','client','unknown') and jsonb_typeof("foundation_import_revision"."record"->'reviewedBy') = 'string' and length(trim("foundation_import_revision"."record"->>'reviewedBy')) between 1 and 4000 and jsonb_typeof("foundation_import_revision"."record"->'reviewedAt') = 'string' and jsonb_typeof("foundation_import_revision"."record"->'recordedAt') = 'string' and "foundation_import_revision"."record"->>'correlationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') is true)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_import_revision_scope_idx" ON "foundation_import_revision" USING btree ("id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_import_memory_version_idx" ON "foundation_import_revision" USING btree ("memory_id","memory_version","project_id");
--> statement-breakpoint
CREATE INDEX "foundation_import_alias_lookup_idx" ON "foundation_import_revision" USING btree ("project_id","environment","namespace","external_id","memory_version","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_alias_memory_scope_idx" ON "foundation_memory_alias" USING btree ("project_id","namespace","external_id","memory_id");
--> statement-breakpoint
ALTER TABLE "foundation_import_original_source" ADD CONSTRAINT "foundation_import_original_parent_fk" FOREIGN KEY ("revision_id","project_id") REFERENCES "public"."foundation_import_revision"("id","project_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "foundation_import_original_source" ADD CONSTRAINT "foundation_import_original_evidence_fk" FOREIGN KEY ("evidence_id","project_id") REFERENCES "public"."foundation_evidence"("id","project_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "foundation_import_revision" ADD CONSTRAINT "foundation_import_revision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "foundation_import_revision" ADD CONSTRAINT "foundation_import_memory_revision_fk" FOREIGN KEY ("memory_id","memory_version","project_id") REFERENCES "public"."foundation_memory_revision"("memory_id","version","project_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "foundation_import_revision" ADD CONSTRAINT "foundation_import_alias_scope_fk" FOREIGN KEY ("project_id","namespace","external_id","memory_id") REFERENCES "public"."foundation_memory_alias"("project_id","namespace","external_id","memory_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION public.commandry_foundation_import_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Selected import history is immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'foundation_import_history_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_import_history_immutable
BEFORE UPDATE OR DELETE ON public.foundation_import_revision
FOR EACH ROW EXECUTE FUNCTION public.commandry_foundation_import_immutable();
--> statement-breakpoint
CREATE TRIGGER foundation_import_history_immutable
BEFORE UPDATE OR DELETE ON public.foundation_import_original_source
FOR EACH ROW EXECUTE FUNCTION public.commandry_foundation_import_immutable();
--> statement-breakpoint
CREATE TRIGGER foundation_import_creation_transaction
BEFORE INSERT ON public.foundation_import_revision
FOR EACH ROW EXECUTE FUNCTION public.commandry_foundation_creation_transaction();
--> statement-breakpoint
CREATE FUNCTION public.commandry_foundation_import_memory_membership_closed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  -- Canonical evidence is complete before an import baseline is inserted. This
  -- closes canonical-side appends after an early SET CONSTRAINTS ALL IMMEDIATE,
  -- when the parent completeness trigger has already fired in this transaction.
  IF EXISTS (
    SELECT 1 FROM public.foundation_import_revision
      WHERE project_id = NEW.project_id AND memory_id = NEW.memory_id AND memory_version = NEW.version
  ) THEN
    RAISE EXCEPTION 'Imported canonical evidence membership is closed'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_import_memory_membership_closed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_import_memory_membership_closed
BEFORE INSERT ON public.foundation_memory_evidence
FOR EACH ROW EXECUTE FUNCTION public.commandry_foundation_import_memory_membership_closed();
--> statement-breakpoint
CREATE FUNCTION public.commandry_foundation_import_membership_closed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  parent public.foundation_import_revision%ROWTYPE;
  expected_evidence uuid;
  expected_digest text;
BEGIN
  SELECT * INTO parent FROM public.foundation_import_revision
    WHERE id = NEW.revision_id AND project_id = NEW.project_id;
  IF NOT FOUND OR parent.creation_transaction IS DISTINCT FROM pg_current_xact_id()::text
     OR NEW.ordinal < 0 OR NEW.ordinal >= parent.source_count THEN
    RAISE EXCEPTION 'Selected import membership is closed'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_import_membership_closed';
  END IF;
  SELECT m.evidence_id, e.content_digest INTO expected_evidence, expected_digest
    FROM public.foundation_memory_evidence m
    JOIN public.foundation_evidence e ON e.id = m.evidence_id AND e.project_id = m.project_id
    WHERE m.project_id = parent.project_id AND m.memory_id = parent.memory_id
      AND m.version = parent.memory_version AND m.ordinal = NEW.ordinal;
  IF NOT FOUND OR NEW.evidence_id IS DISTINCT FROM expected_evidence
     OR NEW.content_digest IS DISTINCT FROM expected_digest THEN
    RAISE EXCEPTION 'Selected import source does not match its canonical evidence'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_import_membership_closed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_import_membership_closed
BEFORE INSERT ON public.foundation_import_original_source
FOR EACH ROW EXECUTE FUNCTION public.commandry_foundation_import_membership_closed();
--> statement-breakpoint
CREATE FUNCTION public.commandry_foundation_import_membership_complete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  source_total bigint;
  canonical_total bigint;
  first_ordinal integer;
  last_ordinal integer;
  memory_digest text;
BEGIN
  SELECT count(*), min(ordinal), max(ordinal)
    INTO source_total, first_ordinal, last_ordinal
    FROM public.foundation_import_original_source
    WHERE revision_id = NEW.id AND project_id = NEW.project_id;
  SELECT count(*) INTO canonical_total FROM public.foundation_memory_evidence
    WHERE memory_id = NEW.memory_id AND version = NEW.memory_version AND project_id = NEW.project_id;
  SELECT content_digest INTO memory_digest FROM public.foundation_memory_revision
    WHERE memory_id = NEW.memory_id AND version = NEW.memory_version AND project_id = NEW.project_id;
  IF source_total <> NEW.source_count OR canonical_total <> NEW.source_count
     OR first_ordinal IS DISTINCT FROM 0 OR last_ordinal IS DISTINCT FROM NEW.source_count - 1
     OR memory_digest IS DISTINCT FROM NEW.record->>'memoryContentDigest'
     OR EXISTS (
       SELECT 1 FROM public.foundation_import_original_source s
       LEFT JOIN public.foundation_memory_evidence m
         ON m.project_id = NEW.project_id AND m.memory_id = NEW.memory_id
         AND m.version = NEW.memory_version AND m.ordinal = s.ordinal
       LEFT JOIN public.foundation_evidence e ON e.id = s.evidence_id AND e.project_id = s.project_id
       WHERE s.revision_id = NEW.id AND s.project_id = NEW.project_id
         AND (m.evidence_id IS DISTINCT FROM s.evidence_id OR e.content_digest IS DISTINCT FROM s.content_digest)
     ) THEN
    RAISE EXCEPTION 'Selected import requires its complete ordered original sources'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_import_membership_complete';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_import_membership_complete
AFTER INSERT ON public.foundation_import_revision
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.commandry_foundation_import_membership_complete();
