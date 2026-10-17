-- A successful source read may truthfully contain no actual measurement.
ALTER TABLE observatory_observation ALTER COLUMN observed_at DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE observatory_observation ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES project(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE observatory_observation ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES resource(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE observatory_observation ADD COLUMN IF NOT EXISTS source_version integer;
--> statement-breakpoint
ALTER TABLE observatory_observation ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
