import { describe, expect, it } from "vitest";
import {
  createSyntheticRunProcessor,
  createSyntheticRunService,
  type SyntheticRunProcessing,
} from "./synthetic-runs.js";
import type { SyntheticRun } from "@commandry/domain";

const run: SyntheticRun = {
  id: "48401dbc-26ee-4c68-b7f5-e5360b504dc0",
  occurrenceId: "synthetic:v1:test",
  state: "queued",
  attempts: 0,
  result: null,
  error: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  startedAt: null,
  completedAt: null,
};

describe("synthetic run application", () => {
  it("passes a stable occurrence ID to transactional submission", async () => {
    const submitted: string[] = [];
    const service = createSyntheticRunService({
      submitOnce: async (occurrenceId) => {
        submitted.push(occurrenceId);
        return run;
      },
      getById: async () => run,
    });
    await service.submit(" test ");
    expect(submitted).toEqual(["synthetic:v1:test"]);
  });

  it("records an attempt failure and rethrows for queue retry", async () => {
    let failures = 0;
    const port: SyntheticRunProcessing = {
      getById: async () => run,
      beginAttempt: async () => "attempt-1",
      completeAttempt: async () => run,
      failAttempt: async () => {
        failures += 1;
      },
    };
    const process = createSyntheticRunProcessor(port, () => {
      throw new Error("injected");
    });
    await expect(
      process({ version: 1, runId: run.id, occurrenceId: run.occurrenceId }),
    ).rejects.toThrow("injected");
    expect(failures).toBe(1);
  });
});
