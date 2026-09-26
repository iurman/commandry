CREATE TABLE "simulated_action_proposal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"packet_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"descriptor" jsonb NOT NULL,
	"descriptor_digest" text NOT NULL,
	"occurrence_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulated_action_proposal_schema_version_valid" CHECK ("simulated_action_proposal"."schema_version" = 'simulated-resource-restart/v1'),
	CONSTRAINT "simulated_action_proposal_digest_valid" CHECK ("simulated_action_proposal"."descriptor_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "simulated_action_proposal_fingerprint_valid" CHECK ("simulated_action_proposal"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "simulated_action_proposal_occurrence_nonempty" CHECK (length(trim("simulated_action_proposal"."occurrence_id")) > 0),
	CONSTRAINT "simulated_action_proposal_expiry_valid" CHECK ("simulated_action_proposal"."expires_at" > "simulated_action_proposal"."created_at")
);
--> statement-breakpoint
CREATE TABLE "simulated_approval_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proposal_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "simulated_approval_attempt_number_positive" CHECK ("simulated_approval_attempt"."number" > 0),
	CONSTRAINT "simulated_approval_attempt_state_valid" CHECK ("simulated_approval_attempt"."state" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "simulated_approval_decision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proposal_id" uuid NOT NULL,
	"occurrence_id" text NOT NULL,
	"decision" text NOT NULL,
	"expected_digest" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulated_approval_decision_valid" CHECK ("simulated_approval_decision"."decision" in ('approved', 'rejected', 'cancelled', 'expired')),
	CONSTRAINT "simulated_approval_decision_digest_valid" CHECK ("simulated_approval_decision"."expected_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "simulated_approval_decision_occurrence_nonempty" CHECK (length(trim("simulated_approval_decision"."occurrence_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "simulated_approval_outcome" (
	"proposal_id" uuid PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'simulated_only' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"external_actions" jsonb NOT NULL,
	"resource_state_changed" boolean DEFAULT false NOT NULL,
	"summary" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "simulated_approval_outcome_kind_valid" CHECK ("simulated_approval_outcome"."kind" = 'simulated_only'),
	CONSTRAINT "simulated_approval_outcome_unverified" CHECK ("simulated_approval_outcome"."verification_status" = 'unverified'),
	CONSTRAINT "simulated_approval_outcome_no_external_actions" CHECK ("simulated_approval_outcome"."external_actions" = '[]'::jsonb),
	CONSTRAINT "simulated_approval_outcome_no_resource_change" CHECK ("simulated_approval_outcome"."resource_state_changed" = false)
);
--> statement-breakpoint
CREATE TABLE "simulated_approval_state" (
	"proposal_id" uuid PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulated_approval_state_valid" CHECK ("simulated_approval_state"."state" in ('pending', 'approved', 'rejected', 'cancelled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "target_approval_id" uuid;--> statement-breakpoint
ALTER TABLE "simulated_action_proposal" ADD CONSTRAINT "simulated_action_proposal_run_id_local_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_agent_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_action_proposal" ADD CONSTRAINT "simulated_action_proposal_agent_id_local_agent_profile_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."local_agent_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_action_proposal" ADD CONSTRAINT "simulated_action_proposal_packet_id_execution_packet_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."execution_packet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_action_proposal" ADD CONSTRAINT "simulated_action_proposal_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_action_proposal" ADD CONSTRAINT "simulated_action_proposal_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_action_proposal" ADD CONSTRAINT "simulated_action_proposal_link_id_project_resource_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."project_resource_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_approval_attempt" ADD CONSTRAINT "simulated_approval_attempt_proposal_id_simulated_action_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."simulated_action_proposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_approval_decision" ADD CONSTRAINT "simulated_approval_decision_proposal_id_simulated_action_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."simulated_action_proposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_approval_outcome" ADD CONSTRAINT "simulated_approval_outcome_proposal_id_simulated_action_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."simulated_action_proposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_approval_state" ADD CONSTRAINT "simulated_approval_state_proposal_id_simulated_action_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."simulated_action_proposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "simulated_action_proposal_occurrence_idx" ON "simulated_action_proposal" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "simulated_action_proposal_created_idx" ON "simulated_action_proposal" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "simulated_action_proposal_run_idx" ON "simulated_action_proposal" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "simulated_action_proposal_project_idx" ON "simulated_action_proposal" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simulated_approval_attempt_number_idx" ON "simulated_approval_attempt" USING btree ("proposal_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "simulated_approval_decision_once_idx" ON "simulated_approval_decision" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simulated_approval_decision_occurrence_idx" ON "simulated_approval_decision" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "simulated_approval_decision_created_idx" ON "simulated_approval_decision" USING btree ("proposal_id","created_at","id");--> statement-breakpoint
CREATE INDEX "simulated_approval_state_state_idx" ON "simulated_approval_state" USING btree ("state");--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_target_approval_id_simulated_action_proposal_id_fk" FOREIGN KEY ("target_approval_id") REFERENCES "public"."simulated_action_proposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_target_approval_idx" ON "audit_event" USING btree ("target_approval_id","created_at","id");--> statement-breakpoint
CREATE FUNCTION reject_simulated_approval_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'simulated approval history is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER simulated_action_proposal_immutable BEFORE UPDATE OR DELETE ON "simulated_action_proposal"
FOR EACH ROW EXECUTE FUNCTION reject_simulated_approval_history_mutation();
--> statement-breakpoint
CREATE TRIGGER simulated_approval_decision_immutable BEFORE UPDATE OR DELETE ON "simulated_approval_decision"
FOR EACH ROW EXECUTE FUNCTION reject_simulated_approval_history_mutation();
--> statement-breakpoint
CREATE TRIGGER simulated_approval_outcome_immutable BEFORE UPDATE OR DELETE ON "simulated_approval_outcome"
FOR EACH ROW EXECUTE FUNCTION reject_simulated_approval_history_mutation();
--> statement-breakpoint
CREATE FUNCTION reject_simulated_approval_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.target_approval_id IS NOT NULL THEN
    RAISE EXCEPTION 'simulated approval audit is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER simulated_approval_audit_immutable BEFORE UPDATE OR DELETE ON "audit_event"
FOR EACH ROW EXECUTE FUNCTION reject_simulated_approval_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION guard_simulated_approval_state_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'approved' AND NEW.state = 'expired' THEN
    IF NEW.decided_at IS DISTINCT FROM OLD.decided_at
      OR EXISTS (SELECT 1 FROM simulated_approval_outcome WHERE proposal_id = OLD.proposal_id)
      OR NOT EXISTS (
        SELECT 1 FROM simulated_action_proposal
        WHERE id = OLD.proposal_id AND expires_at <= now()
      ) THEN
      RAISE EXCEPTION 'approved simulation cannot expire in this state' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'simulated approval decision is final' USING ERRCODE = '23514';
  END IF;
  IF (NEW.state = 'pending' AND NEW.decided_at IS NOT NULL)
    OR (NEW.state <> 'pending' AND NEW.decided_at IS NULL) THEN
    RAISE EXCEPTION 'simulated approval state and decision time disagree' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER simulated_approval_state_transition BEFORE UPDATE ON "simulated_approval_state"
FOR EACH ROW EXECUTE FUNCTION guard_simulated_approval_state_transition();
