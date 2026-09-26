CREATE TABLE "automation_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"definition_id" uuid NOT NULL,
	"run_id" uuid,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_definition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"routine" text DEFAULT 'local_project_summary_v1' NOT NULL,
	"trigger_type" text DEFAULT 'on_creation_once' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source_of_truth" text DEFAULT 'local-only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_definition_name_nonempty" CHECK (length(trim("automation_definition"."name")) > 0),
	CONSTRAINT "automation_definition_routine_local" CHECK ("automation_definition"."routine" = 'local_project_summary_v1'),
	CONSTRAINT "automation_definition_trigger_once" CHECK ("automation_definition"."trigger_type" = 'on_creation_once'),
	CONSTRAINT "automation_definition_source_local" CHECK ("automation_definition"."source_of_truth" = 'local-only')
);
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"definition_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "automation_run_attempts_nonnegative" CHECK ("automation_run"."attempts" >= 0),
	CONSTRAINT "automation_run_trigger_valid" CHECK ("automation_run"."trigger" in ('on_creation', 'manual')),
	CONSTRAINT "automation_run_state_valid" CHECK ("automation_run"."state" in ('queued', 'running', 'succeeded', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "automation_run_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"state" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "automation_run_attempt_ordinal_positive" CHECK ("automation_run_attempt"."ordinal" > 0)
);
--> statement-breakpoint
ALTER TABLE "automation_audit_event" ADD CONSTRAINT "automation_audit_event_definition_id_automation_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."automation_definition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_audit_event" ADD CONSTRAINT "automation_audit_event_run_id_automation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_definition" ADD CONSTRAINT "automation_definition_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_definition_id_automation_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."automation_definition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run_attempt" ADD CONSTRAINT "automation_run_attempt_run_id_automation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_audit_page_idx" ON "automation_audit_event" USING btree ("definition_id","id");--> statement-breakpoint
CREATE INDEX "automation_definition_page_idx" ON "automation_definition" USING btree ("id");--> statement-breakpoint
CREATE INDEX "automation_definition_project_page_idx" ON "automation_definition" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_occurrence_idx" ON "automation_run" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "automation_run_definition_page_idx" ON "automation_run" USING btree ("definition_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_attempt_unique_idx" ON "automation_run_attempt" USING btree ("run_id","ordinal");--> statement-breakpoint
CREATE INDEX "automation_run_attempt_page_idx" ON "automation_run_attempt" USING btree ("run_id","id");
--> statement-breakpoint
CREATE FUNCTION reject_automation_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Automation audit events are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER automation_audit_immutable
BEFORE UPDATE OR DELETE ON automation_audit_event
FOR EACH ROW EXECUTE FUNCTION reject_automation_audit_change();
