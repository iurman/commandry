import { syntheticRunSchema } from "@commandry/contracts";
import type { SyntheticRun } from "@commandry/domain";

export function runResponse(run: SyntheticRun) {
  return syntheticRunSchema.parse({
    id: run.id,
    occurrenceId: run.occurrenceId,
    state: run.state,
    attempts: run.attempts,
    result: run.result,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  });
}
