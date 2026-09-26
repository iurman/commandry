CREATE TABLE "local_mcp_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"actor" text DEFAULT 'local-mcp-client:unattributed' NOT NULL,
	"operation" text NOT NULL,
	"decision" text NOT NULL,
	"code" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_mcp_audit_actor_valid" CHECK ("local_mcp_audit_event"."actor" in ('local-mcp-client:unattributed','local-reviewer:unattributed')),
	CONSTRAINT "local_mcp_audit_decision_valid" CHECK ("local_mcp_audit_event"."decision" in ('allowed','denied'))
);
--> statement-breakpoint
CREATE TABLE "local_mcp_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"packet_id" uuid NOT NULL,
	"packet_version" integer NOT NULL,
	"packet_digest" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_mcp_session_token_digest_valid" CHECK ("local_mcp_session"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "local_mcp_session_packet_digest_valid" CHECK ("local_mcp_session"."packet_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "local_mcp_session_packet_version_valid" CHECK ("local_mcp_session"."packet_version" > 0),
	CONSTRAINT "local_mcp_session_expiry_valid" CHECK ("local_mcp_session"."expires_at" > "local_mcp_session"."created_at")
);
--> statement-breakpoint
ALTER TABLE "local_mcp_audit_event" ADD CONSTRAINT "local_mcp_audit_event_session_id_local_mcp_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."local_mcp_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mcp_session" ADD CONSTRAINT "local_mcp_session_packet_id_execution_packet_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."execution_packet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mcp_session" ADD CONSTRAINT "local_mcp_session_agent_id_local_agent_profile_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."local_agent_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mcp_session" ADD CONSTRAINT "local_mcp_session_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mcp_session" ADD CONSTRAINT "local_mcp_session_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_mcp_audit_page_idx" ON "local_mcp_audit_event" USING btree ("session_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_mcp_session_token_idx" ON "local_mcp_session" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "local_mcp_session_packet_page_idx" ON "local_mcp_session" USING btree ("packet_id","created_at","id");