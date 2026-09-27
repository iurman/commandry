ALTER TABLE "local_agent_run" DROP CONSTRAINT "local_agent_run_state_valid";--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" DROP CONSTRAINT "local_agent_run_attempt_state_valid";--> statement-breakpoint
ALTER TABLE "local_agent_run" ADD CONSTRAINT "local_agent_run_state_valid" CHECK ("local_agent_run"."state" in ('queued', 'running', 'succeeded', 'failed', 'canceled'));--> statement-breakpoint
ALTER TABLE "local_agent_run_attempt" ADD CONSTRAINT "local_agent_run_attempt_state_valid" CHECK ("local_agent_run_attempt"."state" in ('running', 'succeeded', 'failed', 'canceled'));