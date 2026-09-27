CREATE TABLE "local_recovery_drill" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment" text DEFAULT 'local' NOT NULL,
	"source_label" text DEFAULT 'Local disposable PostgreSQL restore rehearsal' NOT NULL,
	"outcome" text NOT NULL,
	"source_schema_table_count" integer DEFAULT 0 NOT NULL,
	"restored_schema_table_count" integer DEFAULT 0 NOT NULL,
	"source_capture_sha256" text,
	"restored_capture_sha256" text,
	"backup_sha256" text,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "local_recovery_drill_local_only" CHECK ("local_recovery_drill"."environment" = 'local'),
	CONSTRAINT "local_recovery_drill_source_label_valid" CHECK ("local_recovery_drill"."source_label" = 'Local disposable PostgreSQL restore rehearsal'),
	CONSTRAINT "local_recovery_drill_outcome_valid" CHECK ("local_recovery_drill"."outcome" in ('passed', 'failed')),
	CONSTRAINT "local_recovery_drill_counts_valid" CHECK ("local_recovery_drill"."source_schema_table_count" >= 0 and "local_recovery_drill"."restored_schema_table_count" >= 0),
	CONSTRAINT "local_recovery_drill_result_valid" CHECK ("local_recovery_drill"."outcome" <> 'passed' or ("local_recovery_drill"."source_schema_table_count" > 0 and "local_recovery_drill"."source_schema_table_count" = "local_recovery_drill"."restored_schema_table_count" and "local_recovery_drill"."source_capture_sha256" ~ '^[0-9a-f]{64}$' and "local_recovery_drill"."source_capture_sha256" = "local_recovery_drill"."restored_capture_sha256" and "local_recovery_drill"."backup_sha256" ~ '^[0-9a-f]{64}$' and "local_recovery_drill"."error_code" is null))
);
--> statement-breakpoint
CREATE INDEX "local_recovery_drill_page_idx" ON "local_recovery_drill" USING btree ("completed_at","id");
--> statement-breakpoint
CREATE FUNCTION reject_local_recovery_drill_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Local recovery drill evidence is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER local_recovery_drill_immutable BEFORE UPDATE OR DELETE ON "local_recovery_drill"
FOR EACH ROW EXECUTE FUNCTION reject_local_recovery_drill_mutation();
