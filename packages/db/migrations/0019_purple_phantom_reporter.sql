CREATE TABLE "integration_instance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_instance_kind_valid" CHECK ("integration_instance"."kind" in ('synthetic-development', 'synthetic-operations')),
	CONSTRAINT "integration_instance_resource_required" CHECK ("integration_instance"."kind" = 'synthetic-development' or "integration_instance"."resource_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "integration_instance_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"integration_instance_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "synthetic_event_import" ADD COLUMN "integration_instance_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_instance" ADD CONSTRAINT "integration_instance_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_instance" ADD CONSTRAINT "integration_instance_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_instance_audit" ADD CONSTRAINT "integration_instance_audit_integration_instance_id_integration_instance_id_fk" FOREIGN KEY ("integration_instance_id") REFERENCES "public"."integration_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_instance_project_idx" ON "integration_instance" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "integration_instance_created_idx" ON "integration_instance" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "integration_instance_audit_instance_idx" ON "integration_instance_audit" USING btree ("integration_instance_id","created_at","id");--> statement-breakpoint
ALTER TABLE "synthetic_event_import" ADD CONSTRAINT "synthetic_event_import_integration_instance_id_integration_instance_id_fk" FOREIGN KEY ("integration_instance_id") REFERENCES "public"."integration_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "synthetic_event_import_integration_idx" ON "synthetic_event_import" USING btree ("integration_instance_id","created_at","id");