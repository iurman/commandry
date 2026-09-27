CREATE TABLE "local_release_rehearsal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment" text DEFAULT 'local' NOT NULL,
	"source_label" text DEFAULT 'Isolated local application rollback rehearsal' NOT NULL,
	"outcome" text NOT NULL,
	"previous_revision" text,
	"candidate_revision" text,
	"previous_image_id" text,
	"candidate_image_id" text,
	"source_schema_table_count" integer DEFAULT 0 NOT NULL,
	"isolated_schema_table_count" integer DEFAULT 0 NOT NULL,
	"source_capture_sha256" text,
	"isolated_capture_sha256" text,
	"initial_web_verified" boolean DEFAULT false NOT NULL,
	"initial_worker_verified" boolean DEFAULT false NOT NULL,
	"candidate_web_verified" boolean DEFAULT false NOT NULL,
	"candidate_worker_verified" boolean DEFAULT false NOT NULL,
	"rollback_web_verified" boolean DEFAULT false NOT NULL,
	"rollback_worker_verified" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "local_release_rehearsal_local_only" CHECK ("local_release_rehearsal"."environment" = 'local'),
	CONSTRAINT "local_release_rehearsal_source_label_valid" CHECK ("local_release_rehearsal"."source_label" = 'Isolated local application rollback rehearsal'),
	CONSTRAINT "local_release_rehearsal_outcome_valid" CHECK ("local_release_rehearsal"."outcome" in ('passed', 'failed')),
	CONSTRAINT "local_release_rehearsal_counts_valid" CHECK ("local_release_rehearsal"."source_schema_table_count" >= 0 and "local_release_rehearsal"."isolated_schema_table_count" >= 0),
	CONSTRAINT "local_release_rehearsal_pass_valid" CHECK ("local_release_rehearsal"."outcome" <> 'passed' or ("local_release_rehearsal"."previous_revision" is not null and "local_release_rehearsal"."previous_revision" ~ '^[0-9a-f]{40}$' and "local_release_rehearsal"."candidate_revision" is not null and "local_release_rehearsal"."candidate_revision" ~ '^[0-9a-f]{40}$' and "local_release_rehearsal"."previous_revision" <> "local_release_rehearsal"."candidate_revision" and "local_release_rehearsal"."previous_image_id" is not null and "local_release_rehearsal"."previous_image_id" ~ '^sha256:[0-9a-f]{64}$' and "local_release_rehearsal"."candidate_image_id" is not null and "local_release_rehearsal"."candidate_image_id" ~ '^sha256:[0-9a-f]{64}$' and "local_release_rehearsal"."previous_image_id" <> "local_release_rehearsal"."candidate_image_id" and "local_release_rehearsal"."source_schema_table_count" > 0 and "local_release_rehearsal"."source_schema_table_count" = "local_release_rehearsal"."isolated_schema_table_count" and (("local_release_rehearsal"."source_capture_sha256" is null and "local_release_rehearsal"."isolated_capture_sha256" is null) or ("local_release_rehearsal"."source_capture_sha256" is not null and "local_release_rehearsal"."source_capture_sha256" ~ '^[0-9a-f]{64}$' and "local_release_rehearsal"."source_capture_sha256" = "local_release_rehearsal"."isolated_capture_sha256")) and "local_release_rehearsal"."initial_web_verified" and "local_release_rehearsal"."initial_worker_verified" and "local_release_rehearsal"."candidate_web_verified" and "local_release_rehearsal"."candidate_worker_verified" and "local_release_rehearsal"."rollback_web_verified" and "local_release_rehearsal"."rollback_worker_verified" and "local_release_rehearsal"."error_code" is null))
);
--> statement-breakpoint
CREATE INDEX "local_release_rehearsal_page_idx" ON "local_release_rehearsal" USING btree ("completed_at","id");
--> statement-breakpoint
CREATE FUNCTION reject_local_release_rehearsal_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Local release evidence is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER local_release_rehearsal_immutable BEFORE UPDATE OR DELETE ON "local_release_rehearsal"
FOR EACH ROW EXECUTE FUNCTION reject_local_release_rehearsal_mutation();
