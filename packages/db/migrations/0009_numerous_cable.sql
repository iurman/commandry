CREATE TABLE "project_decision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"question" text NOT NULL,
	"outcome" text NOT NULL,
	"alternatives" text DEFAULT '' NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_label" text DEFAULT 'Manual local decision' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_decision_question_nonempty" CHECK (length(trim("project_decision"."question")) > 0),
	CONSTRAINT "project_decision_outcome_nonempty" CHECK (length(trim("project_decision"."outcome")) > 0),
	CONSTRAINT "project_decision_rationale_nonempty" CHECK (length(trim("project_decision"."rationale")) > 0),
	CONSTRAINT "project_decision_revision_positive" CHECK ("project_decision"."revision" > 0),
	CONSTRAINT "project_decision_source_local" CHECK ("project_decision"."source_label" = 'Manual local decision'),
	CONSTRAINT "project_decision_status_valid" CHECK ("project_decision"."status" in ('proposed', 'accepted', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "project_decision_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"decision_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"question" text NOT NULL,
	"outcome" text NOT NULL,
	"alternatives" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text NOT NULL,
	"actor" text DEFAULT 'local-user:unattributed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_decision_revision_positive" CHECK ("project_decision_revision"."revision" > 0),
	CONSTRAINT "project_decision_revision_actor_local" CHECK ("project_decision_revision"."actor" = 'local-user:unattributed')
);
--> statement-breakpoint
ALTER TABLE "project_decision" ADD CONSTRAINT "project_decision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decision_revision" ADD CONSTRAINT "project_decision_revision_decision_id_project_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."project_decision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_decision_project_page_idx" ON "project_decision" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "project_decision_search_idx" ON "project_decision" USING gin (to_tsvector('simple', "question" || ' ' || "outcome" || ' ' || "rationale"));--> statement-breakpoint
CREATE UNIQUE INDEX "project_decision_revision_unique_idx" ON "project_decision_revision" USING btree ("decision_id","revision");
--> statement-breakpoint
CREATE FUNCTION reject_project_decision_revision_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Project decision revisions are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_decision_revision_immutable
BEFORE UPDATE OR DELETE ON project_decision_revision
FOR EACH ROW EXECUTE FUNCTION reject_project_decision_revision_change();
