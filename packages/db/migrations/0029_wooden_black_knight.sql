CREATE TABLE "system" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_name_nonempty" CHECK (length(trim("system"."name")) > 0),
	CONSTRAINT "system_name_bounded" CHECK (length("system"."name") <= 200),
	CONSTRAINT "system_summary_bounded" CHECK ("system"."summary" is null or length("system"."summary") <= 4000),
	CONSTRAINT "system_lifecycle_valid" CHECK ("system"."lifecycle" in ('active', 'archived')),
	CONSTRAINT "system_version_positive" CHECK ("system"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "system_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"system_id" uuid NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"operation" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_audit_event_operation_valid" CHECK ("system_audit_event"."operation" in ('system.created', 'system.updated', 'system.archived', 'system.domain_linked', 'system.domain_unlinked', 'system.project_linked', 'system.project_unlinked', 'system.resource_linked', 'system.resource_unlinked'))
);
--> statement-breakpoint
CREATE TABLE "system_domain_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"system_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"type" text DEFAULT 'owned_by' NOT NULL,
	"source_kind" text DEFAULT 'system' NOT NULL,
	"target_kind" text DEFAULT 'domain' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "system_domain_link_type_valid" CHECK ("system_domain_link"."type" = 'owned_by'),
	CONSTRAINT "system_domain_link_direction_valid" CHECK ("system_domain_link"."source_kind" = 'system' and "system_domain_link"."target_kind" = 'domain'),
	CONSTRAINT "system_domain_link_lifecycle_valid" CHECK ("system_domain_link"."lifecycle" in ('active', 'archived')),
	CONSTRAINT "system_domain_link_archive_consistent" CHECK (("system_domain_link"."lifecycle" = 'active' and "system_domain_link"."archived_at" is null) or ("system_domain_link"."lifecycle" = 'archived' and "system_domain_link"."archived_at" is not null)),
	CONSTRAINT "system_domain_link_provenance_manual" CHECK ("system_domain_link"."provenance" = 'manual')
);
--> statement-breakpoint
CREATE TABLE "system_project_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"system_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text DEFAULT 'relates_to' NOT NULL,
	"source_kind" text DEFAULT 'system' NOT NULL,
	"target_kind" text DEFAULT 'project' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "system_project_link_type_valid" CHECK ("system_project_link"."type" = 'relates_to'),
	CONSTRAINT "system_project_link_direction_valid" CHECK ("system_project_link"."source_kind" = 'system' and "system_project_link"."target_kind" = 'project'),
	CONSTRAINT "system_project_link_lifecycle_valid" CHECK ("system_project_link"."lifecycle" in ('active', 'archived')),
	CONSTRAINT "system_project_link_archive_consistent" CHECK (("system_project_link"."lifecycle" = 'active' and "system_project_link"."archived_at" is null) or ("system_project_link"."lifecycle" = 'archived' and "system_project_link"."archived_at" is not null)),
	CONSTRAINT "system_project_link_provenance_manual" CHECK ("system_project_link"."provenance" = 'manual')
);
--> statement-breakpoint
CREATE TABLE "system_resource_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"system_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"type" text DEFAULT 'supports' NOT NULL,
	"source_kind" text DEFAULT 'resource' NOT NULL,
	"target_kind" text DEFAULT 'system' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "system_resource_link_type_valid" CHECK ("system_resource_link"."type" = 'supports'),
	CONSTRAINT "system_resource_link_direction_valid" CHECK ("system_resource_link"."source_kind" = 'resource' and "system_resource_link"."target_kind" = 'system'),
	CONSTRAINT "system_resource_link_lifecycle_valid" CHECK ("system_resource_link"."lifecycle" in ('active', 'archived')),
	CONSTRAINT "system_resource_link_archive_consistent" CHECK (("system_resource_link"."lifecycle" = 'active' and "system_resource_link"."archived_at" is null) or ("system_resource_link"."lifecycle" = 'archived' and "system_resource_link"."archived_at" is not null)),
	CONSTRAINT "system_resource_link_provenance_manual" CHECK ("system_resource_link"."provenance" = 'manual')
);
--> statement-breakpoint
ALTER TABLE "system_audit_event" ADD CONSTRAINT "system_audit_event_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_domain_link" ADD CONSTRAINT "system_domain_link_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_domain_link" ADD CONSTRAINT "system_domain_link_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_project_link" ADD CONSTRAINT "system_project_link_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_project_link" ADD CONSTRAINT "system_project_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_resource_link" ADD CONSTRAINT "system_resource_link_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_resource_link" ADD CONSTRAINT "system_resource_link_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "system_name_id_idx" ON "system" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "system_audit_event_system_page_idx" ON "system_audit_event" USING btree ("system_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_domain_link_one_active_idx" ON "system_domain_link" USING btree ("system_id") WHERE "system_domain_link"."lifecycle" = 'active';--> statement-breakpoint
CREATE INDEX "system_domain_link_domain_page_idx" ON "system_domain_link" USING btree ("domain_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_project_link_one_active_idx" ON "system_project_link" USING btree ("system_id","project_id") WHERE "system_project_link"."lifecycle" = 'active';--> statement-breakpoint
CREATE INDEX "system_project_link_project_page_idx" ON "system_project_link" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_resource_link_one_active_idx" ON "system_resource_link" USING btree ("system_id","resource_id") WHERE "system_resource_link"."lifecycle" = 'active';--> statement-breakpoint
CREATE INDEX "system_resource_link_resource_page_idx" ON "system_resource_link" USING btree ("resource_id","id");
--> statement-breakpoint
CREATE FUNCTION reject_system_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'system audit history is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER system_audit_event_immutable BEFORE UPDATE OR DELETE ON "system_audit_event"
FOR EACH ROW EXECUTE FUNCTION reject_system_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION guard_system_link_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'system link history cannot be deleted';
  END IF;
  IF OLD.lifecycle <> 'active' OR NEW.lifecycle <> 'archived' OR
     NEW.archived_at IS NULL OR
     (to_jsonb(NEW) - 'lifecycle' - 'archived_at') <>
     (to_jsonb(OLD) - 'lifecycle' - 'archived_at') THEN
    RAISE EXCEPTION 'system link may only transition from active to archived';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER system_domain_link_history_guard BEFORE UPDATE OR DELETE ON "system_domain_link"
FOR EACH ROW EXECUTE FUNCTION guard_system_link_mutation();
--> statement-breakpoint
CREATE TRIGGER system_project_link_history_guard BEFORE UPDATE OR DELETE ON "system_project_link"
FOR EACH ROW EXECUTE FUNCTION guard_system_link_mutation();
--> statement-breakpoint
CREATE TRIGGER system_resource_link_history_guard BEFORE UPDATE OR DELETE ON "system_resource_link"
FOR EACH ROW EXECUTE FUNCTION guard_system_link_mutation();
