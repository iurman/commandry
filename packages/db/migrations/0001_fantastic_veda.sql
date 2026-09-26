CREATE TABLE "project" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"type" text DEFAULT 'general' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_name_nonempty" CHECK (length(trim("project"."name")) > 0),
	CONSTRAINT "project_type_nonempty" CHECK (length(trim("project"."type")) > 0),
	CONSTRAINT "project_lifecycle_valid" CHECK ("project"."lifecycle" in ('proposed', 'active', 'paused', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "project_resource_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source_kind" text NOT NULL,
	"target_kind" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_resource_link_direction_valid" CHECK (("project_resource_link"."type" = 'supports' and "project_resource_link"."source_kind" = 'resource' and "project_resource_link"."target_kind" = 'project') or ("project_resource_link"."type" = 'relates_to' and "project_resource_link"."source_kind" = 'project' and "project_resource_link"."target_kind" = 'resource')),
	CONSTRAINT "project_resource_link_lifecycle_valid" CHECK ("project_resource_link"."lifecycle" in ('active', 'archived')),
	CONSTRAINT "project_resource_link_provenance_nonempty" CHECK (length(trim("project_resource_link"."provenance")) > 0)
);
--> statement-breakpoint
ALTER TABLE "project_resource_link" ADD CONSTRAINT "project_resource_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource_link" ADD CONSTRAINT "project_resource_link_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_name_id_idx" ON "project" USING btree ("name","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_resource_link_unique_idx" ON "project_resource_link" USING btree ("project_id","resource_id","type");--> statement-breakpoint
CREATE INDEX "project_resource_link_project_id_idx" ON "project_resource_link" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "project_resource_link_resource_id_idx" ON "project_resource_link" USING btree ("resource_id");