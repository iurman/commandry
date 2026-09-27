CREATE TABLE "local_agent_callback_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"stage" text,
	"artifact_name" text,
	"artifact_mime_type" text,
	"artifact_content" text,
	"artifact_bytes" integer,
	"artifact_sha256" text,
	"source_label" text DEFAULT 'Synthetic local runner callback' NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_agent_callback_sequence_positive" CHECK ("local_agent_callback_event"."sequence" > 0),
	CONSTRAINT "local_agent_callback_kind_valid" CHECK ("local_agent_callback_event"."kind" in ('heartbeat', 'artifact')),
	CONSTRAINT "local_agent_callback_source_valid" CHECK ("local_agent_callback_event"."source_label" = 'Synthetic local runner callback' and "local_agent_callback_event"."is_synthetic" = true),
	CONSTRAINT "local_agent_callback_payload_valid" CHECK (("local_agent_callback_event"."kind" = 'heartbeat' and "local_agent_callback_event"."stage" in ('started', 'brief_read', 'work_read', 'result_prepared') and "local_agent_callback_event"."artifact_name" is null and "local_agent_callback_event"."artifact_mime_type" is null and "local_agent_callback_event"."artifact_content" is null and "local_agent_callback_event"."artifact_bytes" is null and "local_agent_callback_event"."artifact_sha256" is null) or ("local_agent_callback_event"."kind" = 'artifact' and "local_agent_callback_event"."stage" is null and "local_agent_callback_event"."artifact_name" = 'synthetic-run-report.json' and "local_agent_callback_event"."artifact_mime_type" = 'application/json' and "local_agent_callback_event"."artifact_content" is not null and octet_length("local_agent_callback_event"."artifact_content") between 1 and 16384 and "local_agent_callback_event"."artifact_bytes" = octet_length("local_agent_callback_event"."artifact_content") and "local_agent_callback_event"."artifact_sha256" ~ '^[0-9a-f]{64}$'))
);
--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" ADD COLUMN "callback_token_digest" text;--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" ADD COLUMN "callback_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" ADD COLUMN "last_callback_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "local_agent_callback_event" ADD CONSTRAINT "local_agent_callback_event_run_id_local_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_agent_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_agent_callback_event" ADD CONSTRAINT "local_agent_callback_event_attempt_id_local_agent_run_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."local_agent_run_attempt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "local_agent_callback_attempt_sequence_idx" ON "local_agent_callback_event" USING btree ("attempt_id","sequence");--> statement-breakpoint
CREATE INDEX "local_agent_callback_run_page_idx" ON "local_agent_callback_event" USING btree ("run_id","created_at","id");--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" ADD CONSTRAINT "local_agent_run_attempt_callback_lease_valid" CHECK ((("local_agent_run_attempt"."callback_token_digest" is null and "local_agent_run_attempt"."callback_expires_at" is null) or ("local_agent_run_attempt"."callback_token_digest" is not null and "local_agent_run_attempt"."callback_token_digest" ~ '^[0-9a-f]{64}$' and "local_agent_run_attempt"."callback_expires_at" is not null)));--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" ADD CONSTRAINT "local_agent_run_attempt_callback_sequence_valid" CHECK ("local_agent_run_attempt"."last_callback_sequence" >= 0);
--> statement-breakpoint
CREATE FUNCTION reject_local_agent_callback_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Local runner callback evidence is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER local_agent_callback_event_immutable BEFORE UPDATE OR DELETE ON "local_agent_callback_event"
FOR EACH ROW EXECUTE FUNCTION reject_local_agent_callback_event_mutation();
