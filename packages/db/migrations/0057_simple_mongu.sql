CREATE TABLE "knowledge_client" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "knowledge_client_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "knowledge_client_digest_valid" CHECK ("knowledge_client"."token_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "knowledge_client_expiry_valid" CHECK ("knowledge_client"."expires_at" > "knowledge_client"."created_at"),
	CONSTRAINT "knowledge_client_name_valid" CHECK (length(trim("knowledge_client"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "knowledge_client_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"decision" text NOT NULL,
	"code" text NOT NULL,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_client_audit_decision_valid" CHECK ("knowledge_client_audit"."decision" in ('allowed','denied'))
);
--> statement-breakpoint
ALTER TABLE "knowledge_client" ADD CONSTRAINT "knowledge_client_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_client_audit" ADD CONSTRAINT "knowledge_client_audit_client_id_knowledge_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."knowledge_client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_client_audit_client_idx" ON "knowledge_client_audit" USING btree ("client_id","id");
--> statement-breakpoint
CREATE FUNCTION reject_knowledge_client_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Knowledge client audit is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER knowledge_client_audit_immutable BEFORE UPDATE OR DELETE ON "knowledge_client_audit"
FOR EACH ROW EXECUTE FUNCTION reject_knowledge_client_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION guard_knowledge_client_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Knowledge client history is immutable';
  END IF;
  IF (NEW.id, NEW.name, NEW.project_id, NEW.token_digest, NEW.created_by, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM
     (OLD.id, OLD.name, OLD.project_id, OLD.token_digest, OLD.created_by, OLD.created_at, OLD.expires_at)
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'Knowledge client grant scope is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER knowledge_client_scope_immutable BEFORE UPDATE OR DELETE ON "knowledge_client"
FOR EACH ROW EXECUTE FUNCTION guard_knowledge_client_mutation();
