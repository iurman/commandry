import {
  syntheticJobV1Schema,
  type SyntheticJobV1,
} from "@commandry/contracts";
import {
  syntheticOccurrenceId,
  syntheticResult,
  type SyntheticRun,
} from "@commandry/domain";

export interface SyntheticRunSubmission {
  submitOnce(occurrenceId: string): Promise<SyntheticRun>;
  getById(id: string): Promise<SyntheticRun | null>;
}

export interface SyntheticRunProcessing {
  getById(id: string): Promise<SyntheticRun | null>;
  beginAttempt(id: string): Promise<string | null>;
  completeAttempt(
    id: string,
    attemptId: string,
    result: string,
  ): Promise<SyntheticRun>;
  failAttempt(id: string, attemptId: string): Promise<void>;
}

export function createSyntheticRunService(port: SyntheticRunSubmission) {
  return {
    submit: (idempotencyKey: string) =>
      port.submitOnce(syntheticOccurrenceId(idempotencyKey)),
    getById: (id: string) => port.getById(id),
  };
}

export function createSyntheticRunProcessor(
  port: SyntheticRunProcessing,
  effect: (occurrenceId: string) => string | Promise<string> = syntheticResult,
) {
  return async (input: SyntheticJobV1): Promise<SyntheticRun> => {
    const job = syntheticJobV1Schema.parse(input);
    const run = await port.getById(job.runId);
    if (!run || run.occurrenceId !== job.occurrenceId) {
      throw new Error("Synthetic job does not match a product run");
    }

    const attemptId = await port.beginAttempt(run.id);
    if (attemptId === null) {
      const finished = await port.getById(run.id);
      if (!finished) throw new Error("Synthetic run disappeared");
      return finished;
    }

    try {
      const result = await effect(run.occurrenceId);
      return await port.completeAttempt(run.id, attemptId, result);
    } catch (error) {
      await port.failAttempt(run.id, attemptId);
      throw error;
    }
  };
}
