CREATE TABLE "work_item_acceptance" (
	"work_item_id" uuid PRIMARY KEY NOT NULL,
	"criteria" text NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_acceptance_version_positive" CHECK ("work_item_acceptance"."version" > 0),
	CONSTRAINT "work_item_acceptance_criteria_length" CHECK (length("work_item_acceptance"."criteria") <= 10000)
);
--> statement-breakpoint
CREATE TABLE "work_item_acceptance_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"criteria" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_acceptance_revision_version_positive" CHECK ("work_item_acceptance_revision"."version" > 0),
	CONSTRAINT "work_item_acceptance_revision_actor_local" CHECK ("work_item_acceptance_revision"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
CREATE TABLE "work_item_verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"acceptance_version" integer NOT NULL,
	"attachment_id" uuid NOT NULL,
	"document_title" text NOT NULL,
	"source_capture_id" uuid NOT NULL,
	"result" text NOT NULL,
	"note" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_verification_result_valid" CHECK ("work_item_verification"."result" in ('met', 'not_met')),
	CONSTRAINT "work_item_verification_note_length" CHECK (length("work_item_verification"."note") <= 5000),
	CONSTRAINT "work_item_verification_acceptance_version_positive" CHECK ("work_item_verification"."acceptance_version" > 0),
	CONSTRAINT "work_item_verification_actor_local" CHECK ("work_item_verification"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "work_item_acceptance" ADD CONSTRAINT "work_item_acceptance_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_acceptance_revision" ADD CONSTRAINT "work_item_acceptance_revision_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_verification" ADD CONSTRAINT "work_item_verification_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_verification" ADD CONSTRAINT "work_item_verification_attachment_id_work_item_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."work_item_attachment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_verification" ADD CONSTRAINT "work_item_verification_source_capture_id_capture_id_fk" FOREIGN KEY ("source_capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_acceptance_revision_version_idx" ON "work_item_acceptance_revision" USING btree ("work_item_id","version");--> statement-breakpoint
CREATE INDEX "work_item_verification_page_idx" ON "work_item_verification" USING btree ("work_item_id","created_at","id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_work_acceptance_history() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'work acceptance history is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_acceptance_revision_immutable
BEFORE UPDATE OR DELETE ON work_item_acceptance_revision
FOR EACH ROW EXECUTE FUNCTION guard_work_acceptance_history();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_work_verification() RETURNS trigger AS $$
DECLARE
  expected_title text;
  expected_capture uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'work verification history is immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM work_item_acceptance a
    JOIN work_item w ON w.id = a.work_item_id
    WHERE a.work_item_id = NEW.work_item_id
      AND a.version = NEW.acceptance_version
      AND length(trim(a.criteria)) > 0
      AND w.status = 'open'
  ) THEN
    RAISE EXCEPTION 'current open task acceptance is required';
  END IF;
  SELECT k.title, k.source_capture_id
    INTO expected_title, expected_capture
    FROM work_item_attachment a
    JOIN knowledge_item k ON k.id = a.knowledge_item_id
    WHERE a.id = NEW.attachment_id
      AND a.work_item_id = NEW.work_item_id
      AND a.state = 'active'
      AND k.kind = 'document';
  IF expected_capture IS NULL
     OR NEW.document_title <> expected_title
     OR NEW.source_capture_id <> expected_capture
     OR length(trim(NEW.note)) = 0 THEN
    RAISE EXCEPTION 'verification must cite its active original document';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_verification_guard
BEFORE INSERT OR UPDATE OR DELETE ON work_item_verification
FOR EACH ROW EXECUTE FUNCTION guard_work_verification();
