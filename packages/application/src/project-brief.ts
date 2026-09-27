import type {
  BriefFact,
  EvidenceReference,
  KnowledgeItem,
  ProjectDecision,
  NormalizedSyntheticEvent,
  ProjectBrief,
  ProjectResourceLink,
  ProjectSummary,
  SystemSummary,
  SyntheticAlert,
  WorkItem,
} from "@commandry/contracts";
import {
  briefExcerpt,
  knowledgeKindLabel,
  briefMissing,
  NEXT_ACTION_RULE,
  nextActionForOpenWork,
  PROJECT_BRIEF_METHOD,
  PROJECT_BRIEF_PREVIEW_LIMIT,
  projectStateText,
  requireFactualEvidence,
  resourceFactText,
  workFactText,
} from "@commandry/domain";

export type BriefPage<T> = { items: T[]; nextCursor: string | null };
export type BriefWorkItem = WorkItem & {
  acceptance?: {
    criteria: string;
    version: number;
    revisionId: string;
    recordedAt: string;
    latestReview: {
      id: string;
      result: "met" | "not_met";
      note: string;
      attachmentId: string;
      documentTitle: string;
      recordedAt: string;
    } | null;
  } | null;
  attachedDocuments?: {
    attachmentId: string;
    knowledgeItemId: string;
    title: string;
    recordedAt: string;
  }[];
  openBlockers?: {
    relationId: string;
    workItemId: string;
    title: string;
    recordedAt: string;
  }[];
};
export type ProjectBriefSnapshot = {
  asOf: string;
  project: ProjectSummary;
  domainMembership?: {
    domainId: string;
    domainName: string;
    linkId: string;
    linkedAt: string;
  } | null;
  work: BriefPage<BriefWorkItem>;
  knowledge: BriefPage<KnowledgeItem>;
  decisions: BriefPage<ProjectDecision>;
  systems?: BriefPage<{
    system: SystemSummary;
    linkId: string;
    linkedAt: string;
  }>;
  resources: BriefPage<{ link: ProjectResourceLink; linkedAt: string }>;
  events: BriefPage<NormalizedSyntheticEvent>;
  attention: BriefPage<SyntheticAlert & { recordedAt: string }>;
};

export interface ProjectBriefRepository {
  readProjectSnapshot(
    projectId: string,
    query: { limit: number },
  ): Promise<ProjectBriefSnapshot | null>;
}

function evidence(
  kind: EvidenceReference["kind"],
  id: string,
  href: string,
  recordedAt: string,
  sourceLabel: string,
  isSynthetic: boolean,
  occurredAt: string | null = null,
): EvidenceReference {
  return { kind, id, href, recordedAt, occurredAt, sourceLabel, isSynthetic };
}

function fact(input: BriefFact): BriefFact {
  requireFactualEvidence(input.evidence.length);
  return input;
}

function section(
  items: BriefFact[],
  nextCursor: string | null,
  fullListHref: string,
  emptyMessage: string,
) {
  return {
    items,
    nextCursor,
    fullListHref,
    emptyState: items.length ? null : emptyMessage,
  };
}

export function assembleProjectBrief(
  snapshot: ProjectBriefSnapshot,
  generatedAt: string,
): ProjectBrief {
  const projectId = snapshot.project.id;
  const projectEvidence = evidence(
    "project",
    projectId,
    `/api/v1/projects/${projectId}`,
    snapshot.project.updatedAt,
    "Project record",
    false,
  );
  const work = snapshot.work.items.map((item) =>
    fact({
      id: item.id,
      kind: "work_item",
      title: item.title,
      detail: `${item.workType === "initiative" ? "Initiative. " : item.workType === "subtask" ? "Subtask. " : ""}${workFactText(item.status)}. ${briefExcerpt(item.description)}${item.openBlockers?.length ? ` Blocked by ${item.openBlockers.map((blocker) => blocker.title).join(", ")}.` : ""}${item.attachedDocuments?.length ? ` Attached documents: ${item.attachedDocuments.map((document) => document.title).join(", ")}.` : ""}${item.acceptance ? ` Acceptance criteria v${item.acceptance.version}: ${briefExcerpt(item.acceptance.criteria)}. ${item.acceptance.latestReview ? `Manual local review ${item.acceptance.latestReview.result} with ${item.acceptance.latestReview.documentTitle}.` : "No current review recorded."}` : ""}`,
      evidence: [
        evidence(
          "work_item",
          item.id,
          `/api/v1/work-items/${item.id}`,
          item.updatedAt,
          "Manual local capture",
          false,
        ),
        ...(item.contextLink
          ? [
              evidence(
                "work_project_link",
                item.contextLink.id,
                `/api/v1/work-project-links/${item.contextLink.id}`,
                item.contextLink.createdAt,
                "Manual local work-project relationship",
                false,
              ),
            ]
          : []),
        ...(item.openBlockers ?? []).map((blocker) =>
          evidence(
            "work_item_relation",
            blocker.relationId,
            `/api/v1/work-item-relations/${blocker.relationId}`,
            blocker.recordedAt,
            "Manual local work relationship",
            false,
          ),
        ),
        ...(item.attachedDocuments ?? []).map((document) =>
          evidence(
            "work_item_attachment",
            document.attachmentId,
            `/api/v1/work-item-attachments/${document.attachmentId}`,
            document.recordedAt,
            "Manual local work attachment",
            false,
          ),
        ),
        ...(item.acceptance
          ? [
              evidence(
                "work_item_acceptance_revision",
                item.acceptance.revisionId,
                `/api/v1/work-item-acceptance-revisions/${item.acceptance.revisionId}`,
                item.acceptance.recordedAt,
                "Manual local task acceptance",
                false,
              ),
            ]
          : []),
        ...(item.acceptance?.latestReview
          ? [
              evidence(
                "work_item_verification",
                item.acceptance.latestReview.id,
                `/api/v1/work-item-verifications/${item.acceptance.latestReview.id}`,
                item.acceptance.latestReview.recordedAt,
                "Manual local acceptance review",
                false,
              ),
            ]
          : []),
      ],
      sourceLabel: "Manual local capture",
      isSynthetic: false,
    }),
  );
  const knowledge = snapshot.knowledge.items.map((item) => {
    const category = knowledgeKindLabel(item.kind).toLowerCase();
    const sourceLabel =
      item.kind === "link"
        ? "Manual local knowledge link"
        : item.kind === "document"
          ? (item.version ?? 1) > 1
            ? "Locally revised knowledge document"
            : "Manual local knowledge document"
          : (item.version ?? 1) > 1
            ? `Locally revised knowledge ${category}`
            : `Manual local knowledge ${category}`;
    return fact({
      id: item.id,
      kind: "knowledge_item",
      title: item.title,
      detail:
        item.kind === "link"
          ? `Saved reference: ${item.url ?? "URL unavailable"}. ${briefExcerpt(item.content)}`
          : item.kind === "document"
            ? `Original file preserved separately. ${briefExcerpt(item.content)}`
            : `${knowledgeKindLabel(item.kind)}. ${briefExcerpt(item.content)}`,
      evidence: [
        evidence(
          "knowledge_item",
          item.id,
          `/api/v1/knowledge-items/${item.id}`,
          item.updatedAt,
          sourceLabel,
          false,
        ),
        evidence(
          "capture",
          item.sourceCaptureId,
          `/api/v1/captures/${item.sourceCaptureId}`,
          item.createdAt,
          item.kind === "document"
            ? "Manual local original file"
            : "Manual local capture",
          false,
        ),
        ...(item.contextLink
          ? [
              evidence(
                "knowledge_project_link",
                item.contextLink.id,
                `/api/v1/knowledge-project-links/${item.contextLink.id}`,
                item.contextLink.createdAt,
                "Manual local knowledge-project relationship",
                false,
              ),
            ]
          : []),
      ],
      sourceLabel,
      isSynthetic: false,
    });
  });
  const decisions = snapshot.decisions.items.map((item) =>
    fact({
      id: item.id,
      kind: "decision",
      title: item.question,
      detail: `${item.status}: ${briefExcerpt(item.outcome)}. Rationale: ${briefExcerpt(item.rationale)}`,
      evidence: [
        evidence(
          "decision",
          item.id,
          `/api/v1/decisions/${item.id}`,
          item.updatedAt,
          item.sourceLabel,
          false,
        ),
      ],
      sourceLabel: item.sourceLabel,
      isSynthetic: false,
    }),
  );
  const systems = (snapshot.systems?.items ?? []).map(
    ({ system, linkId, linkedAt }) =>
      fact({
        id: system.id,
        kind: "system",
        title: system.name,
        detail: `${briefExcerpt(system.summary ?? "No system summary recorded.")} Local context record; operational health is not inferred.`,
        evidence: [
          evidence(
            "system",
            system.id,
            `/api/v1/systems/${system.id}`,
            system.updatedAt,
            "Manual local system record",
            false,
          ),
          evidence(
            "system_project_link",
            linkId,
            `/api/v1/system-project-links/${linkId}`,
            linkedAt,
            "Manual local system-project relationship",
            false,
          ),
        ],
        sourceLabel: "Manual local system context",
        isSynthetic: false,
      }),
  );
  const resources = snapshot.resources.items.map(({ link, linkedAt }) =>
    fact({
      id: link.resource.id,
      kind: "resource",
      title: link.resource.name,
      detail: `${link.resource.kind}. ${resourceFactText(link.resource.state)}`,
      evidence: [
        evidence(
          "resource",
          link.resource.id,
          `/api/v1/resources/${link.resource.id}`,
          linkedAt,
          "Manual project resource link",
          false,
        ),
      ],
      sourceLabel: "Manual project resource link",
      isSynthetic: false,
    }),
  );
  const activity = snapshot.events.items.map((event) =>
    fact({
      id: event.id,
      kind: "event",
      title: event.summary,
      detail: `Occurred ${event.occurredAt}; ingested ${event.ingestedAt}. Source evidence: ${event.evidenceHref}`,
      evidence: [
        evidence(
          "event",
          event.id,
          `/api/v1/events/${event.id}`,
          event.ingestedAt,
          event.sourceLabel,
          true,
          event.occurredAt,
        ),
      ],
      sourceLabel: event.sourceLabel,
      isSynthetic: true,
    }),
  );
  const attention = snapshot.attention.items.map((alert) =>
    fact({
      id: alert.id,
      kind: "alert",
      title: "Synthetic monitor attention",
      detail: `${alert.reason} Last synthetic observation: ${alert.lastObservedAt}.`,
      evidence: [
        evidence(
          "alert",
          alert.id,
          `/api/v1/alerts/${alert.id}`,
          alert.recordedAt,
          alert.sourceLabel,
          true,
          alert.lastObservedAt,
        ),
      ],
      sourceLabel: alert.sourceLabel,
      isSynthetic: true,
    }),
  );
  const nextActions = snapshot.work.items
    .filter((item) => item.status === "open" && !item.openBlockers?.length)
    .slice(0, 3)
    .map((item) => ({
      kind: "inference" as const,
      ruleId: NEXT_ACTION_RULE,
      text: nextActionForOpenWork(item.title),
      evidence: [
        evidence(
          "work_item",
          item.id,
          `/api/v1/work-items/${item.id}`,
          item.updatedAt,
          "Manual local capture",
          false,
        ),
      ],
    }));
  return {
    project: snapshot.project,
    generatedAt,
    asOf: snapshot.asOf,
    method: PROJECT_BRIEF_METHOD,
    state: {
      text: `${projectStateText(snapshot.project.lifecycle)}${snapshot.domainMembership ? ` Owned by domain ${snapshot.domainMembership.domainName}.` : " No owning domain is recorded."}`,
      evidence: [
        projectEvidence,
        ...(snapshot.domainMembership
          ? [
              evidence(
                "domain",
                snapshot.domainMembership.domainId,
                `/api/v1/domains/${snapshot.domainMembership.domainId}`,
                snapshot.domainMembership.linkedAt,
                "Manual local portfolio domain",
                false,
              ),
              evidence(
                "project_domain_link",
                snapshot.domainMembership.linkId,
                `/api/v1/project-domain-links/${snapshot.domainMembership.linkId}`,
                snapshot.domainMembership.linkedAt,
                "Manual local domain membership",
                false,
              ),
            ]
          : []),
      ],
    },
    sections: {
      work: section(
        work,
        snapshot.work.nextCursor,
        `/api/v1/projects/${projectId}/work`,
        "No open work items are recorded in this preview.",
      ),
      knowledge: section(
        knowledge,
        snapshot.knowledge.nextCursor,
        `/api/v1/projects/${projectId}/knowledge`,
        "No knowledge records are recorded in this preview.",
      ),
      decisions: section(
        decisions,
        snapshot.decisions.nextCursor,
        `/api/v1/projects/${projectId}/decisions`,
        "No project decisions are recorded in this preview.",
      ),
      systems: section(
        systems,
        snapshot.systems?.nextCursor ?? null,
        `/api/v1/projects/${projectId}/systems`,
        "No related systems are recorded in this preview.",
      ),
      resources: section(
        resources,
        snapshot.resources.nextCursor,
        `/api/v1/projects/${projectId}/resources`,
        "No linked resources are recorded in this preview.",
      ),
      activity: section(
        activity,
        snapshot.events.nextCursor,
        `/api/v1/events?projectId=${projectId}`,
        "No synthetic activity is recorded in this preview.",
      ),
      attention: section(
        attention,
        snapshot.attention.nextCursor,
        `/api/v1/attention?projectId=${projectId}`,
        "No open synthetic attention is recorded in this preview.",
      ),
    },
    missing: {
      questions: briefMissing(
        "Structured open questions are not recorded in the local model.",
      ),
      blockers: briefMissing(
        "Open blockers for previewed tasks are shown in Work facts; the full project work graph is available from each task.",
      ),
      acceptanceCriteria:
        snapshot.work.items.length > 0 &&
        snapshot.work.items.every((item) => item.acceptance)
          ? {
              status: "recorded" as const,
              message:
                "Every open task in this brief preview has recorded acceptance criteria. Review each Work source for the full history.",
            }
          : briefMissing(
              "Some open tasks in this brief preview have no recorded acceptance criteria. See each Work source for details.",
            ),
    },
    nextActions: {
      items: nextActions,
      scope: "preview_only",
      explanation:
        "Suggestions are inferred only from open tasks in the bounded preview; review the full work list for all tasks.",
    },
  };
}

export function createProjectBriefService(repository: ProjectBriefRepository) {
  return {
    async getBrief(projectId: string): Promise<ProjectBrief | null> {
      const snapshot = await repository.readProjectSnapshot(projectId, {
        limit: PROJECT_BRIEF_PREVIEW_LIMIT,
      });
      return snapshot
        ? assembleProjectBrief(snapshot, new Date().toISOString())
        : null;
    },
  };
}
