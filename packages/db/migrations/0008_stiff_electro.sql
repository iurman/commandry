CREATE TABLE "resource_dependency" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dependent_resource_id" uuid NOT NULL,
	"required_resource_id" uuid NOT NULL,
	"type" text DEFAULT 'depends_on' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_dependency_not_self" CHECK ("resource_dependency"."dependent_resource_id" <> "resource_dependency"."required_resource_id"),
	CONSTRAINT "resource_dependency_type_valid" CHECK ("resource_dependency"."type" = 'depends_on'),
	CONSTRAINT "resource_dependency_provenance_manual" CHECK ("resource_dependency"."provenance" = 'manual')
);
--> statement-breakpoint
ALTER TABLE "resource" ADD COLUMN "parent_resource_id" uuid;--> statement-breakpoint
ALTER TABLE "resource_dependency" ADD CONSTRAINT "resource_dependency_dependent_resource_id_resource_id_fk" FOREIGN KEY ("dependent_resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_dependency" ADD CONSTRAINT "resource_dependency_required_resource_id_resource_id_fk" FOREIGN KEY ("required_resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_dependency_unique_idx" ON "resource_dependency" USING btree ("dependent_resource_id","required_resource_id");--> statement-breakpoint
CREATE INDEX "resource_dependency_required_page_idx" ON "resource_dependency" USING btree ("required_resource_id","id");--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_parent_resource_id_resource_id_fk" FOREIGN KEY ("parent_resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_parent_id_idx" ON "resource" USING btree ("parent_resource_id","id");--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_parent_not_self" CHECK ("resource"."parent_resource_id" is null or "resource"."parent_resource_id" <> "resource"."id");
--> statement-breakpoint
CREATE FUNCTION reject_resource_parent_cycle() RETURNS trigger AS $$
DECLARE
  creates_cycle boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(441322083);
  IF NEW.parent_resource_id IS NULL THEN
    RETURN NEW;
  END IF;
  WITH RECURSIVE ancestors(id, parent_resource_id) AS (
    SELECT id, parent_resource_id FROM resource WHERE id = NEW.parent_resource_id
    UNION
    SELECT parent.id, parent.parent_resource_id
    FROM resource parent
    JOIN ancestors child ON parent.id = child.parent_resource_id
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO creates_cycle;
  IF creates_cycle OR NEW.parent_resource_id = NEW.id THEN
    RAISE EXCEPTION 'resource hierarchy cannot contain a cycle' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER resource_parent_cycle_guard BEFORE INSERT OR UPDATE OF parent_resource_id ON "resource"
FOR EACH ROW EXECUTE FUNCTION reject_resource_parent_cycle();
