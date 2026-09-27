CREATE TABLE "work_item_comment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"body" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_comment_body_nonempty" CHECK (length(trim("work_item_comment"."body")) > 0),
	CONSTRAINT "work_item_comment_actor_local" CHECK ("work_item_comment"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "capture" DROP CONSTRAINT "capture_filing_state_valid";--> statement-breakpoint
ALTER TABLE "knowledge_item" DROP CONSTRAINT "knowledge_item_kind_valid";--> statement-breakpoint
DROP INDEX "knowledge_item_search_idx";--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "work_item_comment" ADD CONSTRAINT "work_item_comment_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comment" ADD CONSTRAINT "work_item_comment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_comment_page_idx" ON "work_item_comment" USING btree ("work_item_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_item_comment_search_idx" ON "work_item_comment" USING gin (to_tsvector('simple', "body"));--> statement-breakpoint
CREATE INDEX "knowledge_item_search_idx" ON "knowledge_item" USING gin (to_tsvector('simple', "title" || ' ' || "content" || ' ' || coalesce("url", '')));--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_filing_state_valid" CHECK (("capture"."state" = 'unfiled' and "capture"."filed_at" is null and "capture"."filed_record_kind" is null and "capture"."filed_record_id" is null) or ("capture"."state" = 'filed' and "capture"."filed_at" is not null and "capture"."project_id" is not null and "capture"."filed_record_kind" in ('task', 'note', 'link') and "capture"."filed_record_id" is not null));--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_url_valid" CHECK (("knowledge_item"."kind" = 'note' and "knowledge_item"."url" is null) or ("knowledge_item"."kind" = 'link' and "knowledge_item"."url" is not null and length(trim("knowledge_item"."url")) > 0));--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_kind_valid" CHECK ("knowledge_item"."kind" in ('note', 'link'));
--> statement-breakpoint
CREATE FUNCTION validate_work_item_comment_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM work_item
    WHERE id = NEW.work_item_id AND project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Work comment project must match its work item';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_item_comment_scope_valid
BEFORE INSERT ON work_item_comment
FOR EACH ROW EXECUTE FUNCTION validate_work_item_comment_scope();
--> statement-breakpoint
CREATE FUNCTION reject_work_item_comment_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Work comments are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_item_comment_immutable
BEFORE UPDATE OR DELETE ON work_item_comment
FOR EACH ROW EXECUTE FUNCTION reject_work_item_comment_change();
--> statement-breakpoint
CREATE FUNCTION reject_knowledge_source_change() RETURNS trigger AS $$
BEGIN
  IF OLD.kind IS DISTINCT FROM NEW.kind OR
     OLD.source_capture_id IS DISTINCT FROM NEW.source_capture_id OR
     OLD.url IS DISTINCT FROM NEW.url THEN
    RAISE EXCEPTION 'Knowledge source and link target are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER knowledge_source_immutable
BEFORE UPDATE ON knowledge_item
FOR EACH ROW EXECUTE FUNCTION reject_knowledge_source_change();
