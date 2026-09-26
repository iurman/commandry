CREATE TABLE "work_item_planning_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"previous_priority" text,
	"next_priority" text,
	"previous_due_on" date,
	"next_due_on" date,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_planning_event_changed" CHECK (("work_item_planning_event"."previous_priority" is distinct from "work_item_planning_event"."next_priority") or ("work_item_planning_event"."previous_due_on" is distinct from "work_item_planning_event"."next_due_on")),
	CONSTRAINT "work_item_planning_event_actor_local" CHECK ("work_item_planning_event"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "work_item_planning_event" ADD CONSTRAINT "work_item_planning_event_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_planning_event_page_idx" ON "work_item_planning_event" USING btree ("work_item_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_item_upcoming_idx" ON "work_item" USING btree ("status","due_on","id");--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_priority_valid" CHECK ("work_item"."priority" is null or "work_item"."priority" in ('low', 'normal', 'high'));
--> statement-breakpoint
ALTER TABLE "work_item_planning_event" ADD CONSTRAINT "work_item_planning_event_priority_valid" CHECK (("previous_priority" is null or "previous_priority" in ('low', 'normal', 'high')) and ("next_priority" is null or "next_priority" in ('low', 'normal', 'high')));
--> statement-breakpoint
CREATE FUNCTION reject_work_item_planning_event_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Work item planning events are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_item_planning_event_immutable
BEFORE UPDATE OR DELETE ON work_item_planning_event
FOR EACH ROW EXECUTE FUNCTION reject_work_item_planning_event_change();
