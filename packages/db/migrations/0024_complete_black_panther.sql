CREATE TABLE "capture_file" (
	"capture_id" uuid PRIMARY KEY NOT NULL,
	"original_name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"content_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_file_name_nonempty" CHECK (length("capture_file"."original_name") > 0),
	CONSTRAINT "capture_file_size_valid" CHECK ("capture_file"."byte_size" between 1 and 2097152),
	CONSTRAINT "capture_file_digest_valid" CHECK ("capture_file"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "capture_file_bytes_match_size" CHECK (octet_length(decode("capture_file"."content_base64", 'base64')) = "capture_file"."byte_size")
);
--> statement-breakpoint
ALTER TABLE "capture" DROP CONSTRAINT "capture_input_type_valid";--> statement-breakpoint
ALTER TABLE "capture" DROP CONSTRAINT "capture_filing_state_valid";--> statement-breakpoint
ALTER TABLE "knowledge_item" DROP CONSTRAINT "knowledge_item_kind_valid";--> statement-breakpoint
ALTER TABLE "knowledge_item" DROP CONSTRAINT "knowledge_item_url_valid";--> statement-breakpoint
ALTER TABLE "capture_file" ADD CONSTRAINT "capture_file_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_input_type_valid" CHECK ("capture"."input_type" in ('text', 'url', 'file'));--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_filing_state_valid" CHECK (("capture"."state" = 'unfiled' and "capture"."filed_at" is null and "capture"."filed_record_kind" is null and "capture"."filed_record_id" is null) or ("capture"."state" = 'filed' and "capture"."filed_at" is not null and "capture"."project_id" is not null and "capture"."filed_record_kind" in ('task', 'note', 'link', 'document') and "capture"."filed_record_id" is not null));--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_kind_valid" CHECK ("knowledge_item"."kind" in ('note', 'link', 'document'));--> statement-breakpoint
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_url_valid" CHECK (("knowledge_item"."kind" in ('note', 'document') and "knowledge_item"."url" is null) or ("knowledge_item"."kind" = 'link' and "knowledge_item"."url" is not null and length(trim("knowledge_item"."url")) > 0));
--> statement-breakpoint
CREATE FUNCTION validate_capture_file_source() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Original file bytes and metadata are immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM capture
    WHERE id = NEW.capture_id AND input_type = 'file'
      AND original_content = 'capture-file://' || NEW.capture_id::text
  ) THEN
    RAISE EXCEPTION 'Original file requires a matching file capture';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER capture_file_source_immutable
BEFORE INSERT OR UPDATE OR DELETE ON capture_file
FOR EACH ROW EXECUTE FUNCTION validate_capture_file_source();
--> statement-breakpoint
CREATE FUNCTION validate_knowledge_document_source() RETURNS trigger AS $$
BEGIN
  IF NEW.kind = 'document' AND NOT EXISTS (
    SELECT 1 FROM capture_file WHERE capture_id = NEW.source_capture_id
  ) THEN
    RAISE EXCEPTION 'Knowledge document requires an original file capture';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER knowledge_document_source_valid
BEFORE INSERT ON knowledge_item
FOR EACH ROW EXECUTE FUNCTION validate_knowledge_document_source();
--> statement-breakpoint
CREATE FUNCTION validate_file_capture_filing() RETURNS trigger AS $$
BEGIN
  IF NEW.input_type = 'file' AND NEW.state = 'filed' AND NEW.filed_record_kind <> 'document' THEN
    RAISE EXCEPTION 'File captures can only be filed as documents';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER file_capture_filing_valid
BEFORE UPDATE ON capture
FOR EACH ROW EXECUTE FUNCTION validate_file_capture_filing();
--> statement-breakpoint
CREATE FUNCTION validate_work_capture_source() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM capture WHERE id = NEW.source_capture_id AND input_type = 'file') THEN
    RAISE EXCEPTION 'A task cannot use a file capture as its original';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_capture_source_valid
BEFORE INSERT ON work_item
FOR EACH ROW EXECUTE FUNCTION validate_work_capture_source();
