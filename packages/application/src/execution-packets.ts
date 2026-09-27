import { createHash } from "node:crypto";
import {
  executionPacketSchema,
  executionPacketSnapshotSchema,
  type CreateExecutionPacketRequest,
  type EvidenceReference,
  type ExecutionPacket,
  type ExecutionPacketSnapshot,
  type KnowledgeItem,
  type ProjectSummary,
  type WorkItem,
} from "@commandry/contracts";
import {
  canonicalPacketJson,
  ExecutionPacketError,
  knowledgeKindLabel,
  validatePacketSelection,
} from "@commandry/domain";

export type ExecutionPacketSourceBundle = {
  id: string;
  packetVersion: number;
  generatedAt: string;
  project: ProjectSummary;
  workItem: WorkItem;
  assignmentEvent?: { id: string; recordedAt: string } | undefined;
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
  sourceCapture: {
    id: string;
    inputType: "text" | "url";
    source: "manual-local";
    createdAt: string;
  };
  knowledge: KnowledgeItem[];
  resources: Array<{
    resourceId: string;
    linkId: string;
    linkType: "supports" | "relates_to";
    linkedAt: string;
  }>;
};

export type ExecutionPacketContents = {
  snapshot: ExecutionPacketSnapshot;
  contentDigest: string;
};

export type ExecutionPacketPage<T> = { items: T[]; nextCursor: string | null };
export type StoredExecutionPacket = Omit<ExecutionPacket, "snapshot"> & {
  snapshot: unknown;
};

export interface ExecutionPacketRepository {
  create(
    input: {
      workItemId: string;
      selectedKnowledgeIds: string[];
      selectedResourceIds: string[];
    },
    build: (bundle: ExecutionPacketSourceBundle) => ExecutionPacketContents,
  ): Promise<StoredExecutionPacket>;
  getById(id: string): Promise<StoredExecutionPacket | null>;
  listForWorkItem(
    workItemId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<ExecutionPacketPage<StoredExecutionPacket>>;
}

function evidence(
  kind: EvidenceReference["kind"],
  id: string,
  href: string,
  recordedAt: string,
  sourceLabel: string,
): EvidenceReference {
  return {
    kind,
    id,
    href,
    recordedAt,
    occurredAt: null,
    sourceLabel,
    isSynthetic: false,
  };
}

export function buildExecutionPacketContents(
  bundle: ExecutionPacketSourceBundle,
): ExecutionPacketContents {
  const task = bundle.workItem;
  if (
    task.assigneeKind &&
    task.assigneeKind !== "unassigned" &&
    (!task.assigneeLabel || !bundle.assignmentEvent)
  ) {
    throw new ExecutionPacketError(
      "INVALID_SELECTION",
      "Assigned Work needs exact assignment evidence",
    );
  }
  if (
    task.projectId !== bundle.project.id ||
    task.sourceCaptureId !== bundle.sourceCapture.id ||
    bundle.knowledge.some(
      (note) =>
        note.projectId !== bundle.project.id &&
        note.contextLink?.projectId !== bundle.project.id,
    )
  ) {
    throw new ExecutionPacketError(
      "INVALID_SELECTION",
      "Packet sources must belong to the task's project and original capture",
    );
  }
  const snapshot = executionPacketSnapshotSchema.parse({
    objective: {
      title: task.title,
      description: task.description,
      workType: task.workType ?? "task",
      ...(task.assigneeKind &&
      task.assigneeKind !== "unassigned" &&
      task.assigneeLabel &&
      bundle.assignmentEvent
        ? {
            assignee: {
              kind: task.assigneeKind,
              agentId: task.assigneeAgentId ?? null,
              label: task.assigneeLabel,
              evidence: evidence(
                "work_item_assignment_event",
                bundle.assignmentEvent.id,
                `/api/v1/work-item-assignment-events/${bundle.assignmentEvent.id}`,
                bundle.assignmentEvent.recordedAt,
                "Manual local Work assignment",
              ),
            },
          }
        : {}),
      status: task.status,
      evidence: [
        evidence(
          "work_item",
          task.id,
          `/api/v1/work-items/${task.id}`,
          task.updatedAt,
          task.generatedFromWorkItemId
            ? "Local worker-created task"
            : "Manual local capture",
        ),
        ...(task.generatedFromWorkItemId
          ? [
              evidence(
                "work_item",
                task.generatedFromWorkItemId,
                `/api/v1/work-items/${task.generatedFromWorkItemId}`,
                task.createdAt,
                "Original recurring Work definition source",
              ),
            ]
          : []),
        evidence(
          "capture",
          bundle.sourceCapture.id,
          `/api/v1/captures/${bundle.sourceCapture.id}`,
          bundle.sourceCapture.createdAt,
          "Manual local capture",
        ),
      ],
    },
    projectContext: {
      id: bundle.project.id,
      name: bundle.project.name,
      summary: bundle.project.summary,
      type: bundle.project.type,
      lifecycle: bundle.project.lifecycle,
      evidence: evidence(
        "project",
        bundle.project.id,
        `/api/v1/projects/${bundle.project.id}`,
        bundle.project.updatedAt,
        "Project record",
      ),
    },
    selectedKnowledge: [...bundle.knowledge]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((note) => ({
        id: note.id,
        title: note.title,
        kind: note.kind,
        evidence: evidence(
          "knowledge_item",
          note.id,
          `/api/v1/knowledge-items/${note.id}`,
          note.updatedAt,
          `Manual local knowledge ${knowledgeKindLabel(note.kind).toLowerCase()}`,
        ),
        ...(note.contextLink
          ? {
              contextEvidence: evidence(
                "knowledge_project_link",
                note.contextLink.id,
                `/api/v1/knowledge-project-links/${note.contextLink.id}`,
                note.contextLink.createdAt,
                "Manual local knowledge-project relationship",
              ),
            }
          : {}),
      })),
    selectedResources: [...bundle.resources]
      .sort((left, right) => left.resourceId.localeCompare(right.resourceId))
      .map(({ resourceId, linkId, linkType, linkedAt }) => ({
        id: resourceId,
        linkId,
        linkType,
        evidence: evidence(
          "project_resource_link",
          linkId,
          `/api/v1/project-resource-links/${linkId}`,
          linkedAt,
          "Manual project resource link",
        ),
      })),
    acceptance: bundle.acceptance
      ? {
          criteria: bundle.acceptance.criteria,
          version: bundle.acceptance.version,
          evidence: evidence(
            "work_item_acceptance_revision",
            bundle.acceptance.revisionId,
            `/api/v1/work-item-acceptance-revisions/${bundle.acceptance.revisionId}`,
            bundle.acceptance.recordedAt,
            "Manual local task acceptance",
          ),
          latestReview: bundle.acceptance.latestReview
            ? {
                result: bundle.acceptance.latestReview.result,
                note: bundle.acceptance.latestReview.note,
                documentTitle: bundle.acceptance.latestReview.documentTitle,
                evidence: [
                  evidence(
                    "work_item_verification",
                    bundle.acceptance.latestReview.id,
                    `/api/v1/work-item-verifications/${bundle.acceptance.latestReview.id}`,
                    bundle.acceptance.latestReview.recordedAt,
                    "Manual local acceptance review",
                  ),
                  evidence(
                    "work_item_attachment",
                    bundle.acceptance.latestReview.attachmentId,
                    `/api/v1/work-item-attachments/${bundle.acceptance.latestReview.attachmentId}`,
                    bundle.acceptance.latestReview.recordedAt,
                    "Manual local work attachment",
                  ),
                ],
              }
            : null,
        }
      : null,
    missing: {
      acceptanceCriteria: bundle.acceptance
        ? {
            status: "recorded",
            message:
              "Task acceptance criteria are included in this immutable packet snapshot.",
          }
        : {
            status: "not_recorded",
            message:
              "No task acceptance criteria were recorded when this packet was created.",
          },
      verificationExpectations: {
        status: "not_recorded",
        message:
          "Task verification expectations are not recorded in the local model.",
      },
      taskConstraints: {
        status: "not_recorded",
        message:
          "Task-specific constraints are not recorded in the local model.",
      },
    },
    authorization: {
      capabilityGrants: [],
      externalActions: "not_authorized",
      explanation:
        "This context packet grants no capabilities. Action policy and approval must be evaluated separately.",
    },
  });
  const contentDigest = createHash("sha256")
    .update(canonicalPacketJson(snapshot))
    .digest("hex");
  return { snapshot, contentDigest };
}

export function createExecutionPacketService(
  repository: ExecutionPacketRepository,
) {
  return {
    async create(workItemId: string, input: CreateExecutionPacketRequest) {
      const selectedKnowledgeIds = input.selectedKnowledgeIds ?? [];
      const selectedResourceIds = input.selectedResourceIds ?? [];
      validatePacketSelection(selectedKnowledgeIds, selectedResourceIds);
      const stored = await repository.create(
        { workItemId, selectedKnowledgeIds, selectedResourceIds },
        buildExecutionPacketContents,
      );
      return executionPacketSchema.parse(stored);
    },
    async getById(id: string) {
      const stored = await repository.getById(id);
      return stored ? executionPacketSchema.parse(stored) : null;
    },
    async listForWorkItem(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const page = await repository.listForWorkItem(workItemId, query);
      return {
        items: page.items.map((item) => executionPacketSchema.parse(item)),
        nextCursor: page.nextCursor,
      };
    },
  };
}
