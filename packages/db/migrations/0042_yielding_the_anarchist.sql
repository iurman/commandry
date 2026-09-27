CREATE TABLE "automation_evidence_check" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"status" text NOT NULL,
	"evidence_count" integer NOT NULL,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_digest" text NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_evidence_check_status_valid" CHECK ("automation_evidence_check"."status" in ('complete', 'missing')),
	CONSTRAINT "automation_evidence_check_count_valid" CHECK ("automation_evidence_check"."evidence_count" >= 1),
	CONSTRAINT "automation_evidence_check_actor_local" CHECK ("automation_evidence_check"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "automation_evidence_check" ADD CONSTRAINT "automation_evidence_check_run_id_automation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_evidence_check_run_idx" ON "automation_evidence_check" USING btree ("run_id","checked_at","id");