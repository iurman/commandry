CREATE TABLE "alert_condition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"state" text NOT NULL,
	"severity" text DEFAULT 'critical' NOT NULL,
	"reason" text NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"last_event_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_label" text NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_condition_synthetic_only" CHECK ("alert_condition"."is_synthetic" = true),
	CONSTRAINT "alert_condition_state_valid" CHECK ("alert_condition"."state" in ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "alert_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"alert_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"import_id" uuid NOT NULL,
	"source_envelope_id" uuid NOT NULL,
	"type" text NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid,
	"severity" text NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_kind" text NOT NULL,
	"source_label" text NOT NULL,
	"processing_version" text NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	CONSTRAINT "normalized_event_synthetic_only" CHECK ("normalized_event"."is_synthetic" = true),
	CONSTRAINT "normalized_event_type_valid" CHECK ("normalized_event"."type" in ('git.pull_request.merged', 'monitor.down', 'monitor.recovered'))
);
--> statement-breakpoint
CREATE TABLE "source_envelope" (
	"id" uuid PRIMARY KEY NOT NULL,
	"import_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_label" text NOT NULL,
	"source_schema_version" text NOT NULL,
	"source_event_id" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	CONSTRAINT "source_envelope_synthetic_only" CHECK ("source_envelope"."is_synthetic" = true),
	CONSTRAINT "source_envelope_kind_valid" CHECK ("source_envelope"."source_kind" in ('synthetic-development', 'synthetic-operations')),
	CONSTRAINT "source_envelope_version_valid" CHECK ("source_envelope"."source_schema_version" = 'synthetic-fixture/v1')
);
--> statement-breakpoint
CREATE TABLE "synthetic_event_import" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurrence_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"scenario_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "synthetic_event_import_scenario_valid" CHECK ("synthetic_event_import"."scenario_id" in ('development.pr-merged', 'operations.monitor-down', 'operations.monitor-recovered')),
	CONSTRAINT "synthetic_event_import_state_valid" CHECK ("synthetic_event_import"."state" in ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "synthetic_event_import_resource_required" CHECK ("synthetic_event_import"."scenario_id" = 'development.pr-merged' or "synthetic_event_import"."resource_id" is not null),
	CONSTRAINT "synthetic_event_import_attempts_nonnegative" CHECK ("synthetic_event_import"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "synthetic_event_import_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"import_id" uuid NOT NULL,
	"state" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "synthetic_event_import_attempt_state_valid" CHECK ("synthetic_event_import_attempt"."state" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "target_import_id" uuid;--> statement-breakpoint
ALTER TABLE "alert_condition" ADD CONSTRAINT "alert_condition_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_condition" ADD CONSTRAINT "alert_condition_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_condition" ADD CONSTRAINT "alert_condition_last_event_id_normalized_event_id_fk" FOREIGN KEY ("last_event_id") REFERENCES "public"."normalized_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_alert_id_alert_condition_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alert_condition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_event_id_normalized_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."normalized_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_event" ADD CONSTRAINT "normalized_event_import_id_synthetic_event_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."synthetic_event_import"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_event" ADD CONSTRAINT "normalized_event_source_envelope_id_source_envelope_id_fk" FOREIGN KEY ("source_envelope_id") REFERENCES "public"."source_envelope"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_event" ADD CONSTRAINT "normalized_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_event" ADD CONSTRAINT "normalized_event_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_envelope" ADD CONSTRAINT "source_envelope_import_id_synthetic_event_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."synthetic_event_import"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthetic_event_import" ADD CONSTRAINT "synthetic_event_import_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthetic_event_import" ADD CONSTRAINT "synthetic_event_import_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthetic_event_import_attempt" ADD CONSTRAINT "synthetic_event_import_attempt_import_id_synthetic_event_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."synthetic_event_import"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_condition_subject_rule_idx" ON "alert_condition" USING btree ("rule_id","project_id","resource_id");--> statement-breakpoint
CREATE INDEX "alert_condition_updated_idx" ON "alert_condition" USING btree ("updated_at","id");--> statement-breakpoint
CREATE INDEX "alert_condition_project_idx" ON "alert_condition" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_evidence_unique_idx" ON "alert_evidence" USING btree ("alert_id","event_id");--> statement-breakpoint
CREATE INDEX "alert_evidence_alert_idx" ON "alert_evidence" USING btree ("alert_id");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_event_import_idx" ON "normalized_event" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_event_envelope_idx" ON "normalized_event" USING btree ("source_envelope_id");--> statement-breakpoint
CREATE INDEX "normalized_event_time_idx" ON "normalized_event" USING btree ("occurred_at","id");--> statement-breakpoint
CREATE INDEX "normalized_event_project_idx" ON "normalized_event" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "normalized_event_resource_idx" ON "normalized_event" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_envelope_import_idx" ON "source_envelope" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_envelope_source_event_idx" ON "source_envelope" USING btree ("source_kind","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synthetic_event_import_occurrence_idx" ON "synthetic_event_import" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "synthetic_event_import_created_idx" ON "synthetic_event_import" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "synthetic_event_import_attempt_import_idx" ON "synthetic_event_import_attempt" USING btree ("import_id");--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_target_import_id_synthetic_event_import_id_fk" FOREIGN KEY ("target_import_id") REFERENCES "public"."synthetic_event_import"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_target_import_idx" ON "audit_event" USING btree ("target_import_id");--> statement-breakpoint
CREATE FUNCTION reject_source_envelope_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'source envelopes are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER source_envelope_immutable BEFORE UPDATE OR DELETE ON "source_envelope"
FOR EACH ROW EXECUTE FUNCTION reject_source_envelope_mutation();
