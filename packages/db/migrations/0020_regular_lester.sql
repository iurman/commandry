CREATE TABLE "overnight_queue_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overnight_queue_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"packet_id" uuid NOT NULL,
	"packet_version" integer NOT NULL,
	"packet_digest" text NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_after" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'scheduled' NOT NULL,
	"run_id" uuid,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overnight_queue_packet_version_positive" CHECK ("overnight_queue_entry"."packet_version" > 0),
	CONSTRAINT "overnight_queue_packet_digest_valid" CHECK ("overnight_queue_entry"."packet_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "overnight_queue_state_valid" CHECK ("overnight_queue_entry"."state" in ('scheduled', 'dispatching', 'dispatched', 'blocked', 'canceled'))
);
--> statement-breakpoint
ALTER TABLE "overnight_queue_audit_event" ADD CONSTRAINT "overnight_queue_audit_event_entry_id_overnight_queue_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."overnight_queue_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overnight_queue_entry" ADD CONSTRAINT "overnight_queue_entry_packet_id_execution_packet_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."execution_packet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overnight_queue_entry" ADD CONSTRAINT "overnight_queue_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overnight_queue_entry" ADD CONSTRAINT "overnight_queue_entry_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overnight_queue_entry" ADD CONSTRAINT "overnight_queue_entry_agent_id_local_agent_profile_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."local_agent_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overnight_queue_entry" ADD CONSTRAINT "overnight_queue_entry_run_id_local_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_agent_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overnight_queue_audit_page_idx" ON "overnight_queue_audit_event" USING btree ("entry_id","id");--> statement-breakpoint
CREATE INDEX "overnight_queue_page_idx" ON "overnight_queue_entry" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "overnight_queue_project_idx" ON "overnight_queue_entry" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "overnight_queue_due_idx" ON "overnight_queue_entry" USING btree ("state","run_after");