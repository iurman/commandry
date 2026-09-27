ALTER TABLE "local_release_preflight" DROP CONSTRAINT "local_release_preflight_pass_valid";--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD COLUMN "source_evidence_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD COLUMN "image_source_revision" text;--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD COLUMN "image_source_clean" boolean;--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD COLUMN "checkout_clean" boolean;--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD COLUMN "source_verified" boolean;--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD CONSTRAINT "local_release_preflight_source_version_valid" CHECK ("local_release_preflight"."source_evidence_version" in (1, 2) and (
        ("local_release_preflight"."source_evidence_version" = 1 and "local_release_preflight"."image_source_revision" is null and "local_release_preflight"."image_source_clean" is null and "local_release_preflight"."checkout_clean" is null and "local_release_preflight"."source_verified" is null)
        or ("local_release_preflight"."source_evidence_version" = 2 and "local_release_preflight"."checkout_clean" is not null and "local_release_preflight"."source_verified" is not null)
      ));--> statement-breakpoint
ALTER TABLE "local_release_preflight" ADD CONSTRAINT "local_release_preflight_pass_valid" CHECK ("local_release_preflight"."outcome" <> 'passed' or (
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
        and (
          "local_release_preflight"."source_evidence_version" = 1
          or (
            "local_release_preflight"."source_evidence_version" = 2
            and "local_release_preflight"."image_source_revision" is not null
            and "local_release_preflight"."image_source_revision" = "local_release_preflight"."checkout_revision"
            and "local_release_preflight"."image_source_clean" is true
            and "local_release_preflight"."checkout_clean" is true
            and "local_release_preflight"."source_verified" is true
            and "local_release_preflight"."version_sha" = "local_release_preflight"."checkout_revision"
          )
        )
      ));