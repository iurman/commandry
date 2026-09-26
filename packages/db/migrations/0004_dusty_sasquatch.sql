CREATE TABLE "execution_packet" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_capture_id" uuid NOT NULL,
	"packet_version" integer NOT NULL,
	"schema_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content_digest" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "execution_packet_version_positive" CHECK ("execution_packet"."packet_version" > 0),
	CONSTRAINT "execution_packet_schema_version_valid" CHECK ("execution_packet"."schema_version" = 'execution-packet/v1'),
	CONSTRAINT "execution_packet_digest_valid" CHECK ("execution_packet"."content_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "execution_packet" ADD CONSTRAINT "execution_packet_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_packet" ADD CONSTRAINT "execution_packet_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_packet" ADD CONSTRAINT "execution_packet_source_capture_id_capture_id_fk" FOREIGN KEY ("source_capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_packet_work_version_idx" ON "execution_packet" USING btree ("work_item_id","packet_version");--> statement-breakpoint
CREATE INDEX "execution_packet_project_generated_idx" ON "execution_packet" USING btree ("project_id","generated_at","id");
--> statement-breakpoint
CREATE FUNCTION reject_execution_packet_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'execution packets are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER execution_packet_immutable BEFORE UPDATE OR DELETE ON "execution_packet"
FOR EACH ROW EXECUTE FUNCTION reject_execution_packet_mutation();
