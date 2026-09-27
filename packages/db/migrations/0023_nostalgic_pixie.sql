CREATE TABLE "work_item_relation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_work_item_id" uuid NOT NULL,
	"target_work_item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "work_item_relation_not_self" CHECK ("work_item_relation"."source_work_item_id" <> "work_item_relation"."target_work_item_id"),
	CONSTRAINT "work_item_relation_type_valid" CHECK ("work_item_relation"."type" in ('parent_of', 'blocks')),
	CONSTRAINT "work_item_relation_state_valid" CHECK (("work_item_relation"."state" = 'active' and "work_item_relation"."archived_at" is null) or ("work_item_relation"."state" = 'archived' and "work_item_relation"."archived_at" is not null)),
	CONSTRAINT "work_item_relation_actor_local" CHECK ("work_item_relation"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "work_item_relation" ADD CONSTRAINT "work_item_relation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_relation" ADD CONSTRAINT "work_item_relation_source_work_item_id_work_item_id_fk" FOREIGN KEY ("source_work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_relation" ADD CONSTRAINT "work_item_relation_target_work_item_id_work_item_id_fk" FOREIGN KEY ("target_work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_relation_active_unique_idx" ON "work_item_relation" USING btree ("type","source_work_item_id","target_work_item_id") WHERE "work_item_relation"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_relation_one_parent_idx" ON "work_item_relation" USING btree ("target_work_item_id") WHERE "work_item_relation"."type" = 'parent_of' and "work_item_relation"."state" = 'active';--> statement-breakpoint
CREATE INDEX "work_item_relation_source_page_idx" ON "work_item_relation" USING btree ("source_work_item_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_item_relation_target_page_idx" ON "work_item_relation" USING btree ("target_work_item_id","created_at","id");
--> statement-breakpoint
CREATE FUNCTION validate_work_item_relation() RETURNS trigger AS $$
DECLARE
  source_project uuid;
  target_project uuid;
  has_cycle boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Work relations cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.state <> 'active' OR NEW.state <> 'archived' OR
       NEW.id IS DISTINCT FROM OLD.id OR
       NEW.project_id IS DISTINCT FROM OLD.project_id OR
       NEW.source_work_item_id IS DISTINCT FROM OLD.source_work_item_id OR
       NEW.target_work_item_id IS DISTINCT FROM OLD.target_work_item_id OR
       NEW.type IS DISTINCT FROM OLD.type OR
       NEW.actor IS DISTINCT FROM OLD.actor OR
       NEW.created_at IS DISTINCT FROM OLD.created_at OR
       NEW.archived_at IS NULL THEN
      RAISE EXCEPTION 'Work relation endpoints and history are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state <> 'active' OR NEW.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'New work relations must be active';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text, 20260926));
  SELECT project_id INTO source_project FROM work_item WHERE id = NEW.source_work_item_id;
  SELECT project_id INTO target_project FROM work_item WHERE id = NEW.target_work_item_id;
  IF source_project IS DISTINCT FROM NEW.project_id OR target_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Work relation project mismatch';
  END IF;
  WITH RECURSIVE reachable(id) AS (
    SELECT target_work_item_id
    FROM work_item_relation
    WHERE source_work_item_id = NEW.target_work_item_id AND type = NEW.type AND state = 'active'
    UNION
    SELECT relation.target_work_item_id
    FROM work_item_relation relation
    INNER JOIN reachable ON relation.source_work_item_id = reachable.id
    WHERE relation.type = NEW.type AND relation.state = 'active'
  )
  SELECT EXISTS (SELECT 1 FROM reachable WHERE id = NEW.source_work_item_id) INTO has_cycle;
  IF has_cycle THEN
    RAISE EXCEPTION 'Work relation cycle';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_item_relation_valid
BEFORE INSERT OR UPDATE OR DELETE ON work_item_relation
FOR EACH ROW EXECUTE FUNCTION validate_work_item_relation();
