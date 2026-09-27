import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  canonicalPacketJson,
  EXECUTION_PACKET_SCHEMA_VERSION,
  ExecutionPacketError,
  validatePacketSelection,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  auditEvent,
  capture,
  executionPacket,
  knowledgeItem,
  knowledgeProjectLink,
  project,
  projectResourceLink,
  workItem,
  workItemAcceptance,
  workItemAcceptanceRevision,
  workItemVerification,
} from "./schema";

type PacketSelection = {
  workItemId: string;
  selectedKnowledgeIds: string[];
  selectedResourceIds: string[];
};

function projectRecord(row: typeof project.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    type: row.type,
    lifecycle: row.lifecycle,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function workRecord(row: typeof workItem.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueOn: row.dueOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function knowledgeRecord(row: typeof knowledgeItem.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    kind: row.kind,
    title: row.title,
    content: row.content,
    url: row.url,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function packetRecord(row: typeof executionPacket.$inferSelect) {
  return {
    id: row.id,
    schemaVersion: EXECUTION_PACKET_SCHEMA_VERSION,
    packetVersion: row.packetVersion,
    workItemId: row.workItemId,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    generatedAt: row.generatedAt.toISOString(),
    contentDigest: row.contentDigest,
    snapshot: row.snapshot,
  };
}

export function createExecutionPacketRepository(db: CommandryDatabase) {
  return {
    async create<TSnapshot extends Record<string, unknown>>(
      input: PacketSelection,
      build: (bundle: {
        id: string;
        packetVersion: number;
        generatedAt: string;
        project: ReturnType<typeof projectRecord>;
        workItem: ReturnType<typeof workRecord>;
        acceptance: {
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
        knowledge: ReturnType<typeof knowledgeRecord>[];
        resources: Array<{
          resourceId: string;
          linkId: string;
          linkType: "supports" | "relates_to";
          linkedAt: string;
        }>;
      }) => { snapshot: TSnapshot; contentDigest: string },
    ) {
      validatePacketSelection(
        input.selectedKnowledgeIds,
        input.selectedResourceIds,
      );
      const packetId = await db.transaction(async (tx) => {
        const [task] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, input.workItemId))
          .for("update")
          .limit(1);
        if (!task) {
          throw new ExecutionPacketError(
            "WORK_ITEM_NOT_FOUND",
            "Work item not found",
          );
        }
        const [currentProject] = await tx
          .select()
          .from(project)
          .where(eq(project.id, task.projectId))
          .limit(1);
        const [originalCapture] = await tx
          .select()
          .from(capture)
          .where(eq(capture.id, task.sourceCaptureId))
          .limit(1);
        if (!currentProject || !originalCapture) {
          throw new Error("Packet source references are missing");
        }
        if (originalCapture.inputType === "file")
          throw new ExecutionPacketError(
            "INVALID_SELECTION",
            "A task packet must cite a text or URL task capture",
          );

        const noteRows = input.selectedKnowledgeIds.length
          ? await tx
              .select()
              .from(knowledgeItem)
              .where(inArray(knowledgeItem.id, input.selectedKnowledgeIds))
              .for("share")
          : [];
        const secondaryIds = noteRows
          .filter((note) => note.projectId !== task.projectId)
          .map((note) => note.id);
        const contextRows = secondaryIds.length
          ? await tx
              .select()
              .from(knowledgeProjectLink)
              .where(
                and(
                  inArray(knowledgeProjectLink.knowledgeItemId, secondaryIds),
                  eq(knowledgeProjectLink.projectId, task.projectId),
                  eq(knowledgeProjectLink.lifecycle, "active"),
                ),
              )
          : [];
        const contextById = new Map(
          contextRows.map((link) => [link.knowledgeItemId, link]),
        );
        if (
          noteRows.length !== input.selectedKnowledgeIds.length ||
          secondaryIds.some((id) => !contextById.has(id))
        ) {
          throw new ExecutionPacketError(
            "KNOWLEDGE_NOT_IN_PROJECT",
            "Selected knowledge must have active task-project context",
          );
        }
        const noteById = new Map(noteRows.map((note) => [note.id, note]));

        const linkedResources = input.selectedResourceIds.length
          ? await tx
              .select()
              .from(projectResourceLink)
              .where(
                and(
                  eq(projectResourceLink.projectId, task.projectId),
                  eq(projectResourceLink.lifecycle, "active"),
                  inArray(
                    projectResourceLink.resourceId,
                    input.selectedResourceIds,
                  ),
                ),
              )
              .orderBy(
                asc(projectResourceLink.createdAt),
                asc(projectResourceLink.id),
              )
          : [];
        const firstLinkByResourceId = new Map<
          string,
          (typeof linkedResources)[number]
        >();
        for (const link of linkedResources) {
          if (!firstLinkByResourceId.has(link.resourceId)) {
            firstLinkByResourceId.set(link.resourceId, link);
          }
        }
        if (firstLinkByResourceId.size !== input.selectedResourceIds.length) {
          throw new ExecutionPacketError(
            "RESOURCE_NOT_IN_PROJECT",
            "Selected resources must have active task-project links",
          );
        }

        const [acceptanceRow] = await tx
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
          .where(eq(workItemAcceptance.workItemId, task.id))
          .limit(1);
        const [review] = acceptanceRow?.acceptance.criteria.trim()
          ? await tx
              .select()
              .from(workItemVerification)
              .where(
                and(
                  eq(workItemVerification.workItemId, task.id),
                  eq(
                    workItemVerification.acceptanceVersion,
                    acceptanceRow.acceptance.version,
                  ),
                ),
              )
              .orderBy(
                desc(workItemVerification.createdAt),
                desc(workItemVerification.id),
              )
              .limit(1)
          : [];

        const [versionResult] = await tx
          .select({
            latest: sql<number>`coalesce(max(${executionPacket.packetVersion}), 0)`,
          })
          .from(executionPacket)
          .where(eq(executionPacket.workItemId, task.id));
        const packetVersion = Number(versionResult?.latest ?? 0) + 1;
        const id = crypto.randomUUID();
        const generatedAt = new Date();
        const contents = build({
          id,
          packetVersion,
          generatedAt: generatedAt.toISOString(),
          project: projectRecord(currentProject),
          workItem: workRecord(task),
          acceptance: acceptanceRow?.acceptance.criteria.trim()
            ? {
                criteria: acceptanceRow.acceptance.criteria,
                version: acceptanceRow.acceptance.version,
                revisionId: acceptanceRow.revision.id,
                recordedAt: acceptanceRow.revision.createdAt.toISOString(),
                latestReview: review
                  ? {
                      id: review.id,
                      result: review.result,
                      note: review.note,
                      attachmentId: review.attachmentId,
                      documentTitle: review.documentTitle,
                      recordedAt: review.createdAt.toISOString(),
                    }
                  : null,
              }
            : null,
          sourceCapture: {
            id: originalCapture.id,
            inputType: originalCapture.inputType,
            source: "manual-local",
            createdAt: originalCapture.createdAt.toISOString(),
          },
          knowledge: input.selectedKnowledgeIds.map((noteId) => {
            const note = noteById.get(noteId)!;
            const context = contextById.get(noteId);
            return {
              ...knowledgeRecord(note),
              ...(context
                ? {
                    contextLink: {
                      id: context.id,
                      projectId: context.projectId,
                      createdAt: context.createdAt.toISOString(),
                    },
                  }
                : {}),
            };
          }),
          resources: input.selectedResourceIds.map((resourceId) => {
            const link = firstLinkByResourceId.get(resourceId)!;
            return {
              resourceId,
              linkId: link.id,
              linkType: link.type,
              linkedAt: link.createdAt.toISOString(),
            };
          }),
        });
        const expectedDigest = createHash("sha256")
          .update(canonicalPacketJson(contents.snapshot))
          .digest("hex");
        if (contents.contentDigest !== expectedDigest) {
          throw new ExecutionPacketError(
            "INVALID_SELECTION",
            "Packet content digest does not match its snapshot",
          );
        }
        await tx.insert(executionPacket).values({
          id,
          workItemId: task.id,
          projectId: task.projectId,
          sourceCaptureId: originalCapture.id,
          packetVersion,
          schemaVersion: EXECUTION_PACKET_SCHEMA_VERSION,
          snapshot: contents.snapshot,
          contentDigest: contents.contentDigest,
          generatedAt,
        });
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:packet-service",
          operation: "execution_packet.created",
          details: {
            packetId: id,
            workItemId: task.id,
            projectId: task.projectId,
            packetVersion,
          },
        });
        return id;
      });
      const packet = await db
        .select()
        .from(executionPacket)
        .where(eq(executionPacket.id, packetId))
        .limit(1);
      if (!packet[0]) throw new Error("Created execution packet disappeared");
      return {
        ...packetRecord(packet[0]),
        snapshot: packet[0].snapshot as TSnapshot,
      };
    },
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(executionPacket)
        .where(eq(executionPacket.id, id))
        .limit(1);
      return row ? packetRecord(row) : null;
    },
    async listForWorkItem(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      if (
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 100
      ) {
        throw new Error("Packet page limit must be between 1 and 100");
      }
      const [anchor] = query.cursor
        ? await db
            .select({ packetVersion: executionPacket.packetVersion })
            .from(executionPacket)
            .where(
              and(
                eq(executionPacket.id, query.cursor),
                eq(executionPacket.workItemId, workItemId),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(executionPacket)
        .where(
          and(
            eq(executionPacket.workItemId, workItemId),
            anchor
              ? lt(executionPacket.packetVersion, anchor.packetVersion)
              : undefined,
          ),
        )
        .orderBy(desc(executionPacket.packetVersion))
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(packetRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
