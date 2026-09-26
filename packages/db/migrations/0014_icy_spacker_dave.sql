CREATE TABLE "knowledge_item_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"previous_title" text NOT NULL,
	"previous_content" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_item_revision_version_positive" CHECK ("knowledge_item_revision"."version" > 1),
	CONSTRAINT "knowledge_item_revision_changed" CHECK (("knowledge_item_revision"."previous_title" <> "knowledge_item_revision"."title") or ("knowledge_item_revision"."previous_content" <> "knowledge_item_revision"."content")),
	CONSTRAINT "knowledge_item_revision_actor_local" CHECK ("knowledge_item_revision"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_item_revision" ADD CONSTRAINT "knowledge_item_revision_knowledge_item_id_knowledge_item_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_item_revision_version_unique_idx" ON "knowledge_item_revision" USING btree ("knowledge_item_id","version");--> statement-breakpoint
CREATE INDEX "knowledge_item_revision_page_idx" ON "knowledge_item_revision" USING btree ("knowledge_item_id","created_at","id");--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_version_positive" CHECK ("knowledge_item"."version" > 0);
--> statement-breakpoint
CREATE FUNCTION reject_knowledge_item_revision_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Knowledge item revisions are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER knowledge_item_revision_immutable
BEFORE UPDATE OR DELETE ON knowledge_item_revision
FOR EACH ROW EXECUTE FUNCTION reject_knowledge_item_revision_change();
