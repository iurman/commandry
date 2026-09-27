CREATE TABLE "knowledge_project_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_project_audit_operation_valid" CHECK ("knowledge_project_audit_event"."operation" in ('knowledge.project_linked', 'knowledge.project_unlinked')),
	CONSTRAINT "knowledge_project_audit_actor_local" CHECK ("knowledge_project_audit_event"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
CREATE TABLE "knowledge_project_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text DEFAULT 'relates_to' NOT NULL,
	"source_kind" text DEFAULT 'knowledge_item' NOT NULL,
	"target_kind" text DEFAULT 'project' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "knowledge_project_link_type_valid" CHECK ("knowledge_project_link"."type" = 'relates_to'),
	CONSTRAINT "knowledge_project_link_direction_valid" CHECK ("knowledge_project_link"."source_kind" = 'knowledge_item' and "knowledge_project_link"."target_kind" = 'project'),
	CONSTRAINT "knowledge_project_link_lifecycle_valid" CHECK (("knowledge_project_link"."lifecycle" = 'active' and "knowledge_project_link"."archived_at" is null) or ("knowledge_project_link"."lifecycle" = 'archived' and "knowledge_project_link"."archived_at" is not null)),
	CONSTRAINT "knowledge_project_link_provenance_manual" CHECK ("knowledge_project_link"."provenance" = 'manual'),
	CONSTRAINT "knowledge_project_link_actor_local" CHECK ("knowledge_project_link"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "knowledge_project_audit_event" ADD CONSTRAINT "knowledge_project_audit_event_knowledge_item_id_knowledge_item_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_project_audit_event" ADD CONSTRAINT "knowledge_project_audit_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_project_audit_event" ADD CONSTRAINT "knowledge_project_audit_event_link_id_knowledge_project_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."knowledge_project_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_project_link" ADD CONSTRAINT "knowledge_project_link_knowledge_item_id_knowledge_item_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_project_link" ADD CONSTRAINT "knowledge_project_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_project_audit_knowledge_page_idx" ON "knowledge_project_audit_event" USING btree ("knowledge_item_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_project_link_one_active_idx" ON "knowledge_project_link" USING btree ("knowledge_item_id","project_id") WHERE "knowledge_project_link"."lifecycle" = 'active';--> statement-breakpoint
CREATE INDEX "knowledge_project_link_project_page_idx" ON "knowledge_project_link" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "knowledge_project_link_knowledge_page_idx" ON "knowledge_project_link" USING btree ("knowledge_item_id","id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_knowledge_source_change() RETURNS trigger AS $$
BEGIN
  IF OLD.kind IS DISTINCT FROM NEW.kind OR
     OLD.source_capture_id IS DISTINCT FROM NEW.source_capture_id OR
     OLD.project_id IS DISTINCT FROM NEW.project_id OR
     OLD.url IS DISTINCT FROM NEW.url THEN
    RAISE EXCEPTION 'Knowledge source, primary project, and link target are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION guard_knowledge_project_link_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.project_id = (SELECT project_id FROM knowledge_item WHERE id = NEW.knowledge_item_id) THEN
      RAISE EXCEPTION 'Knowledge primary project must not be duplicated as a secondary link';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Knowledge project link history cannot be deleted';
  END IF;
  IF OLD.lifecycle <> 'active' OR NEW.lifecycle <> 'archived' OR
     NEW.archived_at IS NULL OR
     (to_jsonb(NEW) - 'lifecycle' - 'archived_at') <>
     (to_jsonb(OLD) - 'lifecycle' - 'archived_at') THEN
    RAISE EXCEPTION 'Knowledge project link may only transition from active to archived';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER knowledge_project_link_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON knowledge_project_link
FOR EACH ROW EXECUTE FUNCTION guard_knowledge_project_link_change();
--> statement-breakpoint
CREATE FUNCTION reject_knowledge_project_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Knowledge project audit history is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER knowledge_project_audit_immutable
BEFORE UPDATE OR DELETE ON knowledge_project_audit_event
FOR EACH ROW EXECUTE FUNCTION reject_knowledge_project_audit_change();
