ALTER TABLE "foundation_client" DROP CONSTRAINT IF EXISTS "foundation_client_operations_valid";
--> statement-breakpoint
ALTER TABLE "foundation_client" ADD CONSTRAINT "foundation_client_operations_valid" CHECK (
  jsonb_typeof("operations") = 'array'
  AND jsonb_array_length("operations") BETWEEN 1 AND 15
  AND "operations" <@ '["foundation.read","work.read","resources.read","work.propose","evidence.record","memory.propose","memory.revise","configuration.record","evaluation.record","improvement.read","improvement.propose","finding.read","finding.propose","onboarding.read","onboarding.propose"]'::jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "foundation_assessment_version_scope_idx"
  ON "foundation_evaluation_assessment" ("id", "version", "project_id");
