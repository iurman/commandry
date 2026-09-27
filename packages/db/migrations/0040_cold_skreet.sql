CREATE TABLE "local_connector_feed" (
	"id" uuid PRIMARY KEY NOT NULL,
	"integration_instance_id" uuid NOT NULL,
	"scenario_id" text NOT NULL,
	"occurrence_id" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"state" text DEFAULT 'queued' NOT NULL,
	"import_id" uuid,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_connector_feed_occurrence_id_unique" UNIQUE("occurrence_id"),
	CONSTRAINT "local_connector_feed_state_valid" CHECK ("local_connector_feed"."state" in ('queued', 'processing', 'submitted', 'failed')),
	CONSTRAINT "local_connector_feed_attempts_valid" CHECK ("local_connector_feed"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "integration_instance" ADD COLUMN "receiver_token_digest" text;--> statement-breakpoint
ALTER TABLE "local_connector_feed" ADD CONSTRAINT "local_connector_feed_integration_instance_id_integration_instance_id_fk" FOREIGN KEY ("integration_instance_id") REFERENCES "public"."integration_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_connector_feed_instance_idx" ON "local_connector_feed" USING btree ("integration_instance_id","created_at","id");--> statement-breakpoint
CREATE INDEX "local_connector_feed_state_idx" ON "local_connector_feed" USING btree ("state","updated_at","id");