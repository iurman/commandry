CREATE TABLE "local_attention_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"signal_id" uuid,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_attention_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"stale_source_enabled" boolean DEFAULT true NOT NULL,
	"metric_drop_enabled" boolean DEFAULT true NOT NULL,
	"metric_drop_points" integer DEFAULT 25 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_attention_setting_singleton" CHECK ("local_attention_setting"."id" = 'local'),
	CONSTRAINT "local_attention_setting_version_positive" CHECK ("local_attention_setting"."version" > 0),
	CONSTRAINT "local_attention_setting_drop_points_valid" CHECK ("local_attention_setting"."metric_drop_points" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "local_attention_signal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"rule_id" text NOT NULL,
	"state" text NOT NULL,
	"project_id" uuid NOT NULL,
	"integration_id" uuid,
	"resource_id" uuid,
	"evidence_kind" text NOT NULL,
	"evidence_id" uuid NOT NULL,
	"previous_evidence_id" uuid,
	"reason" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"previous_observed_at" timestamp with time zone,
	"previous_value" integer,
	"latest_value" integer,
	"threshold" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	CONSTRAINT "local_attention_signal_rule_valid" CHECK ("local_attention_signal"."rule_id" in ('source_stale', 'metric_drop')),
	CONSTRAINT "local_attention_signal_state_valid" CHECK ("local_attention_signal"."state" in ('active', 'resolved')),
	CONSTRAINT "local_attention_signal_synthetic_only" CHECK ("local_attention_signal"."is_synthetic" = true),
	CONSTRAINT "local_attention_signal_threshold_positive" CHECK ("local_attention_signal"."threshold" > 0)
);
--> statement-breakpoint
ALTER TABLE "local_attention_audit" ADD CONSTRAINT "local_attention_audit_signal_id_local_attention_signal_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."local_attention_signal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_attention_signal" ADD CONSTRAINT "local_attention_signal_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_attention_signal" ADD CONSTRAINT "local_attention_signal_integration_id_integration_instance_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_attention_signal" ADD CONSTRAINT "local_attention_signal_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_attention_audit_page_idx" ON "local_attention_audit" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "local_attention_audit_signal_idx" ON "local_attention_audit" USING btree ("signal_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_attention_signal_key_idx" ON "local_attention_signal" USING btree ("key");--> statement-breakpoint
CREATE INDEX "local_attention_signal_page_idx" ON "local_attention_signal" USING btree ("state","changed_at","id");--> statement-breakpoint
CREATE INDEX "local_attention_signal_project_idx" ON "local_attention_signal" USING btree ("project_id","changed_at","id");