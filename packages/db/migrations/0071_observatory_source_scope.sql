-- Existing sources without a reviewed project remain owner-visible but cannot
-- be polled or returned through a project-scoped client until explicitly bound.
ALTER TABLE observatory_source ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES project(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE observatory_source ADD COLUMN IF NOT EXISTS environment text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observatory_source_project ON observatory_source(project_id,resource_id,id);
