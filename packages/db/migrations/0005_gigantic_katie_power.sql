CREATE TABLE "local_agent_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"runtime" text DEFAULT 'local-fake-v1' NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_agent_profile_name_nonempty" CHECK (length(trim("local_agent_profile"."name")) > 0),
	CONSTRAINT "local_agent_profile_role_nonempty" CHECK ("local_agent_profile"."role" is null or length(trim("local_agent_profile"."role")) > 0),
	CONSTRAINT "local_agent_profile_runtime_local" CHECK ("local_agent_profile"."runtime" = 'local-fake-v1'),
	CONSTRAINT "local_agent_profile_synthetic_only" CHECK ("local_agent_profile"."is_synthetic" = true)
);
--> statement-breakpoint
CREATE TABLE "local_agent_project_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_agent_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"packet_id" uuid NOT NULL,
	"packet_version" integer NOT NULL,
	"packet_digest" text NOT NULL,
	"work_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"occurrence_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "local_agent_run_attempts_nonnegative" CHECK ("local_agent_run"."attempts" >= 0),
	CONSTRAINT "local_agent_run_state_valid" CHECK ("local_agent_run"."state" in ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "local_agent_run_synthetic_only" CHECK ("local_agent_run"."is_synthetic" = true),
	CONSTRAINT "local_agent_run_unverified_only" CHECK ("local_agent_run"."verification_status" = 'unverified'),
	CONSTRAINT "local_agent_run_packet_version_positive" CHECK ("local_agent_run"."packet_version" > 0),
	CONSTRAINT "local_agent_run_packet_digest_valid" CHECK ("local_agent_run"."packet_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "local_agent_run_occurrence_nonempty" CHECK (length(trim("local_agent_run"."occurrence_id")) > 0),
	CONSTRAINT "local_agent_run_fingerprint_valid" CHECK ("local_agent_run"."request_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "local_agent_run_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"state" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "local_agent_run_attempt_number_positive" CHECK ("local_agent_run_attempt"."number" > 0),
	CONSTRAINT "local_agent_run_attempt_state_valid" CHECK ("local_agent_run_attempt"."state" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "local_agent_run_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_agent_run_grant_operation_valid" CHECK ("local_agent_run_grant"."operation" in ('project.brief.read', 'work.read')),
	CONSTRAINT "local_agent_run_grant_expiry_valid" CHECK ("local_agent_run_grant"."expires_at" > "local_agent_run_grant"."created_at")
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "target_agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "local_agent_project_assignment" ADD CONSTRAINT "local_agent_project_assignment_agent_id_local_agent_profile_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."local_agent_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_project_assignment" ADD CONSTRAINT "local_agent_project_assignment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_run" ADD CONSTRAINT "local_agent_run_agent_id_local_agent_profile_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."local_agent_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_run" ADD CONSTRAINT "local_agent_run_packet_id_execution_packet_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."execution_packet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_run" ADD CONSTRAINT "local_agent_run_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_run" ADD CONSTRAINT "local_agent_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" ADD CONSTRAINT "local_agent_run_attempt_run_id_local_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_agent_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_run_grant" ADD CONSTRAINT "local_agent_run_grant_run_id_local_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_agent_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_run_grant" ADD CONSTRAINT "local_agent_run_grant_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_agent_profile_created_idx" ON "local_agent_profile" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_agent_project_assignment_unique_idx" ON "local_agent_project_assignment" USING btree ("agent_id","project_id");--> statement-breakpoint
CREATE INDEX "local_agent_project_assignment_agent_idx" ON "local_agent_project_assignment" USING btree ("agent_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_agent_run_occurrence_idx" ON "local_agent_run" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "local_agent_run_agent_created_idx" ON "local_agent_run" USING btree ("agent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "local_agent_run_packet_idx" ON "local_agent_run" USING btree ("packet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_agent_run_attempt_number_idx" ON "local_agent_run_attempt" USING btree ("run_id","number");--> statement-breakpoint
CREATE INDEX "local_agent_run_attempt_run_idx" ON "local_agent_run_attempt" USING btree ("run_id","started_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_agent_run_grant_unique_idx" ON "local_agent_run_grant" USING btree ("run_id","operation");--> statement-breakpoint
CREATE INDEX "local_agent_run_grant_run_idx" ON "local_agent_run_grant" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_target_agent_run_id_local_agent_run_id_fk" FOREIGN KEY ("target_agent_run_id") REFERENCES "public"."local_agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_target_agent_run_idx" ON "audit_event" USING btree ("target_agent_run_id","created_at","id");