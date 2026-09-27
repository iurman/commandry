import { and, desc, eq, sql } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type {
  AutomationEvidenceCheck,
  EvidenceReference,
} from "@commandry/contracts";
import type { CommandryDatabase } from "./client";
import * as schema from "./schema";

const evidenceTables: Record<EvidenceReference["kind"], AnyPgTable> = {
  domain: schema.domain,
  project_domain_link: schema.projectDomainLink,
  system: schema.system,
  system_project_link: schema.systemProjectLink,
  system_domain_link: schema.systemDomainLink,
  system_resource_link: schema.systemResourceLink,
  project: schema.project,
  work_item: schema.workItem,
  work_item_assignment_event: schema.workItemAssignmentEvent,
  work_recurrence_occurrence: schema.workRecurrenceOccurrence,
  work_item_relation: schema.workItemRelation,
  work_item_attachment: schema.workItemAttachment,
  work_item_acceptance_revision: schema.workItemAcceptanceRevision,
  work_item_verification: schema.workItemVerification,
  metric_sample: schema.metricSample,
  knowledge_item: schema.knowledgeItem,
  knowledge_project_link: schema.knowledgeProjectLink,
  work_project_link: schema.workProjectLink,
  decision: schema.projectDecision,
  resource: schema.resource,
  project_resource_link: schema.projectResourceLink,
  event: schema.normalizedEvent,
  alert: schema.alertCondition,
  capture: schema.capture,
};

function record(
  row: typeof schema.automationEvidenceCheck.$inferSelect,
): AutomationEvidenceCheck {
  return {
    id: row.id,
    runId: row.runId,
    status: row.status,
    evidenceCount: row.evidenceCount,
    missing: row.missing as AutomationEvidenceCheck["missing"],
    resultDigest: row.resultDigest,
    actor: "local-user:unattributed",
    checkedAt: row.checkedAt.toISOString(),
    scope: "reference_presence_only",
    isSynthetic: true,
  };
}

export function createAutomationEvidenceRepository(db: CommandryDatabase) {
  return {
    async evidenceExists(reference: Pick<EvidenceReference, "kind" | "id">) {
      const table = evidenceTables[reference.kind];
      const result = await db.execute<{ present: boolean }>(
        sql`select exists(select 1 from ${table} where id = ${reference.id}::uuid) as present`,
      );
      return result.rows[0]?.present === true;
    },
    async recordCheck(input: {
      runId: string;
      status: "complete" | "missing";
      evidenceCount: number;
      missing: AutomationEvidenceCheck["missing"];
      resultDigest: string;
    }) {
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select({ definitionId: schema.automationRun.definitionId })
          .from(schema.automationRun)
          .where(eq(schema.automationRun.id, input.runId))
          .for("update")
          .limit(1);
        if (!run)
          throw new Error("Automation run disappeared during evidence check");
        await tx
          .insert(schema.automationEvidenceCheck)
          .values({ id, ...input });
        await tx.insert(schema.automationAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: run.definitionId,
          runId: input.runId,
          actor: "local-user:unattributed",
          operation: "automation.evidence_checked",
          details: {
            checkId: id,
            status: input.status,
            evidenceCount: input.evidenceCount,
            missingCount: input.missing.length,
          },
        });
      });
      const [saved] = await db
        .select()
        .from(schema.automationEvidenceCheck)
        .where(eq(schema.automationEvidenceCheck.id, id))
        .limit(1);
      if (!saved) throw new Error("Automation evidence check disappeared");
      return record(saved);
    },
    async listChecks(
      runId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const rows = await db
        .select()
        .from(schema.automationEvidenceCheck)
        .where(
          and(
            eq(schema.automationEvidenceCheck.runId, runId),
            query.cursor
              ? sql`(${schema.automationEvidenceCheck.checkedAt}, ${schema.automationEvidenceCheck.id}) < (select checked_at, id from automation_evidence_check where id = ${query.cursor}::uuid and run_id = ${runId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(schema.automationEvidenceCheck.checkedAt),
          desc(schema.automationEvidenceCheck.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(record),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
