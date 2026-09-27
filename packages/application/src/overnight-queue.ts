import {
  overnightQueueEntrySchema,
  listOvernightQueueAuditResponseSchema,
  overnightReadinessSchema,
  type CreateOvernightQueueEntryRequest,
  type OvernightQueueEntry,
  type OvernightReadiness,
} from "@commandry/contracts";
import {
  OvernightQueueError,
  validateOvernightRunAfter,
} from "@commandry/domain";

export interface OvernightQueuePort {
  getContext(
    packetId: string,
    agentId: string,
  ): Promise<{
    packetExists: boolean;
    packetWorkOpen: boolean;
    packetWorkUnblocked: boolean;
    agentExists: boolean;
    agentAssigned: boolean;
  }>;
  schedule(
    input: CreateOvernightQueueEntryRequest,
    runAfter: Date,
  ): Promise<OvernightQueueEntry>;
  getById(id: string): Promise<OvernightQueueEntry | null>;
  list(query: {
    limit: number;
    cursor?: string | undefined;
    projectId?: string | undefined;
  }): Promise<{ items: OvernightQueueEntry[]; nextCursor: string | null }>;
  cancel(id: string): Promise<OvernightQueueEntry>;
  listAudit(
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

export function overnightReadiness(
  context: Awaited<ReturnType<OvernightQueuePort["getContext"]>>,
): OvernightReadiness {
  const checks = [
    {
      key: "packet",
      ok: context.packetExists,
      message: context.packetExists
        ? "Saved execution packet exists"
        : "Saved execution packet is missing",
    },
    {
      key: "work",
      ok: context.packetWorkOpen,
      message: context.packetWorkOpen
        ? "Packet work is open"
        : "Packet work is done or missing",
    },
    {
      key: "blockers",
      ok: context.packetWorkUnblocked,
      message: context.packetWorkUnblocked
        ? "No active open task blocks this work"
        : "An active open task blocks this work",
    },
    {
      key: "agent",
      ok: context.agentExists,
      message: context.agentExists
        ? "Synthetic local agent exists"
        : "Synthetic local agent is missing",
    },
    {
      key: "assignment",
      ok: context.agentAssigned,
      message: context.agentAssigned
        ? "Agent is assigned to the packet project"
        : "Agent is not assigned to the packet project",
    },
  ];
  return overnightReadinessSchema.parse({
    ready: checks.every((check) => check.ok),
    checks,
    warnings: [
      "The saved packet does not record acceptance criteria or verification expectations.",
      "Only a synthetic, read-only local run will occur. Its result is unverified and no external action will occur.",
    ],
    sourceLabel: "Synthetic local overnight queue",
  });
}

export function createOvernightQueueService(
  port: OvernightQueuePort,
  maxDays: number,
) {
  return {
    async readiness(packetId: string, agentId: string) {
      return overnightReadiness(await port.getContext(packetId, agentId));
    },
    async schedule(input: CreateOvernightQueueEntryRequest) {
      const runAfter = validateOvernightRunAfter(
        input.runAfter,
        new Date(),
        maxDays,
      );
      const readiness = await this.readiness(input.packetId, input.agentId);
      if (!readiness.ready)
        throw new OvernightQueueError(
          "NOT_READY",
          readiness.checks
            .filter((check) => !check.ok)
            .map((check) => check.message)
            .join("; "),
        );
      return overnightQueueEntrySchema.parse(
        await port.schedule(input, runAfter),
      );
    },
    async getById(id: string) {
      const entry = await port.getById(id);
      return entry ? overnightQueueEntrySchema.parse(entry) : null;
    },
    async list(query: {
      limit: number;
      cursor?: string | undefined;
      projectId?: string | undefined;
    }) {
      const page = await port.list(query);
      return {
        items: page.items.map((entry) =>
          overnightQueueEntrySchema.parse(entry),
        ),
        nextCursor: page.nextCursor,
      };
    },
    async cancel(id: string) {
      return overnightQueueEntrySchema.parse(await port.cancel(id));
    },
    async listAudit(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      return listOvernightQueueAuditResponseSchema.parse(
        await port.listAudit(id, query),
      );
    },
  };
}

export interface OvernightDispatchPort {
  getById(id: string): Promise<OvernightQueueEntry | null>;
  getContext(
    packetId: string,
    agentId: string,
  ): ReturnType<OvernightQueuePort["getContext"]>;
  claimForDispatch(id: string): Promise<boolean>;
  markBlocked(id: string, reason: string): Promise<void>;
  markDispatched(id: string, runId: string): Promise<void>;
}

export function createOvernightQueueProcessor(
  port: OvernightDispatchPort,
  submitRun: (
    packetId: string,
    input: { agentId: string; occurrenceId: string },
  ) => Promise<{ id: string }>,
) {
  return async (entryId: string): Promise<void> => {
    const entry = await port.getById(entryId);
    if (!entry || ["canceled", "blocked", "dispatched"].includes(entry.state))
      return;
    if (Date.parse(entry.runAfter) > Date.now())
      throw new Error("Overnight entry is not due yet");
    if (entry.state === "scheduled" && !(await port.claimForDispatch(entryId)))
      return;
    const readiness = overnightReadiness(
      await port.getContext(entry.packetId, entry.agentId),
    );
    if (!readiness.ready) {
      await port.markBlocked(
        entryId,
        readiness.checks
          .filter((check) => !check.ok)
          .map((check) => check.message)
          .join("; "),
      );
      return;
    }
    try {
      const run = await submitRun(entry.packetId, {
        agentId: entry.agentId,
        occurrenceId: `overnight:${entryId}`,
      });
      await port.markDispatched(entryId, run.id);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        ["PACKET_NOT_FOUND", "AGENT_NOT_FOUND", "AGENT_NOT_ASSIGNED"].includes(
          String(error.code),
        )
      ) {
        await port.markBlocked(entryId, error.message);
        return;
      }
      throw error;
    }
  };
}
