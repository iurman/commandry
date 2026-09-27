import { createHash } from "node:crypto";
import type {
  AutomationEvidenceCheck,
  AutomationRun,
  AutomationDefinition,
  EvidenceReference,
} from "@commandry/contracts";
import { LocalAutomationError } from "@commandry/domain";

type PageQuery = { limit: number; cursor?: string | undefined };

export interface AutomationReviewPort {
  getRun(id: string): Promise<AutomationRun | null>;
  getDefinition(id: string): Promise<AutomationDefinition | null>;
  listRuns(
    definitionId: string,
    query: PageQuery,
  ): Promise<{ items: AutomationRun[]; nextCursor: string | null }>;
  evidenceExists(
    reference: Pick<EvidenceReference, "kind" | "id">,
  ): Promise<boolean>;
  recordCheck(input: {
    runId: string;
    status: "complete" | "missing";
    evidenceCount: number;
    missing: AutomationEvidenceCheck["missing"];
    resultDigest: string;
  }): Promise<AutomationEvidenceCheck>;
  listChecks(
    runId: string,
    query: PageQuery,
  ): Promise<{ items: AutomationEvidenceCheck[]; nextCursor: string | null }>;
}

export function createAutomationReviewService(port: AutomationReviewPort) {
  return {
    async checkEvidence(runId: string) {
      const run = await port.getRun(runId);
      if (!run)
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_FOUND",
          "Automation run not found",
        );
      if (run.state !== "succeeded" || !run.result) {
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_READY",
          "Wait for a completed local result before checking its evidence",
        );
      }
      const missing: AutomationEvidenceCheck["missing"] = [];
      for (const reference of run.result.evidence) {
        if (!(await port.evidenceExists(reference)))
          missing.push({ kind: reference.kind, id: reference.id });
      }
      const resultDigest = createHash("sha256")
        .update(JSON.stringify(run.result))
        .digest("hex");
      return port.recordCheck({
        runId,
        status: missing.length ? "missing" : "complete",
        evidenceCount: run.result.evidence.length,
        missing,
        resultDigest,
      });
    },
    async listChecks(runId: string, query: PageQuery) {
      if (!(await port.getRun(runId)))
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_FOUND",
          "Automation run not found",
        );
      return port.listChecks(runId, query);
    },
    async exportPage(definitionId: string, query: PageQuery) {
      const definition = await port.getDefinition(definitionId);
      if (!definition)
        throw new LocalAutomationError(
          "AUTOMATION_NOT_FOUND",
          "Automation not found",
        );
      const page = await port.listRuns(definitionId, query);
      return {
        exportVersion: 1 as const,
        sourceOfTruth: "local-only" as const,
        isSynthetic: true as const,
        exportedAt: new Date().toISOString(),
        definition,
        runs: page.items,
        nextCursor: page.nextCursor,
      };
    },
  };
}
