import { describe, expect, it, vi } from "vitest";
import type {
  AutomationDefinition,
  AutomationEvidenceCheck,
  AutomationRun,
} from "@commandry/contracts";
import {
  createAutomationReviewService,
  type AutomationReviewPort,
} from "./automation-review";

const evidence = {
  kind: "project" as const,
  id: "11111111-1111-4111-8111-111111111111",
  href: "/api/v1/projects/11111111-1111-4111-8111-111111111111",
  recordedAt: "2026-09-27T10:00:00.000Z",
  occurredAt: null,
  sourceLabel: "Local project",
  isSynthetic: false,
};
const run = {
  id: "22222222-2222-4222-8222-222222222222",
  definitionId: "33333333-3333-4333-8333-333333333333",
  projectId: evidence.id,
  state: "succeeded",
  result: {
    summary: "Synthetic local brief preview",
    asOf: "2026-09-27T10:00:00.000Z",
    evidence: [evidence],
    sourceLabel: "Synthetic local automation",
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
  },
} as AutomationRun;
const definition = {
  id: run.definitionId,
  sourceOfTruth: "local-only",
} as AutomationDefinition;

function fakePort(overrides: Partial<AutomationReviewPort> = {}) {
  const recordCheck = vi.fn(
    async (input: Parameters<AutomationReviewPort["recordCheck"]>[0]) =>
      ({
        ...input,
        id: "44444444-4444-4444-8444-444444444444",
        actor: "local-user:unattributed",
        checkedAt: "2026-09-27T10:00:00.000Z",
        scope: "reference_presence_only",
        isSynthetic: true,
      }) as AutomationEvidenceCheck,
  );
  const port = {
    getRun: vi.fn(async () => run),
    getDefinition: vi.fn(async () => definition),
    listRuns: vi.fn(async () => ({ items: [run], nextCursor: null })),
    evidenceExists: vi.fn(async () => true),
    recordCheck,
    listChecks: vi.fn(async () => ({ items: [], nextCursor: null })),
    ...overrides,
  };
  return { port, recordCheck };
}

describe("local automation evidence review", () => {
  it("records presence without upgrading the synthetic result to verified", async () => {
    const { port, recordCheck } = fakePort();
    const checked = await createAutomationReviewService(port).checkEvidence(
      run.id,
    );
    expect(checked.status).toBe("complete");
    expect(checked.scope).toBe("reference_presence_only");
    expect(recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceCount: 1,
        missing: [],
        status: "complete",
      }),
    );
    expect(run.result?.verificationStatus).toBe("unverified");
  });

  it("reports missing references and refuses a run without a completed result", async () => {
    const missing = fakePort({ evidenceExists: vi.fn(async () => false) });
    const checked = await createAutomationReviewService(
      missing.port,
    ).checkEvidence(run.id);
    expect(checked.missing).toEqual([{ kind: evidence.kind, id: evidence.id }]);
    const queued = fakePort({
      getRun: vi.fn(
        async () =>
          ({ ...run, state: "queued", result: null }) as AutomationRun,
      ),
    });
    await expect(
      createAutomationReviewService(queued.port).checkEvidence(run.id),
    ).rejects.toMatchObject({ code: "AUTOMATION_RUN_NOT_READY" });
    expect(queued.recordCheck).not.toHaveBeenCalled();
  });

  it("exports a definition and a continuation page of exact persisted runs", async () => {
    const { port } = fakePort();
    const page = await createAutomationReviewService(port).exportPage(
      definition.id,
      { limit: 20 },
    );
    expect(page.definition).toBe(definition);
    expect(page.runs).toEqual([run]);
    expect(page.nextCursor).toBeNull();
    expect(page.isSynthetic).toBe(true);
  });
});
