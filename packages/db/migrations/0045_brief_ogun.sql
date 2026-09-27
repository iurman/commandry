ALTER TABLE "capture" DROP CONSTRAINT "capture_source_manual";--> statement-breakpoint
ALTER TABLE "capture" DROP CONSTRAINT "capture_author_local";--> statement-breakpoint
ALTER TABLE "automation_definition" ADD COLUMN "local_action_kind" text;--> statement-breakpoint
ALTER TABLE "automation_definition" ADD COLUMN "capability_reference" text;--> statement-breakpoint
ALTER TABLE "automation_definition" ADD CONSTRAINT "automation_definition_local_action_valid" CHECK (("automation_definition"."local_action_kind" is null and "automation_definition"."capability_reference" is null) or ("automation_definition"."local_action_kind" = 'create_project_note' and "automation_definition"."capability_reference" = 'commandry.project.knowledge.create'));--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_source_valid" CHECK ("capture"."source" in ('manual-local', 'automation-local-synthetic'));--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_author_valid" CHECK (("capture"."source" = 'manual-local' and "capture"."author" = 'local-user') or ("capture"."source" = 'automation-local-synthetic' and "capture"."author" = 'system:local-automation-worker'));