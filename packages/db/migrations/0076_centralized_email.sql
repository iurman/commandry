CREATE TABLE "mail_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"domains" jsonb NOT NULL,
	"verified_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"error" text,
	"received_cursor" uuid,
	"sent_cursor" uuid,
	"received_complete" boolean DEFAULT false NOT NULL,
	"sent_complete" boolean DEFAULT false NOT NULL,
	"received_due" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_due" timestamp with time zone DEFAULT now() NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules_version" integer DEFAULT 0 NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	CONSTRAINT "mail_account_provider" CHECK ("mail_account"."provider" = 'resend')
);
--> statement-breakpoint
CREATE TABLE "mail_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"project_id" uuid,
	"operation" text NOT NULL,
	"target_id" uuid,
	"decision" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_draft" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_until" timestamp with time zone,
	"provider_id" uuid,
	"error" text,
	"attempted_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	CONSTRAINT "mail_draft_state" CHECK ("mail_draft"."state" in ('draft','approved','queued','sending','accepted','failed','uncertain','superseded'))
);
--> statement-breakpoint
CREATE TABLE "mail_event" (
	"account_id" uuid NOT NULL,
	"id" text NOT NULL,
	"digest" text NOT NULL,
	"external_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "error" text,
	CONSTRAINT "mail_event_account_id_id_pk" PRIMARY KEY("account_id","id")
);
--> statement-breakpoint
CREATE TABLE "mail_membership" (
	"message_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"address" text NOT NULL,
	"domain" text NOT NULL,
	CONSTRAINT "mail_membership_message_id_address_pk" PRIMARY KEY("message_id","address")
);
--> statement-breakpoint
CREATE TABLE "mail_message" (
	"id" uuid PRIMARY KEY NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"attention" text DEFAULT 'open' NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"annotation" jsonb,
	"status_at" timestamp with time zone,
	CONSTRAINT "mail_message_direction" CHECK ("mail_message"."direction" in ('received','sent')),
	CONSTRAINT "mail_message_attention" CHECK ("mail_message"."attention" in ('open','reviewed','resolved'))
);
--> statement-breakpoint
ALTER TABLE "foundation_client" DROP CONSTRAINT "foundation_client_operations_valid";
--> statement-breakpoint
ALTER TABLE "mail_account" ADD CONSTRAINT "mail_account_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_draft" ADD CONSTRAINT "mail_draft_account_id_mail_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_account"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_event" ADD CONSTRAINT "mail_event_account_id_mail_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_account"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_membership" ADD CONSTRAINT "mail_membership_message_id_mail_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_message"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_membership" ADD CONSTRAINT "mail_membership_account_id_mail_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_account"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_message" ADD CONSTRAINT "mail_message_account_id_mail_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_account"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_account_primary_resend" ON "mail_account" USING btree ("provider");
--> statement-breakpoint
CREATE INDEX "mail_account_project" ON "mail_account" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "mail_draft_outbox" ON "mail_draft" USING btree ("state","lease_until");
--> statement-breakpoint
CREATE INDEX "mail_draft_page" ON "mail_draft" USING btree ("account_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "mail_event_pending" ON "mail_event" USING btree ("processed","account_id");
--> statement-breakpoint
CREATE INDEX "mail_membership_address" ON "mail_membership" USING btree ("account_id","address","message_id");
--> statement-breakpoint
CREATE INDEX "mail_membership_domain" ON "mail_membership" USING btree ("domain","message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_message_external" ON "mail_message" USING btree ("account_id","external_id","direction");
--> statement-breakpoint
CREATE INDEX "mail_message_page" ON "mail_message" USING btree ("account_id","occurred_at","id");
--> statement-breakpoint
ALTER TABLE "foundation_client" ADD CONSTRAINT "foundation_client_operations_valid" CHECK (jsonb_typeof("foundation_client"."operations") = 'array' and jsonb_array_length("foundation_client"."operations") between 1 and 24 and "foundation_client"."operations" <@ '["foundation.read","work.read","mail.read","mail.triage","mail.draft","mail.send","resources.read","observatory.read","observatory.signals.read","observatory.security.read","observatory.providers.read","observatory.inventory.read","work.propose","evidence.record","memory.propose","memory.revise","configuration.record","evaluation.record","improvement.read","improvement.propose","finding.read","finding.propose","onboarding.read","onboarding.propose"]'::jsonb);

--> statement-breakpoint
CREATE FUNCTION commandry_mail_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.account_id <> OLD.account_id OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
  RAISE EXCEPTION 'Email draft payload and provenance are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.state = 'accepted' AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Accepted email receipt is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mail_draft_immutable BEFORE UPDATE OR DELETE ON mail_draft FOR EACH ROW EXECUTE FUNCTION commandry_mail_draft_guard();
--> statement-breakpoint
CREATE TRIGGER mail_audit_immutable BEFORE UPDATE OR DELETE ON mail_audit FOR EACH ROW EXECUTE FUNCTION commandry_foundation_immutable();
--> statement-breakpoint
ALTER TABLE mail_draft ADD CONSTRAINT mail_draft_approval_valid CHECK (
 state NOT IN ('approved','queued','sending','accepted') OR
 (approved_by IS NOT NULL AND approved_by LIKE 'user:%' AND approved_until IS NOT NULL)
);
--> statement-breakpoint
DO $$ DECLARE target_role record; privilege text; table_name text;
BEGIN
 FOR target_role IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname <> current_user LOOP
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
   IF has_table_privilege(target_role.rolname,'public.project',privilege) AND has_table_privilege(target_role.rolname,'public.foundation_client',privilege) THEN
    FOREACH table_name IN ARRAY ARRAY['mail_account','mail_message','mail_membership','mail_draft','mail_event','mail_audit'] LOOP
     IF table_name <> 'mail_audit' OR privilege <> 'UPDATE' THEN
      EXECUTE format('GRANT %s ON TABLE public.%I TO %I',privilege,table_name,target_role.rolname);
     END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
END $$;
