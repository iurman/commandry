ALTER TABLE "work_item_attachment" ADD COLUMN "context_link_id" uuid;--> statement-breakpoint
ALTER TABLE "work_item_attachment" ADD CONSTRAINT "work_item_attachment_context_link_id_knowledge_project_link_id_fk" FOREIGN KEY ("context_link_id") REFERENCES "public"."knowledge_project_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_attachment_context_link_idx" ON "work_item_attachment" USING btree ("context_link_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_work_item_attachment() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Work attachment history cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.project_id IS DISTINCT FROM NEW.project_id OR
    OLD.work_item_id IS DISTINCT FROM NEW.work_item_id OR
    OLD.knowledge_item_id IS DISTINCT FROM NEW.knowledge_item_id OR
    OLD.context_link_id IS DISTINCT FROM NEW.context_link_id OR
    OLD.type IS DISTINCT FROM NEW.type OR
    OLD.actor IS DISTINCT FROM NEW.actor OR
    OLD.created_at IS DISTINCT FROM NEW.created_at OR
    OLD.state <> 'active' OR NEW.state <> 'archived' OR
    NEW.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Work attachment sources and history are immutable';
  END IF;
  IF NEW.context_link_id IS NOT NULL THEN
    PERFORM 1 FROM knowledge_project_link context
    WHERE context.id = NEW.context_link_id
      AND context.knowledge_item_id = NEW.knowledge_item_id
      AND context.project_id = NEW.project_id
      AND context.lifecycle = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Work attachment context relationship must be active';
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM work_item w
    JOIN knowledge_item k ON k.id = NEW.knowledge_item_id
    JOIN capture_file f ON f.capture_id = k.source_capture_id
    WHERE w.id = NEW.work_item_id AND w.project_id = NEW.project_id
      AND k.kind = 'document'
      AND (
        (k.project_id = NEW.project_id AND NEW.context_link_id IS NULL)
        OR (k.project_id <> NEW.project_id AND EXISTS (
          SELECT 1 FROM knowledge_project_link context
          WHERE context.id = NEW.context_link_id
            AND context.knowledge_item_id = k.id
            AND context.project_id = NEW.project_id
            AND context.lifecycle = 'active'
        ))
      )
  ) THEN
    RAISE EXCEPTION 'Work attachments require a document with active task-project context';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_knowledge_project_link_change() RETURNS trigger AS $$
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
  IF EXISTS (
    SELECT 1 FROM work_item_attachment attachment
    WHERE attachment.context_link_id = OLD.id AND attachment.state = 'active'
  ) THEN
    RAISE EXCEPTION 'Knowledge project link has active task attachments';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
