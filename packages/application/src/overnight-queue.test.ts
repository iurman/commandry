import { describe, expect, it, vi } from "vitest";
import type { OvernightQueueEntry } from "@commandry/contracts";
import { OvernightQueueError } from "@commandry/domain";
import {
  createOvernightQueueProcessor,
  createOvernightQueueService,
  overnightReadiness,
} from "./overnight-queue";

const packetId = "80e11145-dbbc-4582-9cc4-28e4f90282bd";
const agentId = "c231ee35-32e7-4f08-a2ee-44daee67fe49";
const entryId = "28e7e5bc-36e1-4d6b-9c76-f1a91674fefe";
const runId = "600386c2-281f-48a5-9194-49e3ec9a2118";

function entry(
  state: OvernightQueueEntry["state"] = "scheduled",
): OvernightQueueEntry {
  return {
    id: entryId,
    packetId,
    packetVersion: 1,
    packetDigest: "a".repeat(64),
    projectId: "e40e907c-19cc-4f25-a6df-408251388fbd",
    projectName: "Project",
    workItemId: "4d2d044e-7a95-4dc5-a65e-8328a7795c6c",
    workTitle: "Work",
    agentId,
    agentName: "Fake agent",
    runAfter: new Date(Date.now() - 1000).toISOString(),
    state,
    runId: null,
    runState: null,
    blockedReason: null,
    sourceLabel: "Synthetic local overnight queue",
    isSynthetic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const ready = {
  packetExists: true,
  packetWorkOpen: true,
  packetWorkUnblocked: true,
  agentExists: true,
  agentAssigned: true,
};

describe("synthetic overnight queue", () => {
  it("explains missing readiness and bounds the configurable future horizon", async () => {
    const schedule = vi.fn(async () => entry());
    const service = createOvernightQueueService(
      {
        getContext: async () => ({ ...ready, agentAssigned: false }),
        schedule,
        getById: async () => null,
        list: async () => ({ items: [], nextCursor: null }),
        listAudit: async () => ({ items: [], nextCursor: null }),
        cancel: async () => entry("canceled"),
      },
      7,
    );
    const decision = await service.readiness(packetId, agentId);
    expect(decision.ready).toBe(false);
    expect(
      decision.checks.find((check) => check.key === "assignment")?.ok,
    ).toBe(false);
    expect(decision.warnings).toContain(
      "Only a synthetic, read-only local run will occur. Its result is unverified and no external action will occur.",
    );
    await expect(
      service.schedule({
        packetId,
        agentId,
        runAfter: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" });
    await expect(
      service.schedule({
        packetId,
        agentId,
        runAfter: new Date(Date.now() + 8 * 86_400_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(OvernightQueueError);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("dispatches only due ready entries with a stable occurrence and skips terminal states", async () => {
    const claimForDispatch = vi.fn(async () => true);
    const markDispatched = vi.fn(async () => undefined);
    const submitRun = vi.fn(async () => ({ id: runId }));
    let current = entry();
    const processor = createOvernightQueueProcessor(
      {
        getById: async () => current,
        getContext: async () => ready,
        claimForDispatch,
        markBlocked: async () => undefined,
        markDispatched,
      },
      submitRun,
    );
    await processor(entryId);
    expect(claimForDispatch).toHaveBeenCalledOnce();
    expect(submitRun).toHaveBeenCalledWith(packetId, {
      agentId,
      occurrenceId: `overnight:${entryId}`,
    });
    expect(markDispatched).toHaveBeenCalledWith(entryId, runId);
    current = entry("canceled");
    await processor(entryId);
    expect(submitRun).toHaveBeenCalledOnce();
    current = {
      ...entry(),
      runAfter: new Date(Date.now() + 60_000).toISOString(),
    };
    await expect(processor(entryId)).rejects.toThrow(/not due/);
  });

  it("blocks changed work instead of granting a run", async () => {
    const markBlocked = vi.fn(async () => undefined);
    const submitRun = vi.fn(async () => ({ id: runId }));
    const processor = createOvernightQueueProcessor(
      {
        getById: async () => entry(),
        getContext: async () => ({ ...ready, packetWorkOpen: false }),
        claimForDispatch: async () => true,
        markBlocked,
        markDispatched: async () => undefined,
      },
      submitRun,
    );
    await processor(entryId);
    expect(markBlocked).toHaveBeenCalledWith(
      entryId,
      "Packet work is done or missing",
    );
    expect(submitRun).not.toHaveBeenCalled();
    expect(overnightReadiness(ready).ready).toBe(true);
    const blocked = overnightReadiness({
      ...ready,
      packetWorkUnblocked: false,
    });
    expect(blocked.ready).toBe(false);
    expect(
      blocked.checks.find((check) => check.key === "blockers")?.message,
    ).toBe("An active open task blocks this work");
  });

  it("blocks a due entry when an open task becomes a blocker after scheduling", async () => {
    const markBlocked = vi.fn(async () => undefined);
    const submitRun = vi.fn(async () => ({ id: runId }));
    const processor = createOvernightQueueProcessor(
      {
        getById: async () => entry(),
        getContext: async () => ({ ...ready, packetWorkUnblocked: false }),
        claimForDispatch: async () => true,
        markBlocked,
        markDispatched: async () => undefined,
      },
      submitRun,
    );
    await processor(entryId);
    expect(markBlocked).toHaveBeenCalledWith(
      entryId,
      "An active open task blocks this work",
    );
    expect(submitRun).not.toHaveBeenCalled();
  });
});
