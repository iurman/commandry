import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  projectResourceRelationship,
  SYNTHETIC_MONITOR_RULE_ID,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  alertCondition,
  alertEvidence,
  domain,
  knowledgeItem,
  knowledgeProjectLink,
  normalizedEvent,
  project,
  projectDecision,
  projectDomainLink,
  projectResourceLink,
  resource,
  system,
  systemProjectLink,
  workItem,
  workItemAttachment,
  workItemAcceptance,
  workItemAcceptanceRevision,
  workItemRelation,
  workItemVerification,
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
          const [ownedDomain] = await tx
            .select({ link: projectDomainLink, owner: domain })
            .from(projectDomainLink)
            .innerJoin(domain, eq(domain.id, projectDomainLink.domainId))
            .where(
              and(
                eq(projectDomainLink.projectId, projectId),
                eq(projectDomainLink.lifecycle, "active"),
              ),
            )
            .limit(1);

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
          const visibleWorkIds = openWorkRows
            .slice(0, query.limit)
            .map((item) => item.id);
          const blockerRows = visibleWorkIds.length
            ? await tx
                .select({ relation: workItemRelation, blocker: workItem })
                .from(workItemRelation)
                .innerJoin(
                  workItem,
                  eq(workItem.id, workItemRelation.sourceWorkItemId),
                )
                .where(
                  and(
                    inArray(workItemRelation.targetWorkItemId, visibleWorkIds),
                    eq(workItemRelation.type, "blocks"),
                    eq(workItemRelation.state, "active"),
                    eq(workItem.status, "open"),
                  ),
                )
            : [];
          const blockersByWork = new Map<
            string,
            {
              relationId: string;
              workItemId: string;
              title: string;
              recordedAt: string;
            }[]
          >();
          for (const { relation, blocker } of blockerRows) {
            const blockers =
              blockersByWork.get(relation.targetWorkItemId) ?? [];
            blockers.push({
              relationId: relation.id,
              workItemId: blocker.id,
              title: blocker.title,
              recordedAt: relation.createdAt.toISOString(),
            });
            blockersByWork.set(relation.targetWorkItemId, blockers);
          }
          const attachedRows = visibleWorkIds.length
            ? await tx
                .select({
                  attachment: workItemAttachment,
                  document: knowledgeItem,
                })
                .from(workItemAttachment)
                .innerJoin(
                  knowledgeItem,
                  eq(knowledgeItem.id, workItemAttachment.knowledgeItemId),
                )
                .where(
                  and(
                    inArray(workItemAttachment.workItemId, visibleWorkIds),
                    eq(workItemAttachment.state, "active"),
                  ),
                )
                .orderBy(workItemAttachment.createdAt, workItemAttachment.id)
            : [];
          const attachmentsByWork = new Map<
            string,
            {
              attachmentId: string;
              knowledgeItemId: string;
              title: string;
              recordedAt: string;
            }[]
          >();
          for (const { attachment, document } of attachedRows) {
            const items = attachmentsByWork.get(attachment.workItemId) ?? [];
            items.push({
              attachmentId: attachment.id,
              knowledgeItemId: document.id,
              title: document.title,
              recordedAt: attachment.createdAt.toISOString(),
            });
            attachmentsByWork.set(attachment.workItemId, items);
          }
          const acceptanceRows = visibleWorkIds.length
            ? await tx
                .select({
                  acceptance: workItemAcceptance,
                  revision: workItemAcceptanceRevision,
                })
                .from(workItemAcceptance)
                .innerJoin(
                  workItemAcceptanceRevision,
                  and(
                    eq(
                      workItemAcceptanceRevision.workItemId,
                      workItemAcceptance.workItemId,
                    ),
                    eq(
                      workItemAcceptanceRevision.version,
                      workItemAcceptance.version,
                    ),
                  ),
                )
                .where(inArray(workItemAcceptance.workItemId, visibleWorkIds))
            : [];
          const acceptanceByWork = new Map(
            acceptanceRows.map(({ acceptance, revision }) => [
              acceptance.workItemId,
              {
                criteria: acceptance.criteria,
                version: acceptance.version,
                revisionId: revision.id,
                recordedAt: revision.createdAt.toISOString(),
              },
            ]),
          );
          const verificationRows = visibleWorkIds.length
            ? await tx
                .selectDistinctOn([workItemVerification.workItemId])
                .from(workItemVerification)
                .where(inArray(workItemVerification.workItemId, visibleWorkIds))
                .orderBy(
                  asc(workItemVerification.workItemId),
                  desc(workItemVerification.createdAt),
                  desc(workItemVerification.id),
                )
            : [];
          const verificationByWork = new Map(
            verificationRows.map((review) => [review.workItemId, review]),
          );
          const noteRows = await tx
            .select({ item: knowledgeItem, context: knowledgeProjectLink })
            .from(knowledgeItem)
            .leftJoin(
              knowledgeProjectLink,
              and(
                eq(knowledgeProjectLink.knowledgeItemId, knowledgeItem.id),
                eq(knowledgeProjectLink.projectId, projectId),
                eq(knowledgeProjectLink.lifecycle, "active"),
              ),
            )
            .where(
              or(
                eq(knowledgeItem.projectId, projectId),
                isNotNull(knowledgeProjectLink.id),
              ),
            )
            .orderBy(desc(knowledgeItem.createdAt), desc(knowledgeItem.id))
            .limit(query.limit + 1);
          const decisionRows = await tx
            .select()
            .from(projectDecision)
            .where(eq(projectDecision.projectId, projectId))
            .orderBy(desc(projectDecision.updatedAt), desc(projectDecision.id))
            .limit(query.limit + 1);
          const systemRows = await tx
            .select({ link: systemProjectLink, record: system })
            .from(systemProjectLink)
            .innerJoin(system, eq(system.id, systemProjectLink.systemId))
            .where(
              and(
                eq(systemProjectLink.projectId, projectId),
                eq(systemProjectLink.lifecycle, "active"),
              ),
            )
            .orderBy(systemProjectLink.id)
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
              domain: ownedDomain
                ? { id: ownedDomain.owner.id, name: ownedDomain.owner.name }
                : null,
              createdAt: currentProject.record.createdAt.toISOString(),
              updatedAt: currentProject.record.updatedAt.toISOString(),
            },
            domainMembership: ownedDomain
              ? {
                  domainId: ownedDomain.owner.id,
                  domainName: ownedDomain.owner.name,
                  linkId: ownedDomain.link.id,
                  linkedAt: ownedDomain.link.createdAt.toISOString(),
                }
              : null,
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
                priority: row.priority,
                dueOn: row.dueOn,
                openBlockers: blockersByWork.get(row.id) ?? [],
                attachedDocuments: attachmentsByWork.get(row.id) ?? [],
                acceptance: (() => {
                  const acceptance = acceptanceByWork.get(row.id);
                  if (!acceptance || !acceptance.criteria.trim()) return null;
                  const review = verificationByWork.get(row.id);
                  return {
                    ...acceptance,
                    latestReview:
                      review?.acceptanceVersion === acceptance.version
                        ? {
                            id: review.id,
                            result: review.result,
                            note: review.note,
                            attachmentId: review.attachmentId,
                            documentTitle: review.documentTitle,
                            recordedAt: review.createdAt.toISOString(),
                          }
                        : null,
                  };
                })(),
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              }),
              (row) => row.id,
            ),
            knowledge: page(
              noteRows,
              query.limit,
              ({ item, context }) => ({
                id: item.id,
                projectId: item.projectId,
                sourceCaptureId: item.sourceCaptureId,
                kind: item.kind,
                title: item.title,
                content: item.content,
                url: item.url,
                version: item.version,
                contextLink: context
                  ? {
                      id: context.id,
                      projectId: context.projectId,
                      createdAt: context.createdAt.toISOString(),
                    }
                  : null,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString(),
              }),
              ({ item }) => item.id,
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
            systems: page(
              systemRows,
              query.limit,
              ({ link, record }) => ({
                system: {
                  id: record.id,
                  name: record.name,
                  summary: record.summary,
                  lifecycle: record.lifecycle,
                  version: record.version,
                  createdAt: record.createdAt.toISOString(),
                  updatedAt: record.updatedAt.toISOString(),
                },
                linkId: link.id,
                linkedAt: link.createdAt.toISOString(),
              }),
              ({ link }) => link.id,
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
