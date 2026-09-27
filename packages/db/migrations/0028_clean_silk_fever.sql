CREATE TABLE "domain" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_name_nonempty" CHECK (length(trim("domain"."name")) > 0),
	CONSTRAINT "domain_name_bounded" CHECK (length("domain"."name") <= 200),
	CONSTRAINT "domain_description_bounded" CHECK ("domain"."description" is null or length("domain"."description") <= 4000),
	CONSTRAINT "domain_lifecycle_valid" CHECK ("domain"."lifecycle" in ('active', 'archived')),
	CONSTRAINT "domain_version_positive" CHECK ("domain"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "domain_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"domain_id" uuid NOT NULL,
	"project_id" uuid,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"operation" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_audit_event_operation_valid" CHECK ("domain_audit_event"."operation" in ('domain.created', 'domain.updated', 'domain.archived', 'domain.project_linked', 'domain.project_unlinked'))
);
--> statement-breakpoint
CREATE TABLE "project_domain_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"type" text DEFAULT 'owned_by' NOT NULL,
	"source_kind" text DEFAULT 'project' NOT NULL,
	"target_kind" text DEFAULT 'domain' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "project_domain_link_type_valid" CHECK ("project_domain_link"."type" = 'owned_by'),
	CONSTRAINT "project_domain_link_direction_valid" CHECK ("project_domain_link"."source_kind" = 'project' and "project_domain_link"."target_kind" = 'domain'),
	CONSTRAINT "project_domain_link_lifecycle_valid" CHECK ("project_domain_link"."lifecycle" in ('active', 'archived')),
	CONSTRAINT "project_domain_link_archive_consistent" CHECK (("project_domain_link"."lifecycle" = 'active' and "project_domain_link"."archived_at" is null) or ("project_domain_link"."lifecycle" = 'archived' and "project_domain_link"."archived_at" is not null)),
	CONSTRAINT "project_domain_link_provenance_manual" CHECK ("project_domain_link"."provenance" = 'manual')
);
--> statement-breakpoint
ALTER TABLE "domain_audit_event" ADD CONSTRAINT "domain_audit_event_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_audit_event" ADD CONSTRAINT "domain_audit_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_domain_link" ADD CONSTRAINT "project_domain_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_domain_link" ADD CONSTRAINT "project_domain_link_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_name_id_idx" ON "domain" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "domain_audit_event_domain_page_idx" ON "domain_audit_event" USING btree ("domain_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_domain_link_one_active_idx" ON "project_domain_link" USING btree ("project_id") WHERE "project_domain_link"."lifecycle" = 'active';--> statement-breakpoint
CREATE INDEX "project_domain_link_domain_page_idx" ON "project_domain_link" USING btree ("domain_id","id");
--> statement-breakpoint
CREATE FUNCTION reject_domain_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'domain audit history is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER domain_audit_event_immutable BEFORE UPDATE OR DELETE ON "domain_audit_event"
FOR EACH ROW EXECUTE FUNCTION reject_domain_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION guard_project_domain_link_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'project domain link history cannot be deleted';
  END IF;
  IF OLD.lifecycle <> 'active' OR NEW.lifecycle <> 'archived' OR
     NEW.archived_at IS NULL OR OLD.id <> NEW.id OR
     OLD.project_id <> NEW.project_id OR
     OLD.domain_id <> NEW.domain_id OR OLD.type <> NEW.type OR
     OLD.source_kind <> NEW.source_kind OR OLD.target_kind <> NEW.target_kind OR
     OLD.provenance <> NEW.provenance OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'project domain link may only transition from active to archived';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_domain_link_history_guard BEFORE UPDATE OR DELETE ON "project_domain_link"
FOR EACH ROW EXECUTE FUNCTION guard_project_domain_link_mutation();
