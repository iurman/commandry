CREATE TABLE "project_presentation" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"overview_cards" jsonb NOT NULL,
	"visible_areas" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_presentation_version_valid" CHECK ("project_presentation"."version" >= 2),
	CONSTRAINT "project_presentation_cards_array" CHECK (jsonb_typeof("project_presentation"."overview_cards") = 'array' and jsonb_array_length("project_presentation"."overview_cards") <= 8),
	CONSTRAINT "project_presentation_areas_array" CHECK (jsonb_typeof("project_presentation"."visible_areas") = 'array' and jsonb_array_length("project_presentation"."visible_areas") <= 6)
);
--> statement-breakpoint
CREATE TABLE "project_presentation_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"previous" jsonb NOT NULL,
	"current" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_presentation_event_version_valid" CHECK ("project_presentation_event"."version" >= 2),
	CONSTRAINT "project_presentation_event_snapshots_object" CHECK (jsonb_typeof("project_presentation_event"."previous") = 'object' and jsonb_typeof("project_presentation_event"."current") = 'object')
);
--> statement-breakpoint
ALTER TABLE "project_presentation" ADD CONSTRAINT "project_presentation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_presentation_event" ADD CONSTRAINT "project_presentation_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_presentation_event_version_idx" ON "project_presentation_event" USING btree ("project_id","version");
--> statement-breakpoint
CREATE FUNCTION commandry_project_presentation_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'project presentation history is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_presentation_event_immutable
  BEFORE UPDATE OR DELETE ON project_presentation_event
  FOR EACH ROW EXECUTE FUNCTION commandry_project_presentation_event_immutable();
