CREATE INDEX "automation_run_completed_page_idx" ON "automation_run" USING btree ("completed_at","id");--> statement-breakpoint
CREATE INDEX "automation_run_project_completed_idx" ON "automation_run" USING btree ("project_id","completed_at","id");--> statement-breakpoint
CREATE INDEX "local_agent_run_completed_page_idx" ON "local_agent_run" USING btree ("completed_at","id");--> statement-breakpoint
CREATE INDEX "local_agent_run_project_completed_idx" ON "local_agent_run" USING btree ("project_id","completed_at","id");