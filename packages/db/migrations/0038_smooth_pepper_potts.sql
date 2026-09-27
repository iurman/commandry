CREATE TABLE "capture_file_text" (
	"capture_id" uuid PRIMARY KEY NOT NULL,
	"source_sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"extractor" text NOT NULL,
	"extracted_text" text,
	"truncated" boolean DEFAULT false NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_file_text_source_digest_valid" CHECK ("capture_file_text"."source_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "capture_file_text_state_valid" CHECK (("capture_file_text"."status" = 'pending' and "capture_file_text"."extracted_text" is null and "capture_file_text"."message" is null) or ("capture_file_text"."status" = 'extracted' and "capture_file_text"."extracted_text" is not null and length("capture_file_text"."extracted_text") > 0 and "capture_file_text"."message" is null) or ("capture_file_text"."status" in ('unsupported', 'failed') and "capture_file_text"."extracted_text" is null and "capture_file_text"."message" is not null))
);
--> statement-breakpoint
ALTER TABLE "capture_file_text" ADD CONSTRAINT "capture_file_text_capture_id_capture_file_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture_file"("capture_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_file_text_pending_idx" ON "capture_file_text" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "capture_file_text_search_idx" ON "capture_file_text" USING gin (to_tsvector('simple', coalesce("extracted_text", '')));--> statement-breakpoint
INSERT INTO "capture_file_text" ("capture_id", "source_sha256", "extractor")
SELECT "capture_id", "sha256", 'local-utf8-v1' FROM "capture_file";
