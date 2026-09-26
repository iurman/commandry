CREATE TABLE "capture" (
	"id" uuid PRIMARY KEY NOT NULL,
	"input_type" text NOT NULL,
	"original_content" text NOT NULL,
	"source" text DEFAULT 'manual-local' NOT NULL,
	"author" text DEFAULT 'local-user' NOT NULL,
	"state" text DEFAULT 'unfiled' NOT NULL,
	"project_id" uuid,
	"filed_record_kind" text,
	"filed_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"filed_at" timestamp with time zone,
	CONSTRAINT "capture_original_nonempty" CHECK (length(trim("capture"."original_content")) > 0),
	CONSTRAINT "capture_input_type_valid" CHECK ("capture"."input_type" in ('text', 'url')),
	CONSTRAINT "capture_source_manual" CHECK ("capture"."source" = 'manual-local'),
	CONSTRAINT "capture_author_local" CHECK ("capture"."author" = 'local-user'),
	CONSTRAINT "capture_filing_state_valid" CHECK (("capture"."state" = 'unfiled' and "capture"."filed_at" is null and "capture"."filed_record_kind" is null and "capture"."filed_record_id" is null) or ("capture"."state" = 'filed' and "capture"."filed_at" is not null and "capture"."project_id" is not null and "capture"."filed_record_kind" in ('task', 'note') and "capture"."filed_record_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_capture_id" uuid NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_item_title_nonempty" CHECK (length(trim("knowledge_item"."title")) > 0),
	CONSTRAINT "knowledge_item_kind_valid" CHECK ("knowledge_item"."kind" = 'note')
);
--> statement-breakpoint
CREATE TABLE "work_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_capture_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_title_nonempty" CHECK (length(trim("work_item"."title")) > 0),
	CONSTRAINT "work_item_status_valid" CHECK ("work_item"."status" in ('open', 'done'))
);
--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_source_capture_id_capture_id_fk" FOREIGN KEY ("source_capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_source_capture_id_capture_id_fk" FOREIGN KEY ("source_capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_created_id_idx" ON "capture" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "capture_project_idx" ON "capture" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "capture_original_search_idx" ON "capture" USING gin (to_tsvector('simple', "original_content"));--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_item_source_capture_unique_idx" ON "knowledge_item" USING btree ("source_capture_id");--> statement-breakpoint
CREATE INDEX "knowledge_item_project_id_idx" ON "knowledge_item" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "knowledge_item_search_idx" ON "knowledge_item" USING gin (to_tsvector('simple', "title" || ' ' || "content"));--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_source_capture_unique_idx" ON "work_item" USING btree ("source_capture_id");--> statement-breakpoint
CREATE INDEX "work_item_project_id_idx" ON "work_item" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "work_item_search_idx" ON "work_item" USING gin (to_tsvector('simple', "title" || ' ' || "description"));--> statement-breakpoint
CREATE FUNCTION reject_capture_source_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.input_type IS DISTINCT FROM NEW.input_type
    OR OLD.original_content IS DISTINCT FROM NEW.original_content
    OR OLD.source IS DISTINCT FROM NEW.source
    OR OLD.author IS DISTINCT FROM NEW.author
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'capture source fields are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER capture_source_immutable BEFORE UPDATE ON "capture"
FOR EACH ROW EXECUTE FUNCTION reject_capture_source_mutation();
