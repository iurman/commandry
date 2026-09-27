CREATE TABLE "project_metadata_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"previous" jsonb NOT NULL,
	"current" jsonb NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_metadata_event_version_valid" CHECK ("project_metadata_event"."version" >= 2),
	CONSTRAINT "project_metadata_event_snapshots_object" CHECK (jsonb_typeof("project_metadata_event"."previous") = 'object' and jsonb_typeof("project_metadata_event"."current") = 'object'),
	CONSTRAINT "project_metadata_event_fields_array" CHECK (jsonb_typeof("project_metadata_event"."changed_fields") = 'array' and jsonb_array_length("project_metadata_event"."changed_fields") > 0)
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_metadata_event" ADD CONSTRAINT "project_metadata_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_metadata_event_version_idx" ON "project_metadata_event" USING btree ("project_id","version");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_name_bounded" CHECK (length("project"."name") <= 200);--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_type_bounded" CHECK (length("project"."type") <= 100);--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_summary_bounded" CHECK ("project"."summary" is null or length("project"."summary") <= 4000);--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_version_positive" CHECK ("project"."version" >= 1);
--> statement-breakpoint
CREATE FUNCTION commandry_project_metadata_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'project metadata history is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_metadata_event_immutable
  BEFORE UPDATE OR DELETE ON project_metadata_event
  FOR EACH ROW EXECUTE FUNCTION commandry_project_metadata_event_immutable();
