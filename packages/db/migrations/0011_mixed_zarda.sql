CREATE TABLE "notification_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"previous_state" text NOT NULL,
	"next_state" text NOT NULL,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'unread' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_receipt_version_positive" CHECK ("notification_receipt"."version" > 0),
	CONSTRAINT "notification_receipt_state_valid" CHECK ("notification_receipt"."state" in ('unread', 'acknowledged', 'dismissed', 'snoozed')),
	CONSTRAINT "notification_receipt_snooze_valid" CHECK (("notification_receipt"."state" = 'snoozed') = ("notification_receipt"."snoozed_until" is not null))
);
--> statement-breakpoint
ALTER TABLE "alert_condition" ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_audit_event" ADD CONSTRAINT "notification_audit_event_notification_id_notification_receipt_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification_receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_audit_notification_idx" ON "notification_audit_event" USING btree ("notification_id","created_at","id");--> statement-breakpoint
ALTER TABLE "alert_condition" ADD CONSTRAINT "alert_condition_cycle_positive" CHECK ("alert_condition"."cycle" > 0);
--> statement-breakpoint
CREATE FUNCTION reject_notification_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Notification audit events are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER notification_audit_immutable
BEFORE UPDATE OR DELETE ON notification_audit_event
FOR EACH ROW EXECUTE FUNCTION reject_notification_audit_change();
