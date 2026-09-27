CREATE TABLE "local_backup_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment" text DEFAULT 'local' NOT NULL,
	"source_label" text DEFAULT 'Encrypted local PostgreSQL archive' NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"outcome" text NOT NULL,
	"archive_sha256" text,
	"archive_bytes" integer DEFAULT 0 NOT NULL,
	"source_schema_table_count" integer DEFAULT 0 NOT NULL,
	"restored_schema_table_count" integer DEFAULT 0 NOT NULL,
	"capture_id" uuid,
	"source_capture_sha256" text,
	"restored_capture_sha256" text,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "local_backup_evidence_local_only" CHECK ("local_backup_evidence"."environment" = 'local'),
	CONSTRAINT "local_backup_evidence_source_label_valid" CHECK ("local_backup_evidence"."source_label" = 'Encrypted local PostgreSQL archive'),
	CONSTRAINT "local_backup_evidence_format_valid" CHECK ("local_backup_evidence"."format_version" = 1),
	CONSTRAINT "local_backup_evidence_outcome_valid" CHECK ("local_backup_evidence"."outcome" in ('passed', 'failed')),
	CONSTRAINT "local_backup_evidence_counts_valid" CHECK ("local_backup_evidence"."archive_bytes" >= 0 and "local_backup_evidence"."source_schema_table_count" >= 0 and "local_backup_evidence"."restored_schema_table_count" >= 0),
	CONSTRAINT "local_backup_evidence_pass_valid" CHECK ("local_backup_evidence"."outcome" <> 'passed' or ("local_backup_evidence"."archive_sha256" ~ '^[0-9a-f]{64}$' and "local_backup_evidence"."archive_bytes" > 0 and "local_backup_evidence"."source_schema_table_count" > 0 and "local_backup_evidence"."source_schema_table_count" = "local_backup_evidence"."restored_schema_table_count" and "local_backup_evidence"."error_code" is null and (("local_backup_evidence"."capture_id" is null and "local_backup_evidence"."source_capture_sha256" is null and "local_backup_evidence"."restored_capture_sha256" is null) or ("local_backup_evidence"."capture_id" is not null and "local_backup_evidence"."source_capture_sha256" ~ '^[0-9a-f]{64}$' and "local_backup_evidence"."source_capture_sha256" = "local_backup_evidence"."restored_capture_sha256"))))
);
--> statement-breakpoint
CREATE INDEX "local_backup_evidence_page_idx" ON "local_backup_evidence" USING btree ("completed_at","id");
--> statement-breakpoint
CREATE FUNCTION reject_local_backup_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Local backup evidence is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER local_backup_evidence_immutable BEFORE UPDATE OR DELETE ON "local_backup_evidence"
FOR EACH ROW EXECUTE FUNCTION reject_local_backup_evidence_mutation();
