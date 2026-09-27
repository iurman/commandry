CREATE TABLE "work_recurrence_audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"definition_id" uuid NOT NULL,
	"occurrence_id" uuid,
	"operation" text NOT NULL,
	"actor" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_recurrence_audit_operation_valid" CHECK ("work_recurrence_audit_event"."operation" in ('work.recurrence.created', 'work.recurrence.updated', 'work.recurrence.occurrence_queued', 'work.recurrence.occurrences_skipped', 'work.recurrence.attempt_started', 'work.recurrence.occurrence_generated', 'work.recurrence.attempt_failed')),
	CONSTRAINT "work_recurrence_audit_actor_valid" CHECK ("work_recurrence_audit_event"."actor" in ('local-user:unattributed', 'system:local-work-scheduler', 'system:local-work-worker'))
);
--> statement-breakpoint
CREATE TABLE "work_recurrence_definition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_work_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"every_minutes" integer NOT NULL,
	"next_occurrence_at" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source_of_truth" text DEFAULT 'local-only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_recurrence_interval_valid" CHECK ("work_recurrence_definition"."every_minutes" between 5 and 10080),
	CONSTRAINT "work_recurrence_source_local" CHECK ("work_recurrence_definition"."source_of_truth" = 'local-only')
);
--> statement-breakpoint
CREATE TABLE "work_recurrence_occurrence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"definition_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"generated_work_item_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "work_recurrence_occurrence_state_valid" CHECK ("work_recurrence_occurrence"."state" in ('queued', 'running', 'generated', 'failed')),
	CONSTRAINT "work_recurrence_occurrence_result_valid" CHECK (("work_recurrence_occurrence"."state" = 'generated' and "work_recurrence_occurrence"."generated_work_item_id" is not null and "work_recurrence_occurrence"."completed_at" is not null) or ("work_recurrence_occurrence"."state" <> 'generated' and "work_recurrence_occurrence"."generated_work_item_id" is null)),
	CONSTRAINT "work_recurrence_occurrence_attempts_valid" CHECK ("work_recurrence_occurrence"."attempts" >= 0)
);
--> statement-breakpoint
DROP INDEX "work_item_source_capture_unique_idx";--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "generated_from_work_item_id" uuid;--> statement-breakpoint
ALTER TABLE "work_recurrence_audit_event" ADD CONSTRAINT "work_recurrence_audit_event_definition_id_work_recurrence_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."work_recurrence_definition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_recurrence_audit_event" ADD CONSTRAINT "work_recurrence_audit_event_occurrence_id_work_recurrence_occurrence_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."work_recurrence_occurrence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_recurrence_definition" ADD CONSTRAINT "work_recurrence_definition_source_work_item_id_work_item_id_fk" FOREIGN KEY ("source_work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_recurrence_definition" ADD CONSTRAINT "work_recurrence_definition_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_recurrence_occurrence" ADD CONSTRAINT "work_recurrence_occurrence_definition_id_work_recurrence_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."work_recurrence_definition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_recurrence_occurrence" ADD CONSTRAINT "work_recurrence_occurrence_generated_work_item_id_work_item_id_fk" FOREIGN KEY ("generated_work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_recurrence_audit_page_idx" ON "work_recurrence_audit_event" USING btree ("definition_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_recurrence_source_unique_idx" ON "work_recurrence_definition" USING btree ("source_work_item_id");--> statement-breakpoint
CREATE INDEX "work_recurrence_due_idx" ON "work_recurrence_definition" USING btree ("enabled","next_occurrence_at");--> statement-breakpoint
CREATE INDEX "work_recurrence_project_idx" ON "work_recurrence_definition" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_recurrence_occurrence_due_idx" ON "work_recurrence_occurrence" USING btree ("definition_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "work_recurrence_occurrence_work_idx" ON "work_recurrence_occurrence" USING btree ("generated_work_item_id");--> statement-breakpoint
CREATE INDEX "work_recurrence_occurrence_page_idx" ON "work_recurrence_occurrence" USING btree ("definition_id","scheduled_for","id");--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_generated_from_work_item_id_work_item_id_fk" FOREIGN KEY ("generated_from_work_item_id") REFERENCES "public"."work_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_generated_from_idx" ON "work_item" USING btree ("generated_from_work_item_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_source_capture_unique_idx" ON "work_item" USING btree ("source_capture_id") WHERE "work_item"."generated_from_work_item_id" is null;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_not_generated_from_self" CHECK ("work_item"."generated_from_work_item_id" is null or "work_item"."generated_from_work_item_id" <> "work_item"."id");
--> statement-breakpoint
CREATE FUNCTION protect_work_recurrence_definition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recurring Work definitions retain their history' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM work_item source
      WHERE source.id = NEW.source_work_item_id
        AND source.project_id = NEW.project_id
        AND source.work_type = 'task'
        AND source.generated_from_work_item_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Recurring Work requires an original task in its primary project' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.source_work_item_id IS DISTINCT FROM OLD.source_work_item_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.source_of_truth IS DISTINCT FROM OLD.source_of_truth
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Recurring Work source and identity are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_recurrence_definition_protected BEFORE INSERT OR UPDATE OR DELETE ON "work_recurrence_definition"
FOR EACH ROW EXECUTE FUNCTION protect_work_recurrence_definition();
--> statement-breakpoint
CREATE FUNCTION protect_work_recurrence_occurrence() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recurring Work occurrences retain their history' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
     OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.state = 'generated' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Recurring Work occurrence identity and result are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_recurrence_occurrence_protected BEFORE UPDATE OR DELETE ON "work_recurrence_occurrence"
FOR EACH ROW EXECUTE FUNCTION protect_work_recurrence_occurrence();
--> statement-breakpoint
CREATE FUNCTION reject_work_recurrence_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Recurring Work audit history is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_recurrence_audit_immutable BEFORE UPDATE OR DELETE ON "work_recurrence_audit_event"
FOR EACH ROW EXECUTE FUNCTION reject_work_recurrence_audit_change();
--> statement-breakpoint
CREATE FUNCTION protect_generated_work_source() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.generated_from_work_item_id IS NOT NULL THEN
      PERFORM 1 FROM work_item source
        WHERE source.id = NEW.generated_from_work_item_id
          AND source.project_id = NEW.project_id
          AND source.source_capture_id = NEW.source_capture_id
          AND source.work_type = 'task'
          AND source.generated_from_work_item_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Generated Work must keep its original task, project, and capture' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.generated_from_work_item_id IS DISTINCT FROM OLD.generated_from_work_item_id THEN
    RAISE EXCEPTION 'Generated Work source is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER generated_work_source_immutable BEFORE INSERT OR UPDATE ON "work_item"
FOR EACH ROW EXECUTE FUNCTION protect_generated_work_source();
