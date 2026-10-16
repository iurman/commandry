CREATE TABLE "foundation_evaluation_assessment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"trial_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"judge_configuration_id" uuid NOT NULL,
	"record" jsonb NOT NULL,
	CONSTRAINT "foundation_assessment_version_valid" CHECK ("foundation_evaluation_assessment"."version" > 0),
	CONSTRAINT "foundation_assessment_record_valid" CHECK ((jsonb_typeof("foundation_evaluation_assessment"."record") = 'object' and "foundation_evaluation_assessment"."record"->'schemaVersion' = '1'::jsonb and "foundation_evaluation_assessment"."record"->>'id' = "foundation_evaluation_assessment"."id"::text and "foundation_evaluation_assessment"."record"->>'projectId' = "foundation_evaluation_assessment"."project_id"::text and "foundation_evaluation_assessment"."record"->>'trialId' = "foundation_evaluation_assessment"."trial_id"::text and "foundation_evaluation_assessment"."record"->>'judgeConfigurationId' = "foundation_evaluation_assessment"."judge_configuration_id"::text and "foundation_evaluation_assessment"."record"->'version' = to_jsonb("foundation_evaluation_assessment"."version")) is true)
);
--> statement-breakpoint
CREATE TABLE "foundation_evaluation_definition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"record" jsonb NOT NULL,
	"creation_transaction" text DEFAULT pg_current_xact_id()::text NOT NULL,
	CONSTRAINT "foundation_eval_definition_version_valid" CHECK ("foundation_evaluation_definition"."version" = 1),
	CONSTRAINT "foundation_eval_definition_record_valid" CHECK ((jsonb_typeof("foundation_evaluation_definition"."record") = 'object' and "foundation_evaluation_definition"."record"->'schemaVersion' = '1'::jsonb and "foundation_evaluation_definition"."record"->>'id' = "foundation_evaluation_definition"."id"::text and "foundation_evaluation_definition"."record"->>'projectId' = "foundation_evaluation_definition"."project_id"::text and "foundation_evaluation_definition"."record"->'version' = to_jsonb("foundation_evaluation_definition"."version") and jsonb_typeof("foundation_evaluation_definition"."record"->'configurationIds') = 'array') is true)
);
--> statement-breakpoint
CREATE TABLE "foundation_evaluation_definition_configuration" (
	"definition_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "foundation_evaluation_definition_configuration_definition_id_configuration_id_pk" PRIMARY KEY("definition_id","configuration_id"),
	CONSTRAINT "foundation_eval_definition_config_order_valid" CHECK ("foundation_evaluation_definition_configuration"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "foundation_evaluation_trial" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"record" jsonb NOT NULL,
	"creation_transaction" text DEFAULT pg_current_xact_id()::text NOT NULL,
	CONSTRAINT "foundation_eval_trial_record_valid" CHECK ((jsonb_typeof("foundation_evaluation_trial"."record") = 'object' and "foundation_evaluation_trial"."record"->'schemaVersion' = '1'::jsonb and "foundation_evaluation_trial"."record"->>'id' = "foundation_evaluation_trial"."id"::text and "foundation_evaluation_trial"."record"->>'projectId' = "foundation_evaluation_trial"."project_id"::text and "foundation_evaluation_trial"."record"->>'definitionId' = "foundation_evaluation_trial"."definition_id"::text and "foundation_evaluation_trial"."record"->>'attemptId' = "foundation_evaluation_trial"."attempt_id"::text and jsonb_typeof("foundation_evaluation_trial"."record"->'configurationIds') = 'array') is true)
);
--> statement-breakpoint
CREATE TABLE "foundation_evaluation_trial_configuration" (
	"trial_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "foundation_evaluation_trial_configuration_trial_id_configuration_id_pk" PRIMARY KEY("trial_id","configuration_id"),
	CONSTRAINT "foundation_eval_trial_config_order_valid" CHECK ("foundation_evaluation_trial_configuration"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_eval_definition_scope_idx" ON "foundation_evaluation_definition" USING btree ("id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_eval_trial_scope_idx" ON "foundation_evaluation_trial" USING btree ("id","project_id");
--> statement-breakpoint
ALTER TABLE "foundation_evaluation_assessment" ADD CONSTRAINT "foundation_evaluation_assessment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_assessment" ADD CONSTRAINT "foundation_assessment_trial_scope_fk" FOREIGN KEY ("trial_id","project_id") REFERENCES "public"."foundation_evaluation_trial"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_assessment" ADD CONSTRAINT "foundation_assessment_judge_scope_fk" FOREIGN KEY ("judge_configuration_id","project_id") REFERENCES "public"."foundation_configuration"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_definition" ADD CONSTRAINT "foundation_evaluation_definition_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_definition_configuration" ADD CONSTRAINT "foundation_evaluation_definition_configuration_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_definition_configuration" ADD CONSTRAINT "foundation_eval_definition_config_parent_fk" FOREIGN KEY ("definition_id","project_id") REFERENCES "public"."foundation_evaluation_definition"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_definition_configuration" ADD CONSTRAINT "foundation_eval_definition_config_scope_fk" FOREIGN KEY ("configuration_id","project_id") REFERENCES "public"."foundation_configuration"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_trial" ADD CONSTRAINT "foundation_evaluation_trial_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_trial" ADD CONSTRAINT "foundation_eval_trial_definition_scope_fk" FOREIGN KEY ("definition_id","project_id") REFERENCES "public"."foundation_evaluation_definition"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_trial_configuration" ADD CONSTRAINT "foundation_evaluation_trial_configuration_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_trial_configuration" ADD CONSTRAINT "foundation_eval_trial_config_parent_fk" FOREIGN KEY ("trial_id","project_id") REFERENCES "public"."foundation_evaluation_trial"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evaluation_trial_configuration" ADD CONSTRAINT "foundation_eval_trial_config_scope_fk" FOREIGN KEY ("configuration_id","project_id") REFERENCES "public"."foundation_configuration"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_assessment_scope_idx" ON "foundation_evaluation_assessment" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_assessment_trial_version_idx" ON "foundation_evaluation_assessment" USING btree ("trial_id","version");--> statement-breakpoint
CREATE INDEX "foundation_assessment_trial_scope_idx" ON "foundation_evaluation_assessment" USING btree ("project_id","trial_id","version");--> statement-breakpoint
CREATE INDEX "foundation_eval_definition_project_idx" ON "foundation_evaluation_definition" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_eval_definition_config_order_idx" ON "foundation_evaluation_definition_configuration" USING btree ("definition_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_eval_trial_attempt_idx" ON "foundation_evaluation_trial" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "foundation_eval_trial_definition_idx" ON "foundation_evaluation_trial" USING btree ("project_id","definition_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_eval_trial_config_order_idx" ON "foundation_evaluation_trial_configuration" USING btree ("trial_id","ordinal");
--> statement-breakpoint
CREATE FUNCTION commandry_foundation_eval_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Evaluation history is immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'foundation_eval_history_immutable';
END $$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'foundation_evaluation_definition','foundation_evaluation_trial',
    'foundation_evaluation_assessment','foundation_evaluation_definition_configuration',
    'foundation_evaluation_trial_configuration'
  ] LOOP
    EXECUTE format('CREATE TRIGGER foundation_eval_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION commandry_foundation_eval_immutable()', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['foundation_evaluation_definition','foundation_evaluation_trial'] LOOP
    EXECUTE format('CREATE TRIGGER foundation_eval_creation_transaction BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION commandry_foundation_creation_transaction()', table_name);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION commandry_foundation_eval_membership_closed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE same_transaction boolean;
BEGIN
  IF TG_TABLE_NAME = 'foundation_evaluation_definition_configuration' THEN
    SELECT creation_transaction = pg_current_xact_id()::text INTO same_transaction
      FROM foundation_evaluation_definition WHERE id = NEW.definition_id AND project_id = NEW.project_id;
  ELSE
    SELECT creation_transaction = pg_current_xact_id()::text INTO same_transaction
      FROM foundation_evaluation_trial WHERE id = NEW.trial_id AND project_id = NEW.project_id;
  END IF;
  IF same_transaction IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Evaluation configuration membership is closed'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_eval_membership_closed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_eval_membership_closed BEFORE INSERT ON foundation_evaluation_definition_configuration
  FOR EACH ROW EXECUTE FUNCTION commandry_foundation_eval_membership_closed();
--> statement-breakpoint
CREATE TRIGGER foundation_eval_membership_closed BEFORE INSERT ON foundation_evaluation_trial_configuration
  FOR EACH ROW EXECUTE FUNCTION commandry_foundation_eval_membership_closed();
--> statement-breakpoint
CREATE FUNCTION commandry_foundation_eval_membership_complete() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  parent_id uuid;
  declared jsonb;
  observed jsonb;
  member_count bigint;
  first_ordinal integer;
  last_ordinal integer;
BEGIN
  IF TG_TABLE_NAME IN ('foundation_evaluation_definition','foundation_evaluation_definition_configuration') THEN
    IF TG_TABLE_NAME = 'foundation_evaluation_definition' THEN parent_id := NEW.id;
    ELSE parent_id := NEW.definition_id; END IF;
    SELECT record->'configurationIds' INTO declared FROM foundation_evaluation_definition
      WHERE id = parent_id AND project_id = NEW.project_id;
    SELECT coalesce(jsonb_agg(configuration_id::text ORDER BY ordinal), '[]'::jsonb), count(*), min(ordinal), max(ordinal)
      INTO observed, member_count, first_ordinal, last_ordinal
      FROM foundation_evaluation_definition_configuration WHERE definition_id = parent_id AND project_id = NEW.project_id;
  ELSE
    IF TG_TABLE_NAME = 'foundation_evaluation_trial' THEN parent_id := NEW.id;
    ELSE parent_id := NEW.trial_id; END IF;
    SELECT record->'configurationIds' INTO declared FROM foundation_evaluation_trial
      WHERE id = parent_id AND project_id = NEW.project_id;
    SELECT coalesce(jsonb_agg(configuration_id::text ORDER BY ordinal), '[]'::jsonb), count(*), min(ordinal), max(ordinal)
      INTO observed, member_count, first_ordinal, last_ordinal
      FROM foundation_evaluation_trial_configuration WHERE trial_id = parent_id AND project_id = NEW.project_id;
  END IF;
  IF declared IS DISTINCT FROM observed OR member_count = 0 OR first_ordinal <> 0 OR last_ordinal <> member_count - 1 THEN
    RAISE EXCEPTION 'Evaluation configuration membership is incomplete'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_eval_membership_complete';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'foundation_evaluation_definition','foundation_evaluation_trial',
    'foundation_evaluation_definition_configuration','foundation_evaluation_trial_configuration'
  ] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER foundation_eval_membership_complete AFTER INSERT ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commandry_foundation_eval_membership_complete()', table_name);
  END LOOP;
END $$;

--> statement-breakpoint
-- Keep core history guards bound to application tables when runtime sessions
-- retain the ordinary database TEMP privilege. Existing migration stays intact.
ALTER FUNCTION public.commandry_foundation_immutable() SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION public.commandry_foundation_revocation_only() SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION public.commandry_foundation_memory_head() SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION public.commandry_foundation_revision_complete() SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION public.commandry_foundation_membership_closed() SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION public.commandry_foundation_creation_transaction() SET search_path = pg_catalog, public, pg_temp;
