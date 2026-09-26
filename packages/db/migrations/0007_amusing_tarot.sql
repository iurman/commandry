CREATE TABLE "capture_triage_decision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"capture_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"selected_project_id" uuid,
	"selected_kind" text,
	"selected_title" text,
	"selected_body" text,
	"filed_record_id" uuid,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_triage_decision_actor_local" CHECK ("capture_triage_decision"."actor" = 'local-user:unattributed'),
	CONSTRAINT "capture_triage_decision_kind_valid" CHECK ("capture_triage_decision"."selected_kind" is null or "capture_triage_decision"."selected_kind" in ('task', 'note')),
	CONSTRAINT "capture_triage_decision_state_valid" CHECK (("capture_triage_decision"."decision" = 'reject' and "capture_triage_decision"."selected_project_id" is null and "capture_triage_decision"."selected_kind" is null and "capture_triage_decision"."selected_title" is null and "capture_triage_decision"."selected_body" is null and "capture_triage_decision"."filed_record_id" is null) or ("capture_triage_decision"."decision" = 'approve' and "capture_triage_decision"."selected_project_id" is not null and "capture_triage_decision"."selected_kind" is not null and "capture_triage_decision"."selected_title" is not null and "capture_triage_decision"."selected_body" is not null and "capture_triage_decision"."filed_record_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "capture_triage_suggestion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"capture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"proposed_project_id" uuid,
	"title" text NOT NULL,
	"confidence" integer NOT NULL,
	"rationale" text NOT NULL,
	"rule_version" text NOT NULL,
	"source_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_triage_suggestion_kind_valid" CHECK ("capture_triage_suggestion"."kind" in ('task', 'note')),
	CONSTRAINT "capture_triage_suggestion_title_nonempty" CHECK (length(trim("capture_triage_suggestion"."title")) > 0),
	CONSTRAINT "capture_triage_suggestion_confidence_valid" CHECK ("capture_triage_suggestion"."confidence" between 0 and 100),
	CONSTRAINT "capture_triage_suggestion_rule_v1" CHECK ("capture_triage_suggestion"."rule_version" = 'capture-triage/v1'),
	CONSTRAINT "capture_triage_suggestion_source_local" CHECK ("capture_triage_suggestion"."source_label" = 'Local deterministic rule')
);
--> statement-breakpoint
CREATE TABLE "work_item_status_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"previous_status" text NOT NULL,
	"next_status" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_status_event_changed" CHECK ("work_item_status_event"."previous_status" <> "work_item_status_event"."next_status"),
	CONSTRAINT "work_item_status_event_actor_local" CHECK ("work_item_status_event"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "capture_triage_decision" ADD CONSTRAINT "capture_triage_decision_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_triage_decision" ADD CONSTRAINT "capture_triage_decision_suggestion_id_capture_triage_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."capture_triage_suggestion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_triage_decision" ADD CONSTRAINT "capture_triage_decision_selected_project_id_project_id_fk" FOREIGN KEY ("selected_project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ADD CONSTRAINT "capture_triage_suggestion_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ADD CONSTRAINT "capture_triage_suggestion_proposed_project_id_project_id_fk" FOREIGN KEY ("proposed_project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_status_event" ADD CONSTRAINT "work_item_status_event_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capture_triage_decision_capture_idx" ON "capture_triage_decision" USING btree ("capture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_triage_decision_suggestion_idx" ON "capture_triage_decision" USING btree ("suggestion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_triage_suggestion_capture_idx" ON "capture_triage_suggestion" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "work_item_status_event_page_idx" ON "work_item_status_event" USING btree ("work_item_id","created_at","id");
--> statement-breakpoint
CREATE FUNCTION reject_local_review_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'local review history is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER capture_triage_suggestion_immutable BEFORE UPDATE OR DELETE ON "capture_triage_suggestion"
FOR EACH ROW EXECUTE FUNCTION reject_local_review_history_mutation();
--> statement-breakpoint
CREATE TRIGGER capture_triage_decision_immutable BEFORE UPDATE OR DELETE ON "capture_triage_decision"
FOR EACH ROW EXECUTE FUNCTION reject_local_review_history_mutation();
--> statement-breakpoint
CREATE TRIGGER work_item_status_event_immutable BEFORE UPDATE OR DELETE ON "work_item_status_event"
FOR EACH ROW EXECUTE FUNCTION reject_local_review_history_mutation();
