CREATE TABLE "local_release_preflight" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment" text DEFAULT 'local' NOT NULL,
	"source_label" text DEFAULT 'Local Compose release preflight' NOT NULL,
	"outcome" text NOT NULL,
	"checkout_revision" text,
	"image_id" text,
	"version_sha" text,
	"checks" jsonb NOT NULL,
	"backup_evidence_id" uuid,
	"recovery_evidence_id" uuid,
	"release_evidence_id" uuid,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "local_release_preflight_local_only" CHECK ("local_release_preflight"."environment" = 'local'),
	CONSTRAINT "local_release_preflight_source_label_valid" CHECK ("local_release_preflight"."source_label" = 'Local Compose release preflight'),
	CONSTRAINT "local_release_preflight_outcome_valid" CHECK ("local_release_preflight"."outcome" in ('passed', 'failed')),
	CONSTRAINT "local_release_preflight_checks_valid" CHECK (jsonb_typeof("local_release_preflight"."checks") = 'object'
        and "local_release_preflight"."checks" ?& array['postgresHealthy','webHealthy','workerHealthy','migrationExited','revisionKnown','sameImage','versionReachable','apiRead','heartbeatFresh','localEvidence']
        and jsonb_typeof("local_release_preflight"."checks"->'postgresHealthy') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'webHealthy') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'workerHealthy') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'migrationExited') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'revisionKnown') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'sameImage') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'versionReachable') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'apiRead') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'heartbeatFresh') = 'boolean'
        and jsonb_typeof("local_release_preflight"."checks"->'localEvidence') = 'boolean'),
	CONSTRAINT "local_release_preflight_pass_valid" CHECK ("local_release_preflight"."outcome" <> 'passed' or (
        "local_release_preflight"."checkout_revision" is not null
        and "local_release_preflight"."checkout_revision" ~ '^[0-9a-f]{40}$'
        and "local_release_preflight"."image_id" is not null
        and "local_release_preflight"."image_id" ~ '^sha256:[0-9a-f]{64}$'
        and "local_release_preflight"."version_sha" is not null
        and length("local_release_preflight"."version_sha") between 1 and 128
        and "local_release_preflight"."checks" @> '{"postgresHealthy":true,"webHealthy":true,"workerHealthy":true,"migrationExited":true,"revisionKnown":true,"sameImage":true,"versionReachable":true,"apiRead":true,"heartbeatFresh":true,"localEvidence":true}'::jsonb
        and "local_release_preflight"."backup_evidence_id" is not null
        and "local_release_preflight"."recovery_evidence_id" is not null
        and "local_release_preflight"."release_evidence_id" is not null
        and "local_release_preflight"."error_code" is null
        and "local_release_preflight"."completed_at" >= "local_release_preflight"."started_at"
      ))
);
--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD CONSTRAINT "local_release_preflight_backup_evidence_id_local_backup_evidence_id_fk" FOREIGN KEY ("backup_evidence_id") REFERENCES "public"."local_backup_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD CONSTRAINT "local_release_preflight_recovery_evidence_id_local_recovery_drill_id_fk" FOREIGN KEY ("recovery_evidence_id") REFERENCES "public"."local_recovery_drill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD CONSTRAINT "local_release_preflight_release_evidence_id_local_release_rehearsal_id_fk" FOREIGN KEY ("release_evidence_id") REFERENCES "public"."local_release_rehearsal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_release_preflight_page_idx" ON "local_release_preflight" USING btree ("completed_at","id");
--> statement-breakpoint
CREATE FUNCTION reject_local_release_preflight_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Local release preflight evidence is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER local_release_preflight_immutable BEFORE UPDATE OR DELETE ON "local_release_preflight"
FOR EACH ROW EXECUTE FUNCTION reject_local_release_preflight_mutation();
--> statement-breakpoint
CREATE FUNCTION validate_local_release_preflight_evidence() RETURNS trigger AS $$
BEGIN
  IF NEW.outcome = 'passed' AND (
    NOT EXISTS (SELECT 1 FROM local_backup_evidence WHERE id = NEW.backup_evidence_id AND outcome = 'passed')
    OR NOT EXISTS (SELECT 1 FROM local_recovery_drill WHERE id = NEW.recovery_evidence_id AND outcome = 'passed')
    OR NOT EXISTS (SELECT 1 FROM local_release_rehearsal WHERE id = NEW.release_evidence_id AND outcome = 'passed')
  ) THEN
    RAISE EXCEPTION 'Passed local preflight requires passed source evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER local_release_preflight_evidence_valid BEFORE INSERT ON "local_release_preflight"
FOR EACH ROW EXECUTE FUNCTION validate_local_release_preflight_evidence();
