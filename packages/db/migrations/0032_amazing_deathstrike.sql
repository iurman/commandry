CREATE TABLE "work_project_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_project_audit_operation_valid" CHECK ("work_project_audit_event"."operation" in ('work.project_linked', 'work.project_unlinked')),
	CONSTRAINT "work_project_audit_actor_local" CHECK ("work_project_audit_event"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
CREATE TABLE "work_project_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text DEFAULT 'relates_to' NOT NULL,
	"source_kind" text DEFAULT 'work_item' NOT NULL,
	"target_kind" text DEFAULT 'project' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "work_project_link_type_valid" CHECK ("work_project_link"."type" = 'relates_to'),
	CONSTRAINT "work_project_link_direction_valid" CHECK ("work_project_link"."source_kind" = 'work_item' and "work_project_link"."target_kind" = 'project'),
	CONSTRAINT "work_project_link_lifecycle_valid" CHECK (("work_project_link"."lifecycle" = 'active' and "work_project_link"."archived_at" is null) or ("work_project_link"."lifecycle" = 'archived' and "work_project_link"."archived_at" is not null)),
	CONSTRAINT "work_project_link_provenance_manual" CHECK ("work_project_link"."provenance" = 'manual'),
	CONSTRAINT "work_project_link_actor_local" CHECK ("work_project_link"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "work_project_audit_event" ADD CONSTRAINT "work_project_audit_event_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_project_audit_event" ADD CONSTRAINT "work_project_audit_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_project_audit_event" ADD CONSTRAINT "work_project_audit_event_link_id_work_project_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."work_project_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_project_link" ADD CONSTRAINT "work_project_link_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_project_link" ADD CONSTRAINT "work_project_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_project_audit_work_page_idx" ON "work_project_audit_event" USING btree ("work_item_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_project_link_one_active_idx" ON "work_project_link" USING btree ("work_item_id","project_id") WHERE "work_project_link"."lifecycle" = 'active';--> statement-breakpoint
CREATE INDEX "work_project_link_project_page_idx" ON "work_project_link" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "work_project_link_work_page_idx" ON "work_project_link" USING btree ("work_item_id","id");
--> statement-breakpoint
CREATE FUNCTION reject_work_source_change() RETURNS trigger AS $$
BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id OR
     OLD.source_capture_id IS DISTINCT FROM NEW.source_capture_id THEN
    RAISE EXCEPTION 'Work original capture and primary project are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_source_immutable
BEFORE UPDATE ON work_item
FOR EACH ROW EXECUTE FUNCTION reject_work_source_change();
--> statement-breakpoint
CREATE FUNCTION guard_work_project_link_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.project_id = (SELECT project_id FROM work_item WHERE id = NEW.work_item_id) THEN
      RAISE EXCEPTION 'Work primary project must not be duplicated as a secondary link';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Work project link history cannot be deleted';
  END IF;
  IF OLD.lifecycle <> 'active' OR NEW.lifecycle <> 'archived' OR
     NEW.archived_at IS NULL OR
     (to_jsonb(NEW) - 'lifecycle' - 'archived_at') <>
     (to_jsonb(OLD) - 'lifecycle' - 'archived_at') THEN
    RAISE EXCEPTION 'Work project link may only transition from active to archived';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_project_link_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON work_project_link
FOR EACH ROW EXECUTE FUNCTION guard_work_project_link_change();
--> statement-breakpoint
CREATE FUNCTION reject_work_project_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Work project audit history is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_project_audit_immutable
BEFORE UPDATE OR DELETE ON work_project_audit_event
FOR EACH ROW EXECUTE FUNCTION reject_work_project_audit_change();
