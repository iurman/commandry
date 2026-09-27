CREATE TABLE "saved_view" (
	"id" uuid PRIMARY KEY NOT NULL,
	"surface" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "saved_view_name_valid" CHECK (length(trim("saved_view"."name")) between 1 and 80),
	CONSTRAINT "saved_view_version_positive" CHECK ("saved_view"."version" > 0),
	CONSTRAINT "saved_view_definition_surface_valid" CHECK ("saved_view"."definition"->>'surface' = "saved_view"."surface"),
	CONSTRAINT "saved_view_actor_local" CHECK ("saved_view"."actor" = 'local-user:unattributed'),
	CONSTRAINT "saved_view_lifecycle_valid" CHECK (("saved_view"."lifecycle" = 'active' and "saved_view"."archived_at" is null) or ("saved_view"."lifecycle" = 'archived' and "saved_view"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "saved_view_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"saved_view_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_view_audit_event_actor_local" CHECK ("saved_view_audit_event"."actor" = 'local-user:unattributed'),
	CONSTRAINT "saved_view_audit_event_version_positive" CHECK ("saved_view_audit_event"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "saved_view_audit_event" ADD CONSTRAINT "saved_view_audit_event_saved_view_id_saved_view_id_fk" FOREIGN KEY ("saved_view_id") REFERENCES "public"."saved_view"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_view_surface_created_idx" ON "saved_view" USING btree ("surface","lifecycle","created_at","id");--> statement-breakpoint
CREATE INDEX "saved_view_audit_event_view_created_idx" ON "saved_view_audit_event" USING btree ("saved_view_id","created_at","id");