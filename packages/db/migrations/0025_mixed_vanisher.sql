CREATE TABLE "work_item_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"type" text DEFAULT 'attached_document' NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "work_item_attachment_type_valid" CHECK ("work_item_attachment"."type" = 'attached_document'),
	CONSTRAINT "work_item_attachment_state_valid" CHECK (("work_item_attachment"."state" = 'active' and "work_item_attachment"."archived_at" is null) or ("work_item_attachment"."state" = 'archived' and "work_item_attachment"."archived_at" is not null)),
	CONSTRAINT "work_item_attachment_actor_local" CHECK ("work_item_attachment"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "work_item_attachment" ADD CONSTRAINT "work_item_attachment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attachment" ADD CONSTRAINT "work_item_attachment_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attachment" ADD CONSTRAINT "work_item_attachment_knowledge_item_id_knowledge_item_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_attachment_active_unique_idx" ON "work_item_attachment" USING btree ("work_item_id","knowledge_item_id") WHERE "work_item_attachment"."state" = 'active';--> statement-breakpoint
CREATE INDEX "work_item_attachment_work_page_idx" ON "work_item_attachment" USING btree ("work_item_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_item_attachment_knowledge_page_idx" ON "work_item_attachment" USING btree ("knowledge_item_id","created_at","id");
--> statement-breakpoint
CREATE FUNCTION validate_work_item_attachment() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Work attachment history cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.project_id IS DISTINCT FROM NEW.project_id OR
    OLD.work_item_id IS DISTINCT FROM NEW.work_item_id OR
    OLD.knowledge_item_id IS DISTINCT FROM NEW.knowledge_item_id OR
    OLD.type IS DISTINCT FROM NEW.type OR
    OLD.actor IS DISTINCT FROM NEW.actor OR
    OLD.created_at IS DISTINCT FROM NEW.created_at OR
    OLD.state <> 'active' OR NEW.state <> 'archived' OR
    NEW.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Work attachment sources and history are immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM work_item w
    JOIN knowledge_item k ON k.id = NEW.knowledge_item_id
    JOIN capture_file f ON f.capture_id = k.source_capture_id
    WHERE w.id = NEW.work_item_id AND w.project_id = NEW.project_id
      AND k.project_id = NEW.project_id AND k.kind = 'document'
  ) THEN
    RAISE EXCEPTION 'Work attachments require a document in the same project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_item_attachment_source_valid
BEFORE INSERT OR UPDATE OR DELETE ON work_item_attachment
FOR EACH ROW EXECUTE FUNCTION validate_work_item_attachment();
