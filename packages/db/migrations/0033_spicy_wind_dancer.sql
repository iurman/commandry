ALTER TABLE "work_item" ADD COLUMN "work_type" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_type_valid" CHECK ("work_item"."work_type" in ('task', 'initiative', 'subtask'));
--> statement-breakpoint
UPDATE work_item SET work_type = 'subtask', updated_at = now()
WHERE id IN (
  SELECT target_work_item_id FROM work_item_relation
  WHERE type = 'parent_of' AND state = 'active'
);
--> statement-breakpoint
CREATE FUNCTION guard_work_item_type() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.work_type = 'subtask' THEN
      RAISE EXCEPTION 'A subtask must be created as a task and linked to a parent';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.work_type IS DISTINCT FROM NEW.work_type AND NOT (
    (OLD.work_type = 'task' AND NEW.work_type = 'subtask' AND EXISTS (
      SELECT 1 FROM work_item_relation relation
      WHERE relation.target_work_item_id = NEW.id
        AND relation.type = 'parent_of' AND relation.state = 'active'
    )) OR
    (OLD.work_type = 'subtask' AND NEW.work_type = 'task' AND NOT EXISTS (
      SELECT 1 FROM work_item_relation relation
      WHERE relation.target_work_item_id = NEW.id
        AND relation.type = 'parent_of' AND relation.state = 'active'
    ))
  ) THEN
    RAISE EXCEPTION 'Work type may only change through a typed parent relationship';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_item_type_insert_guard
BEFORE INSERT ON work_item
FOR EACH ROW EXECUTE FUNCTION guard_work_item_type();
--> statement-breakpoint
CREATE TRIGGER work_item_type_update_guard
BEFORE UPDATE OF work_type ON work_item
FOR EACH ROW EXECUTE FUNCTION guard_work_item_type();
--> statement-breakpoint
CREATE FUNCTION project_work_parent_type() RETURNS trigger AS $$
DECLARE
  target_type text;
BEGIN
  IF NEW.type <> 'parent_of' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.state = 'active' THEN
    SELECT work_type INTO target_type FROM work_item
      WHERE id = NEW.target_work_item_id FOR UPDATE;
    IF target_type = 'initiative' THEN
      RAISE EXCEPTION 'An initiative cannot be linked as a subtask';
    END IF;
    UPDATE work_item SET work_type = 'subtask', updated_at = now()
      WHERE id = NEW.target_work_item_id AND work_type = 'task';
  ELSIF TG_OP = 'UPDATE' AND OLD.state = 'active' AND NEW.state = 'archived' THEN
    UPDATE work_item SET work_type = 'task', updated_at = now()
      WHERE id = NEW.target_work_item_id AND work_type = 'subtask';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_parent_type_projection
AFTER INSERT OR UPDATE OF state ON work_item_relation
FOR EACH ROW EXECUTE FUNCTION project_work_parent_type();
