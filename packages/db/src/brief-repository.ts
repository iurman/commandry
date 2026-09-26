import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  projectResourceRelationship,
  SYNTHETIC_MONITOR_RULE_ID,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  alertCondition,
  alertEvidence,
  knowledgeItem,
  normalizedEvent,
  project,
  projectDecision,
  projectResourceLink,
  resource,
  workItem,
} from "./schema";

type SourceLabel =
  "Synthetic development fixture" | "Synthetic operational fixture";

function page<T, R>(
  rows: R[],
  limit: number,
  map: (row: R) => T,
  cursor: (row: R) => string,
) {
  const visible = rows.slice(0, limit);
  return {
    items: visible.map(map),
    nextCursor:
      rows.length > limit && visible.length > 0
        ? cursor(visible[visible.length - 1]!)
        : null,
  };
}

export function createBriefRepository(db: CommandryDatabase) {
  return {
    async readProjectSnapshot(projectId: string, query: { limit: number }) {
      if (
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 100
      ) {
        throw new Error("Brief section limit must be between 1 and 100");
      }
      return db.transaction(
        async (tx) => {
          await tx.execute(sql`set transaction read only`);
          const [currentProject] = await tx
            .select({
              record: project,
              asOf: sql<string>`transaction_timestamp()`,
            })
            .from(project)
            .where(eq(project.id, projectId))
            .limit(1);
          if (!currentProject) return null;

          const openWorkRows = await tx
            .select()
            .from(workItem)
            .where(
              and(
                eq(workItem.projectId, projectId),
                eq(workItem.status, "open"),
              ),
            )
            .orderBy(desc(workItem.createdAt), desc(workItem.id))
            .limit(query.limit + 1);
          const noteRows = await tx
            .select()
            .from(knowledgeItem)
            .where(eq(knowledgeItem.projectId, projectId))
            .orderBy(desc(knowledgeItem.createdAt), desc(knowledgeItem.id))
            .limit(query.limit + 1);
          const decisionRows = await tx
            .select()
            .from(projectDecision)
            .where(eq(projectDecision.projectId, projectId))
            .orderBy(desc(projectDecision.updatedAt), desc(projectDecision.id))
            .limit(query.limit + 1);
          const linkRows = await tx
            .select({ link: projectResourceLink, linkedResource: resource })
            .from(projectResourceLink)
            .innerJoin(
              resource,
              eq(projectResourceLink.resourceId, resource.id),
            )
            .where(
              and(
                eq(projectResourceLink.projectId, projectId),
                eq(projectResourceLink.lifecycle, "active"),
              ),
            )
            .orderBy(projectResourceLink.id)
            .limit(query.limit + 1);
          const eventRows = await tx
            .select()
            .from(normalizedEvent)
            .where(eq(normalizedEvent.projectId, projectId))
            .orderBy(desc(normalizedEvent.occurredAt), desc(normalizedEvent.id))
            .limit(query.limit + 1);
          const alertRows = await tx
            .select()
            .from(alertCondition)
            .where(
              and(
                eq(alertCondition.projectId, projectId),
                eq(alertCondition.state, "open"),
              ),
            )
            .orderBy(desc(alertCondition.updatedAt), desc(alertCondition.id))
            .limit(query.limit + 1);

          const visibleEventIds = eventRows
            .slice(0, query.limit)
            .map((event) => event.id);
          const visibleAlertIds = alertRows
            .slice(0, query.limit)
            .map((alert) => alert.id);
          const eventLinks =
            visibleEventIds.length > 0
              ? await tx
                  .select({
                    eventId: alertEvidence.eventId,
                    alertId: alertEvidence.alertId,
                  })
                  .from(alertEvidence)
                  .where(inArray(alertEvidence.eventId, visibleEventIds))
              : [];
          const alertEvidenceRows =
            visibleAlertIds.length > 0
              ? await tx
                  .select({
                    eventId: alertEvidence.eventId,
                    alertId: alertEvidence.alertId,
                  })
                  .from(alertEvidence)
                  .where(inArray(alertEvidence.alertId, visibleAlertIds))
                  .orderBy(alertEvidence.createdAt, alertEvidence.eventId)
              : [];
          const eventAlertIds = new Map(
            eventLinks.map((link) => [link.eventId, link.alertId]),
          );
          const evidenceByAlert = new Map<string, string[]>();
          for (const evidence of alertEvidenceRows) {
            const ids = evidenceByAlert.get(evidence.alertId) ?? [];
            ids.push(evidence.eventId);
            evidenceByAlert.set(evidence.alertId, ids);
          }

          return {
            asOf: new Date(currentProject.asOf).toISOString(),
            project: {
              id: currentProject.record.id,
              name: currentProject.record.name,
              summary: currentProject.record.summary,
              type: currentProject.record.type,
              lifecycle: currentProject.record.lifecycle,
              createdAt: currentProject.record.createdAt.toISOString(),
              updatedAt: currentProject.record.updatedAt.toISOString(),
            },
            work: page(
              openWorkRows,
              query.limit,
              (row) => ({
                id: row.id,
                projectId: row.projectId,
                sourceCaptureId: row.sourceCaptureId,
                title: row.title,
                description: row.description,
                status: row.status,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              }),
              (row) => row.id,
            ),
            knowledge: page(
              noteRows,
              query.limit,
              (row) => ({
                id: row.id,
                projectId: row.projectId,
                sourceCaptureId: row.sourceCaptureId,
                kind: "note" as const,
                title: row.title,
                content: row.content,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              }),
              (row) => row.id,
            ),
            decisions: page(
              decisionRows,
              query.limit,
              (row) => ({
                id: row.id,
                projectId: row.projectId,
                question: row.question,
                outcome: row.outcome,
                alternatives: row.alternatives,
                rationale: row.rationale,
                status: row.status,
                revision: row.revision,
                sourceLabel: "Manual local decision" as const,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              }),
              (row) => row.id,
            ),
            resources: page(
              linkRows,
              query.limit,
              ({ link, linkedResource }) => ({
                link: {
                  id: link.id,
                  type: link.type,
                  inverseType: projectResourceRelationship(link.type)
                    .inverseType,
                  resource: {
                    id: linkedResource.id,
                    kind: linkedResource.kind,
                    name: linkedResource.name,
                    subtype: linkedResource.subtype,
                    parentResourceId: linkedResource.parentResourceId,
                    state: linkedResource.state,
                    externalUrl: linkedResource.externalUrl,
                    lastObservedAt:
                      linkedResource.lastObservedAt?.toISOString() ?? null,
                  },
                },
                linkedAt: link.createdAt.toISOString(),
              }),
              (row) => row.link.id,
            ),
            events: page(
              eventRows,
              query.limit,
              (row) => ({
                id: row.id,
                type: row.type,
                summary: row.summary,
                severity: row.severity,
                projectId: row.projectId,
                resourceId: row.resourceId,
                occurredAt: row.occurredAt.toISOString(),
                ingestedAt: row.ingestedAt.toISOString(),
                sourceEnvelopeId: row.sourceEnvelopeId,
                sourceKind: row.sourceKind,
                sourceLabel: row.sourceLabel as SourceLabel,
                isSynthetic: true as const,
                processingVersion: "synthetic-projection/v1" as const,
                alertId: eventAlertIds.get(row.id) ?? null,
                evidenceHref: `/api/v1/source-envelopes/${row.sourceEnvelopeId}`,
              }),
              (row) => row.id,
            ),
            attention: page(
              alertRows,
              query.limit,
              (row) => ({
                id: row.id,
                state: row.state,
                severity: "critical" as const,
                ruleId: SYNTHETIC_MONITOR_RULE_ID,
                reason: row.reason,
                projectId: row.projectId,
                resourceId: row.resourceId,
                firstObservedAt: row.firstObservedAt.toISOString(),
                lastObservedAt: row.lastObservedAt.toISOString(),
                recordedAt: row.updatedAt.toISOString(),
                resolvedAt: row.resolvedAt?.toISOString() ?? null,
                lastEventId: row.lastEventId,
                evidenceEventIds: evidenceByAlert.get(row.id) ?? [],
                sourceKind: "synthetic-operations" as const,
                sourceLabel: "Synthetic operational fixture" as const,
                isSynthetic: true as const,
              }),
              (row) => row.id,
            ),
          };
        },
        { isolationLevel: "repeatable read" },
      );
    },
  };
}
