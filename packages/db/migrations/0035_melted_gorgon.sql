CREATE TABLE "work_item_assignment_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"previous_kind" text NOT NULL,
	"next_kind" text NOT NULL,
	"previous_agent_id" uuid,
	"next_agent_id" uuid,
	"previous_label" text,
	"next_label" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_assignment_event_changed" CHECK (("work_item_assignment_event"."previous_kind" is distinct from "work_item_assignment_event"."next_kind") or ("work_item_assignment_event"."previous_agent_id" is distinct from "work_item_assignment_event"."next_agent_id") or ("work_item_assignment_event"."previous_label" is distinct from "work_item_assignment_event"."next_label")),
	CONSTRAINT "work_item_assignment_event_actor_local" CHECK ("work_item_assignment_event"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "assignee_kind" text DEFAULT 'unassigned' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "assignee_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "assignee_label" text;--> statement-breakpoint
ALTER TABLE "work_item_assignment_event" ADD CONSTRAINT "work_item_assignment_event_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_assignment_event_page_idx" ON "work_item_assignment_event" USING btree ("work_item_id","created_at","id");--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_assignee_project_scope_fk" FOREIGN KEY ("assignee_agent_id","project_id") REFERENCES "public"."local_agent_project_assignment"("agent_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_assignee_valid" CHECK (("work_item"."assignee_kind" = 'unassigned' and "work_item"."assignee_agent_id" is null and "work_item"."assignee_label" is null) or ("work_item"."assignee_kind" = 'local_user' and "work_item"."assignee_agent_id" is null and "work_item"."assignee_label" = 'Local user (unattributed)') or ("work_item"."assignee_kind" = 'agent' and "work_item"."assignee_agent_id" is not null and "work_item"."assignee_label" like 'Synthetic local agent: %'));
--> statement-breakpoint
CREATE FUNCTION guard_work_assignment_history() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Work assignment history is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_assignment_event_immutable
BEFORE UPDATE OR DELETE ON work_item_assignment_event
FOR EACH ROW EXECUTE FUNCTION guard_work_assignment_history();
--> statement-breakpoint
CREATE FUNCTION require_work_assignment_event() RETURNS trigger AS $$
BEGIN
  IF (OLD.assignee_kind, OLD.assignee_agent_id, OLD.assignee_label)
     IS DISTINCT FROM (NEW.assignee_kind, NEW.assignee_agent_id, NEW.assignee_label)
     AND NOT EXISTS (
       SELECT 1 FROM work_item_assignment_event event
       WHERE event.work_item_id = NEW.id
         AND event.previous_kind = OLD.assignee_kind
         AND event.next_kind = NEW.assignee_kind
         AND event.previous_agent_id IS NOT DISTINCT FROM OLD.assignee_agent_id
         AND event.next_agent_id IS NOT DISTINCT FROM NEW.assignee_agent_id
         AND event.previous_label IS NOT DISTINCT FROM OLD.assignee_label
         AND event.next_label IS NOT DISTINCT FROM NEW.assignee_label
         AND event.created_at = NEW.updated_at
     ) THEN
    RAISE EXCEPTION 'Work assignment change requires an exact audit event' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER work_assignment_event_required
AFTER UPDATE ON work_item
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_work_assignment_event();
