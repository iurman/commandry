CREATE TABLE "real_integration_state" (
	"integration_instance_id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"page" integer DEFAULT 1 NOT NULL,
	"etag" text,
	"pending_etag" text,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_observed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "real_integration_page_valid" CHECK ("real_integration_state"."page" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "integration_instance" DROP CONSTRAINT "integration_instance_kind_valid";--> statement-breakpoint
ALTER TABLE "normalized_event" DROP CONSTRAINT "normalized_event_synthetic_only";--> statement-breakpoint
ALTER TABLE "normalized_event" DROP CONSTRAINT "normalized_event_type_valid";--> statement-breakpoint
ALTER TABLE "source_envelope" DROP CONSTRAINT "source_envelope_synthetic_only";--> statement-breakpoint
ALTER TABLE "source_envelope" DROP CONSTRAINT "source_envelope_version_valid";--> statement-breakpoint
ALTER TABLE "source_envelope" DROP CONSTRAINT "source_envelope_kind_valid";--> statement-breakpoint
DROP INDEX "metric_sample_event_idx";--> statement-breakpoint
ALTER TABLE "normalized_event" ALTER COLUMN "import_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "source_envelope" ALTER COLUMN "import_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "source_envelope" ADD COLUMN "integration_instance_id" uuid;--> statement-breakpoint
ALTER TABLE "real_integration_state" ADD CONSTRAINT "real_integration_state_integration_instance_id_integration_instance_id_fk" FOREIGN KEY ("integration_instance_id") REFERENCES "public"."integration_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_envelope" ADD CONSTRAINT "source_envelope_integration_instance_id_integration_instance_id_fk" FOREIGN KEY ("integration_instance_id") REFERENCES "public"."integration_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_sample_event_name_idx" ON "metric_sample" USING btree ("event_id","name");--> statement-breakpoint
ALTER TABLE "integration_instance" ADD CONSTRAINT "integration_instance_kind_valid" CHECK ("integration_instance"."kind" in ('synthetic-development', 'synthetic-operations', 'github-repository', 'linux-host'));--> statement-breakpoint
ALTER TABLE "normalized_event" ADD CONSTRAINT "normalized_event_provenance_valid" CHECK (("normalized_event"."is_synthetic" = true and "normalized_event"."import_id" is not null and "normalized_event"."source_kind" in ('synthetic-development', 'synthetic-operations') and "normalized_event"."processing_version" = 'synthetic-projection/v1') or ("normalized_event"."is_synthetic" = false and "normalized_event"."import_id" is null and "normalized_event"."source_kind" in ('github-repository', 'linux-host') and "normalized_event"."processing_version" = 'real-projection/v1'));--> statement-breakpoint
ALTER TABLE "normalized_event" ADD CONSTRAINT "normalized_event_type_valid" CHECK ("normalized_event"."type" in ('git.pull_request.merged', 'monitor.down', 'monitor.recovered', 'git.repository.activity', 'host.telemetry.sampled'));--> statement-breakpoint
ALTER TABLE "source_envelope" ADD CONSTRAINT "source_envelope_provenance_valid" CHECK (("source_envelope"."is_synthetic" = true and "source_envelope"."import_id" is not null and "source_envelope"."integration_instance_id" is null and "source_envelope"."source_kind" in ('synthetic-development', 'synthetic-operations') and "source_envelope"."source_schema_version" = 'synthetic-fixture/v1') or ("source_envelope"."is_synthetic" = false and "source_envelope"."import_id" is null and "source_envelope"."integration_instance_id" is not null and (("source_envelope"."source_kind" = 'github-repository' and "source_envelope"."source_schema_version" = 'github-events/v1') or ("source_envelope"."source_kind" = 'linux-host' and "source_envelope"."source_schema_version" = 'linux-host/v1'))));--> statement-breakpoint
ALTER TABLE "source_envelope" ADD CONSTRAINT "source_envelope_kind_valid" CHECK ("source_envelope"."source_kind" in ('synthetic-development', 'synthetic-operations', 'github-repository', 'linux-host'));