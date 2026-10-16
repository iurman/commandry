CREATE TABLE "foundation_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"principal_id" text NOT NULL,
	"client_id" uuid,
	"operation" text NOT NULL,
	"decision" text NOT NULL,
	"code" text NOT NULL,
	"target_id" uuid,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foundation_audit_decision_valid" CHECK ("foundation_audit"."decision" in ('allowed','denied')),
	CONSTRAINT "foundation_audit_environment_valid" CHECK ("foundation_audit"."environment" in ('local','test','preview','production'))
);
--> statement-breakpoint
CREATE TABLE "foundation_client" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"operations" jsonb NOT NULL,
	"environment" text NOT NULL,
	"token_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "foundation_client_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "foundation_client_digest_valid" CHECK ("foundation_client"."token_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "foundation_client_name_valid" CHECK (length(trim("foundation_client"."name")) between 1 and 100),
	CONSTRAINT "foundation_client_environment_valid" CHECK ("foundation_client"."environment" in ('local','test','preview','production')),
	CONSTRAINT "foundation_client_expiry_valid" CHECK ("foundation_client"."expires_at" > "foundation_client"."created_at" and ("foundation_client"."revoked_at" is null or "foundation_client"."revoked_at" >= "foundation_client"."created_at")),
	CONSTRAINT "foundation_client_operations_valid" CHECK (jsonb_typeof("foundation_client"."operations") = 'array' and jsonb_array_length("foundation_client"."operations") between 1 and 6 and "foundation_client"."operations" <@ '["foundation.read","evidence.record","memory.propose","memory.revise","configuration.record","evaluation.record"]'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "foundation_configuration" (
	"creation_transaction" text DEFAULT pg_current_xact_id()::text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"content_digest" text NOT NULL,
	"source_commit" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"recorded_by" text NOT NULL,
	CONSTRAINT "foundation_configuration_kind_valid" CHECK ("foundation_configuration"."kind" in ('prompt','skill','hook','loop','runtime','model','settings')),
	CONSTRAINT "foundation_configuration_digest_valid" CHECK ("foundation_configuration"."content_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "foundation_configuration_content_valid" CHECK (length("foundation_configuration"."content") <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "foundation_configuration_parent" (
	"configuration_id" uuid NOT NULL,
	"parent_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "foundation_configuration_parent_configuration_id_parent_id_pk" PRIMARY KEY("configuration_id","parent_id"),
	CONSTRAINT "foundation_configuration_parent_valid" CHECK ("foundation_configuration_parent"."ordinal" >= 0 and "foundation_configuration_parent"."configuration_id" <> "foundation_configuration_parent"."parent_id")
);
--> statement-breakpoint
CREATE TABLE "foundation_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version" text,
	"content_digest" text NOT NULL,
	"locator" text NOT NULL,
	"observed_at" text,
	"availability" text NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"recorded_by" text NOT NULL,
	"verification" text NOT NULL,
	"capture_id" uuid,
	"knowledge_item_id" uuid,
	"knowledge_version" integer,
	CONSTRAINT "foundation_evidence_digest_valid" CHECK ("foundation_evidence"."content_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "foundation_evidence_source_valid" CHECK (("foundation_evidence"."source_kind" = 'capture' and "foundation_evidence"."capture_id" is not null and "foundation_evidence"."source_id" = "foundation_evidence"."capture_id"::text and "foundation_evidence"."knowledge_item_id" is null and "foundation_evidence"."knowledge_version" is null and "foundation_evidence"."source_version" is null) or ("foundation_evidence"."source_kind" = 'knowledge_revision' and "foundation_evidence"."knowledge_item_id" is not null and "foundation_evidence"."source_id" = "foundation_evidence"."knowledge_item_id"::text and "foundation_evidence"."knowledge_version" is not null and "foundation_evidence"."source_version" is not null and "foundation_evidence"."knowledge_version" > 0 and "foundation_evidence"."source_version" = "foundation_evidence"."knowledge_version"::text and "foundation_evidence"."capture_id" is null) or ("foundation_evidence"."source_kind" in ('artifact','external') and "foundation_evidence"."capture_id" is null and "foundation_evidence"."knowledge_item_id" is null and "foundation_evidence"."knowledge_version" is null)),
	CONSTRAINT "foundation_evidence_availability_valid" CHECK ("foundation_evidence"."availability" in ('available','unavailable')),
	CONSTRAINT "foundation_evidence_verification_valid" CHECK ("foundation_evidence"."verification" in ('unverified','source_matched','independently_verified'))
);
--> statement-breakpoint
CREATE TABLE "foundation_idempotency" (
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"principal_id" text NOT NULL,
	"operation" text NOT NULL,
	"key_digest" text NOT NULL,
	"request_digest" text NOT NULL,
	"result_digest" text NOT NULL,
	"result" jsonb NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foundation_idempotency_project_id_environment_principal_id_operation_key_digest_pk" PRIMARY KEY("project_id","environment","principal_id","operation","key_digest"),
	CONSTRAINT "foundation_idempotency_digests_valid" CHECK ("foundation_idempotency"."key_digest" ~ '^[a-f0-9]{64}$' and "foundation_idempotency"."request_digest" ~ '^[a-f0-9]{64}$' and "foundation_idempotency"."result_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "foundation_idempotency_environment_valid" CHECK ("foundation_idempotency"."environment" in ('local','test','preview','production'))
);
--> statement-breakpoint
CREATE TABLE "foundation_instruction_approval" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_digest" text NOT NULL,
	"disclosure_project_id" uuid NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_by" text NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "foundation_approval_digest_valid" CHECK ("foundation_instruction_approval"."content_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "foundation_approval_disclosure_valid" CHECK ("foundation_instruction_approval"."disclosure_project_id" = "foundation_instruction_approval"."project_id"),
	CONSTRAINT "foundation_approval_expiry_valid" CHECK ("foundation_instruction_approval"."expires_at" > "foundation_instruction_approval"."approved_at" and ("foundation_instruction_approval"."revoked_at" is null or "foundation_instruction_approval"."revoked_at" >= "foundation_instruction_approval"."approved_at"))
);
--> statement-breakpoint
CREATE TABLE "foundation_memory" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"current_version" integer NOT NULL,
	"lifecycle" text NOT NULL,
	"verification" text NOT NULL,
	CONSTRAINT "foundation_memory_version_valid" CHECK ("foundation_memory"."current_version" > 0),
	CONSTRAINT "foundation_memory_lifecycle_valid" CHECK ("foundation_memory"."lifecycle" in ('proposed','accepted','rejected','superseded')),
	CONSTRAINT "foundation_memory_verification_valid" CHECK ("foundation_memory"."verification" in ('unverified','source_matched','independently_verified'))
);
--> statement-breakpoint
CREATE TABLE "foundation_memory_alias" (
	"project_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"external_id" text NOT NULL,
	"memory_id" uuid NOT NULL,
	CONSTRAINT "foundation_memory_alias_project_id_namespace_external_id_pk" PRIMARY KEY("project_id","namespace","external_id"),
	CONSTRAINT "foundation_alias_valid" CHECK (length(trim("foundation_memory_alias"."namespace")) between 1 and 100 and length(trim("foundation_memory_alias"."external_id")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "foundation_memory_evidence" (
	"memory_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"project_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "foundation_memory_evidence_memory_id_version_evidence_id_pk" PRIMARY KEY("memory_id","version","evidence_id"),
	CONSTRAINT "foundation_memory_evidence_order_valid" CHECK ("foundation_memory_evidence"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "foundation_memory_relation" (
	"memory_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"project_id" uuid NOT NULL,
	"related_memory_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "foundation_memory_relation_memory_id_version_related_memory_id_pk" PRIMARY KEY("memory_id","version","related_memory_id"),
	CONSTRAINT "foundation_memory_relation_order_valid" CHECK ("foundation_memory_relation"."ordinal" >= 0 and "foundation_memory_relation"."memory_id" <> "foundation_memory_relation"."related_memory_id")
);
--> statement-breakpoint
CREATE TABLE "foundation_memory_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "foundation_review_decision_valid" CHECK ("foundation_memory_review"."decision" in ('accepted','rejected','superseded')),
	CONSTRAINT "foundation_review_reason_valid" CHECK (length(trim("foundation_memory_review"."reason")) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "foundation_memory_revision" (
	"creation_transaction" text DEFAULT pg_current_xact_id()::text NOT NULL,
	"memory_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_digest" text NOT NULL,
	"statement" text NOT NULL,
	"category" text NOT NULL,
	"relation_type" text,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"anchor_evidence_id" uuid NOT NULL,
	"anchor_knowledge_version" integer NOT NULL,
	CONSTRAINT "foundation_memory_revision_memory_id_version_project_id_pk" PRIMARY KEY("memory_id","version","project_id"),
	CONSTRAINT "foundation_revision_version_valid" CHECK ("foundation_memory_revision"."version" > 0 and "foundation_memory_revision"."anchor_knowledge_version" > 0),
	CONSTRAINT "foundation_revision_digest_valid" CHECK ("foundation_memory_revision"."content_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "foundation_revision_statement_valid" CHECK (length(trim("foundation_memory_revision"."statement")) between 1 and 20000),
	CONSTRAINT "foundation_revision_category_valid" CHECK ("foundation_memory_revision"."category" in ('finding','preference','instruction','decision')),
	CONSTRAINT "foundation_revision_relation_valid" CHECK ("foundation_memory_revision"."relation_type" is null or "foundation_memory_revision"."relation_type" in ('contradicts','supersedes'))
);
--> statement-breakpoint
CREATE TABLE "foundation_memory_verification" (
	"creation_transaction" text DEFAULT pg_current_xact_id()::text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"verification" text NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "foundation_verification_state_valid" CHECK ("foundation_memory_verification"."verification" in ('source_matched','independently_verified')),
	CONSTRAINT "foundation_verification_reason_valid" CHECK (length(trim("foundation_memory_verification"."reason")) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "foundation_verification_evidence" (
	"verification_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "foundation_verification_evidence_verification_id_evidence_id_pk" PRIMARY KEY("verification_id","evidence_id"),
	CONSTRAINT "foundation_verification_evidence_order_valid" CHECK ("foundation_verification_evidence"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_client_scope_idx" ON "foundation_client" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_configuration_scope_idx" ON "foundation_configuration" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_configuration_parent_order_idx" ON "foundation_configuration_parent" USING btree ("configuration_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_evidence_scope_idx" ON "foundation_evidence" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_memory_scope_idx" ON "foundation_memory" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_memory_evidence_order_idx" ON "foundation_memory_evidence" USING btree ("memory_id","version","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_memory_relation_order_idx" ON "foundation_memory_relation" USING btree ("memory_id","version","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_verification_scope_idx" ON "foundation_memory_verification" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_verification_evidence_order_idx" ON "foundation_verification_evidence" USING btree ("verification_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_id_project_unique_idx" ON "capture" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_item_id_project_unique_idx" ON "knowledge_item" USING btree ("id","project_id");--> statement-breakpoint
ALTER TABLE "foundation_audit" ADD CONSTRAINT "foundation_audit_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_audit" ADD CONSTRAINT "foundation_audit_client_id_foundation_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."foundation_client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_client" ADD CONSTRAINT "foundation_client_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_configuration" ADD CONSTRAINT "foundation_configuration_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_configuration_parent" ADD CONSTRAINT "foundation_configuration_parent_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_configuration_parent" ADD CONSTRAINT "foundation_configuration_child_scope_fk" FOREIGN KEY ("configuration_id","project_id") REFERENCES "public"."foundation_configuration"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_configuration_parent" ADD CONSTRAINT "foundation_configuration_parent_scope_fk" FOREIGN KEY ("parent_id","project_id") REFERENCES "public"."foundation_configuration"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_capture_scope_fk" FOREIGN KEY ("capture_id","project_id") REFERENCES "public"."capture"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_knowledge_scope_fk" FOREIGN KEY ("knowledge_item_id","project_id") REFERENCES "public"."knowledge_item"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_idempotency" ADD CONSTRAINT "foundation_idempotency_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_instruction_approval" ADD CONSTRAINT "foundation_instruction_approval_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_instruction_approval" ADD CONSTRAINT "foundation_approval_revision_fk" FOREIGN KEY ("memory_id","version","project_id") REFERENCES "public"."foundation_memory_revision"("memory_id","version","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory" ADD CONSTRAINT "foundation_memory_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory" ADD CONSTRAINT "foundation_memory_knowledge_scope_fk" FOREIGN KEY ("knowledge_item_id","project_id") REFERENCES "public"."knowledge_item"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_alias" ADD CONSTRAINT "foundation_memory_alias_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_alias" ADD CONSTRAINT "foundation_alias_memory_scope_fk" FOREIGN KEY ("memory_id","project_id") REFERENCES "public"."foundation_memory"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_evidence" ADD CONSTRAINT "foundation_memory_evidence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_evidence" ADD CONSTRAINT "foundation_memory_evidence_revision_fk" FOREIGN KEY ("memory_id","version","project_id") REFERENCES "public"."foundation_memory_revision"("memory_id","version","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_evidence" ADD CONSTRAINT "foundation_memory_evidence_scope_fk" FOREIGN KEY ("evidence_id","project_id") REFERENCES "public"."foundation_evidence"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_relation" ADD CONSTRAINT "foundation_memory_relation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_relation" ADD CONSTRAINT "foundation_memory_relation_revision_fk" FOREIGN KEY ("memory_id","version","project_id") REFERENCES "public"."foundation_memory_revision"("memory_id","version","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_relation" ADD CONSTRAINT "foundation_memory_relation_scope_fk" FOREIGN KEY ("related_memory_id","project_id") REFERENCES "public"."foundation_memory"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_review" ADD CONSTRAINT "foundation_memory_review_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_review" ADD CONSTRAINT "foundation_review_revision_fk" FOREIGN KEY ("memory_id","version","project_id") REFERENCES "public"."foundation_memory_revision"("memory_id","version","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_revision" ADD CONSTRAINT "foundation_memory_revision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_revision" ADD CONSTRAINT "foundation_revision_memory_scope_fk" FOREIGN KEY ("memory_id","project_id") REFERENCES "public"."foundation_memory"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_revision" ADD CONSTRAINT "foundation_revision_anchor_scope_fk" FOREIGN KEY ("anchor_evidence_id","project_id") REFERENCES "public"."foundation_evidence"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_verification" ADD CONSTRAINT "foundation_memory_verification_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_memory_verification" ADD CONSTRAINT "foundation_verification_revision_fk" FOREIGN KEY ("memory_id","version","project_id") REFERENCES "public"."foundation_memory_revision"("memory_id","version","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_verification_evidence" ADD CONSTRAINT "foundation_verification_evidence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_verification_evidence" ADD CONSTRAINT "foundation_verification_evidence_parent_fk" FOREIGN KEY ("verification_id","project_id") REFERENCES "public"."foundation_memory_verification"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_verification_evidence" ADD CONSTRAINT "foundation_verification_evidence_scope_fk" FOREIGN KEY ("evidence_id","project_id") REFERENCES "public"."foundation_evidence"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foundation_audit_page_idx" ON "foundation_audit" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "foundation_client_page_idx" ON "foundation_client" USING btree ("project_id","environment","id");--> statement-breakpoint
CREATE INDEX "foundation_configuration_page_idx" ON "foundation_configuration" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "foundation_evidence_page_idx" ON "foundation_evidence" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "foundation_approval_memory_idx" ON "foundation_instruction_approval" USING btree ("project_id","memory_id","version");--> statement-breakpoint
CREATE INDEX "foundation_memory_knowledge_idx" ON "foundation_memory" USING btree ("project_id","knowledge_item_id","id");

--> statement-breakpoint
ALTER TABLE foundation_memory ADD CONSTRAINT foundation_memory_current_revision_fk
  FOREIGN KEY (id, current_version, project_id)
  REFERENCES foundation_memory_revision(memory_id, version, project_id)
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION commandry_foundation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Foundation history is immutable' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'foundation_evidence','foundation_memory_revision','foundation_memory_evidence',
    'foundation_memory_relation','foundation_memory_alias','foundation_memory_review',
    'foundation_memory_verification','foundation_verification_evidence',
    'foundation_configuration','foundation_configuration_parent',
    'foundation_idempotency','foundation_audit'
  ] LOOP
    EXECUTE format('CREATE TRIGGER foundation_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION commandry_foundation_immutable()', table_name);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION commandry_foundation_revocation_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Foundation grant history is immutable' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at')
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'Foundation authority is immutable except first revocation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_client_immutable BEFORE UPDATE OR DELETE ON foundation_client
  FOR EACH ROW EXECUTE FUNCTION commandry_foundation_revocation_only();
--> statement-breakpoint
CREATE TRIGGER foundation_approval_immutable BEFORE UPDATE OR DELETE ON foundation_instruction_approval
  FOR EACH ROW EXECUTE FUNCTION commandry_foundation_revocation_only();
--> statement-breakpoint
CREATE FUNCTION commandry_foundation_memory_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Foundation memory history is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.knowledge_item_id IS DISTINCT FROM OLD.knowledge_item_id
     OR NEW.current_version NOT IN (OLD.current_version, OLD.current_version + 1)
     OR (NEW.current_version <> OLD.current_version AND (NEW.lifecycle <> 'proposed' OR NEW.verification <> 'unverified')) THEN
    RAISE EXCEPTION 'Invalid foundation memory transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_memory_head_valid BEFORE UPDATE OR DELETE ON foundation_memory
  FOR EACH ROW EXECUTE FUNCTION commandry_foundation_memory_head();
--> statement-breakpoint
CREATE FUNCTION commandry_foundation_revision_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source foundation_evidence%ROWTYPE;
  parent foundation_memory%ROWTYPE;
  evidence_count integer;
  relation_count integer;
BEGIN
  SELECT * INTO source FROM foundation_evidence WHERE id = NEW.anchor_evidence_id AND project_id = NEW.project_id;
  SELECT * INTO parent FROM foundation_memory WHERE id = NEW.memory_id AND project_id = NEW.project_id;
  SELECT count(*) INTO evidence_count FROM foundation_memory_evidence
    WHERE memory_id = NEW.memory_id AND version = NEW.version AND project_id = NEW.project_id;
  SELECT count(*) INTO relation_count FROM foundation_memory_relation
    WHERE memory_id = NEW.memory_id AND version = NEW.version AND project_id = NEW.project_id;
  IF NOT ((source.source_kind = 'knowledge_revision'
       AND source.knowledge_item_id = parent.knowledge_item_id
       AND source.knowledge_version = NEW.anchor_knowledge_version)
     OR (source.source_kind = 'capture' AND EXISTS (SELECT 1 FROM knowledge_item k
       WHERE k.id = parent.knowledge_item_id AND k.project_id = NEW.project_id
       AND k.source_capture_id = source.capture_id)))
     OR evidence_count NOT BETWEEN 1 AND 1000 OR relation_count > 1000
     OR ((NEW.relation_type IS NULL) <> (relation_count = 0))
     OR NOT EXISTS (SELECT 1 FROM foundation_memory_evidence WHERE memory_id = NEW.memory_id
       AND version = NEW.version AND evidence_id = NEW.anchor_evidence_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Incomplete foundation revision provenance' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_revision_complete AFTER INSERT ON foundation_memory_revision
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commandry_foundation_revision_complete();

--> statement-breakpoint
CREATE FUNCTION commandry_foundation_membership_closed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE same_transaction boolean;
BEGIN
  IF TG_TABLE_NAME IN ('foundation_memory_evidence','foundation_memory_relation') THEN
    SELECT creation_transaction = pg_current_xact_id()::text INTO same_transaction FROM foundation_memory_revision
      WHERE memory_id = NEW.memory_id AND version = NEW.version AND project_id = NEW.project_id;
  ELSIF TG_TABLE_NAME = 'foundation_configuration_parent' THEN
    SELECT creation_transaction = pg_current_xact_id()::text INTO same_transaction FROM foundation_configuration
      WHERE id = NEW.configuration_id AND project_id = NEW.project_id;
  ELSE
    SELECT creation_transaction = pg_current_xact_id()::text INTO same_transaction FROM foundation_memory_verification
      WHERE id = NEW.verification_id AND project_id = NEW.project_id;
  END IF;
  IF same_transaction IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Foundation provenance membership is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'foundation_memory_evidence','foundation_memory_relation',
    'foundation_configuration_parent','foundation_verification_evidence'
  ] LOOP
    EXECUTE format('CREATE TRIGGER foundation_membership_closed AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION commandry_foundation_membership_closed()', table_name);
  END LOOP;
END $$;

--> statement-breakpoint
CREATE FUNCTION commandry_foundation_creation_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.creation_transaction := pg_current_xact_id()::text;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'foundation_memory_revision','foundation_memory_verification','foundation_configuration'
  ] LOOP
    EXECUTE format('CREATE TRIGGER foundation_creation_transaction BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION commandry_foundation_creation_transaction()', table_name);
  END LOOP;
END $$;
