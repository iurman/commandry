CREATE TABLE "metric_sample" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"source_envelope_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"value" integer NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_kind" text NOT NULL,
	"source_label" text NOT NULL,
	"is_synthetic" boolean NOT NULL,
	CONSTRAINT "metric_sample_name_nonempty" CHECK (length(trim("metric_sample"."name")) > 0),
	CONSTRAINT "metric_sample_unit_nonempty" CHECK (length(trim("metric_sample"."unit")) > 0),
	CONSTRAINT "metric_sample_source_nonempty" CHECK (length(trim("metric_sample"."source_label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "metric_sample" ADD CONSTRAINT "metric_sample_event_id_normalized_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."normalized_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_sample" ADD CONSTRAINT "metric_sample_source_envelope_id_source_envelope_id_fk" FOREIGN KEY ("source_envelope_id") REFERENCES "public"."source_envelope"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_sample" ADD CONSTRAINT "metric_sample_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_sample" ADD CONSTRAINT "metric_sample_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_sample_event_idx" ON "metric_sample" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "metric_sample_resource_time_idx" ON "metric_sample" USING btree ("resource_id","sampled_at","id");--> statement-breakpoint
CREATE INDEX "metric_sample_project_time_idx" ON "metric_sample" USING btree ("project_id","sampled_at","id");
--> statement-breakpoint
INSERT INTO "metric_sample" (
  "id", "event_id", "source_envelope_id", "project_id", "resource_id",
  "name", "unit", "value", "sampled_at", "recorded_at",
  "source_kind", "source_label", "is_synthetic"
)
SELECT gen_random_uuid(), event."id", event."source_envelope_id",
  event."project_id", event."resource_id", 'external_availability',
  'percent', CASE WHEN event."type" = 'monitor.down' THEN 0 ELSE 100 END,
  event."occurred_at", event."ingested_at", 'synthetic-operations',
  'Synthetic operational fixture', true
FROM "normalized_event" AS event
WHERE event."type" IN ('monitor.down', 'monitor.recovered')
  AND event."resource_id" IS NOT NULL
ON CONFLICT ("event_id") DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION reject_metric_sample_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'metric samples are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER metric_sample_immutable BEFORE UPDATE OR DELETE ON "metric_sample"
FOR EACH ROW EXECUTE FUNCTION reject_metric_sample_mutation();
