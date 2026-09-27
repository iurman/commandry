import { and, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  CaptureError,
  MANUAL_CAPTURE_AUTHOR,
  MANUAL_CAPTURE_SOURCE,
  localImagePreviewMediaType,
  type KnowledgeTextType,
  type ManualCaptureInputType,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  capture,
  captureFile,
  knowledgeItem,
  knowledgeProjectLink,
  project,
  workItem,
  workProjectLink,
} from "./schema";

export function captureRecord(
  row: typeof capture.$inferSelect,
  file: typeof captureFile.$inferSelect | null = null,
) {
  const imagePreview = file
    ? localImagePreviewMediaType(
        file.mediaType,
        Buffer.from(file.contentBase64.slice(0, 32), "base64"),
      )
    : null;
  return {
    id: row.id,
    inputType: row.inputType,
    originalContent: row.originalContent,
    file: file
      ? {
          originalName: file.originalName,
          mediaType: file.mediaType,
          byteSize: file.byteSize,
          sha256: file.sha256,
          downloadHref: `/api/v1/captures/${row.id}/original-file`,
          ...(imagePreview && {
            previewHref: `/api/v1/captures/${row.id}/preview-image`,
          }),
        }
      : null,
    source: row.source,
    author: row.author,
    state: row.state,
    projectId: row.projectId,
    filedRecord:
      row.filedRecordKind && row.filedRecordId
        ? { kind: row.filedRecordKind, id: row.filedRecordId }
        : null,
    createdAt: row.createdAt.toISOString(),
    filedAt: row.filedAt?.toISOString() ?? null,
  };
}

function workRecord(
  row: typeof workItem.$inferSelect,
  context?: typeof workProjectLink.$inferSelect | null,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    title: row.title,
    description: row.description,
    workType: row.workType,
    generatedFromWorkItemId: row.generatedFromWorkItemId,
    assigneeKind: row.assigneeKind,
    assigneeAgentId: row.assigneeAgentId,
    assigneeLabel: row.assigneeLabel,
    status: row.status,
    priority: row.priority,
    dueOn: row.dueOn,
    ...(context !== undefined
      ? {
          contextLink: context
            ? {
                id: context.id,
                projectId: context.projectId,
                createdAt: context.createdAt.toISOString(),
              }
            : null,
        }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function knowledgeRecord(
  row: typeof knowledgeItem.$inferSelect,
  context?: typeof knowledgeProjectLink.$inferSelect | null,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    kind: row.kind,
    title: row.title,
    content: row.content,
    url: row.url,
    version: row.version,
    ...(context !== undefined
      ? {
          contextLink: context
            ? {
                id: context.id,
                projectId: context.projectId,
                createdAt: context.createdAt.toISOString(),
              }
            : null,
        }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type PageQuery = { limit: number; cursor?: string | undefined };

type WorkFocus = {
  status?: "open" | "done" | undefined;
  priority?: "low" | "normal" | "high" | "unset" | undefined;
  assignee?: "unassigned" | "local_user" | "agent" | undefined;
  due?: "overdue" | "today" | "upcoming" | "undated" | undefined;
  asOf?: string | undefined;
};

function workFocusPredicate(input: WorkFocus) {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  return and(
    input.status ? eq(workItem.status, input.status) : undefined,
    input.priority === "unset"
      ? isNull(workItem.priority)
      : input.priority
        ? eq(workItem.priority, input.priority)
        : undefined,
    input.assignee ? eq(workItem.assigneeKind, input.assignee) : undefined,
    input.due && input.due !== "undated"
      ? eq(workItem.status, "open")
      : undefined,
    input.due === "overdue" ? lt(workItem.dueOn, asOf) : undefined,
    input.due === "today" ? eq(workItem.dueOn, asOf) : undefined,
    input.due === "upcoming" ? gt(workItem.dueOn, asOf) : undefined,
    input.due === "undated" ? isNull(workItem.dueOn) : undefined,
  );
}

async function captureCursor(db: CommandryDatabase, cursor: string) {
  const [anchor] = await db
    .select({ createdAt: capture.createdAt })
    .from(capture)
    .where(eq(capture.id, cursor))
    .limit(1);
  return anchor?.createdAt ?? null;
}

type SearchRow = {
  id: string;
  kind:
    | "capture"
    | "task"
    | "initiative"
    | "subtask"
    | "note"
    | "idea"
    | "research"
    | "requirement"
    | "architecture_note"
    | "runbook"
    | "meeting_note"
    | "lesson_learned"
    | "instruction"
    | "link"
    | "document"
    | "comment"
    | "decision"
    | "domain"
    | "system"
    | "project"
    | "resource";
  project_id: string | null;
  title: string;
  excerpt: string;
  source_capture_id: string | null;
  target_id: string | null;
  created_at: Date | string;
};

export function createCaptureRepository(db: CommandryDatabase) {
  return {
    async projectExists(projectId: string) {
      const rows = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      return rows.length === 1;
    },
    async createCapture(input: {
      id: string;
      inputType: ManualCaptureInputType;
      originalContent: string;
      projectId?: string;
    }) {
      const [row] = await db
        .insert(capture)
        .values({
          id: input.id,
          inputType: input.inputType,
          originalContent: input.originalContent,
          source: MANUAL_CAPTURE_SOURCE,
          author: MANUAL_CAPTURE_AUTHOR,
          projectId: input.projectId ?? null,
        })
        .returning();
      if (!row) throw new Error("Capture insert returned no row");
      return captureRecord(row);
    },
    async getCapture(id: string) {
      const [row] = await db
        .select({ capture, file: captureFile })
        .from(capture)
        .leftJoin(captureFile, eq(captureFile.captureId, capture.id))
        .where(eq(capture.id, id))
        .limit(1);
      return row ? captureRecord(row.capture, row.file) : null;
    },
    async listCaptures(input: PageQuery) {
      const anchor = input.cursor
        ? await captureCursor(db, input.cursor)
        : null;
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({ capture, file: captureFile })
        .from(capture)
        .leftJoin(captureFile, eq(captureFile.captureId, capture.id))
        .where(
          anchor
            ? sql`(${capture.createdAt}, ${capture.id}) < (${anchor}, ${input.cursor}::uuid)`
            : undefined,
        )
        .orderBy(desc(capture.createdAt), desc(capture.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map((row) => captureRecord(row.capture, row.file)),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.capture.id ?? null) : null,
      };
    },
    async fileAsTask(input: {
      captureId: string;
      recordId: string;
      projectId: string;
      title: string;
      description: string;
      workType?: "task" | "initiative" | undefined;
    }) {
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(capture)
          .set({
            state: "filed",
            projectId: input.projectId,
            filedRecordKind: "task",
            filedRecordId: input.recordId,
            filedAt: new Date(),
          })
          .where(
            and(eq(capture.id, input.captureId), eq(capture.state, "unfiled")),
          )
          .returning();
        if (!updated) {
          throw new CaptureError(
            "CAPTURE_ALREADY_FILED",
            "Capture is already filed",
          );
        }
        const [record] = await tx
          .insert(workItem)
          .values({
            id: input.recordId,
            projectId: input.projectId,
            sourceCaptureId: input.captureId,
            title: input.title,
            description: input.description,
            workType: input.workType ?? "task",
          })
          .returning();
        if (!record) throw new Error("Work item insert returned no row");
        return { capture: captureRecord(updated), record: workRecord(record) };
      });
    },
    async fileAsNote(input: {
      captureId: string;
      recordId: string;
      projectId: string;
      title: string;
      content: string;
      knowledgeType?: KnowledgeTextType | undefined;
    }) {
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(capture)
          .set({
            state: "filed",
            projectId: input.projectId,
            filedRecordKind: "note",
            filedRecordId: input.recordId,
            filedAt: new Date(),
          })
          .where(
            and(eq(capture.id, input.captureId), eq(capture.state, "unfiled")),
          )
          .returning();
        if (!updated) {
          throw new CaptureError(
            "CAPTURE_ALREADY_FILED",
            "Capture is already filed",
          );
        }
        const [record] = await tx
          .insert(knowledgeItem)
          .values({
            id: input.recordId,
            projectId: input.projectId,
            sourceCaptureId: input.captureId,
            kind: input.knowledgeType ?? "note",
            title: input.title,
            content: input.content,
          })
          .returning();
        if (!record) throw new Error("Knowledge insert returned no row");
        return {
          capture: captureRecord(updated),
          record: knowledgeRecord(record),
        };
      });
    },
    async fileAsLink(input: {
      captureId: string;
      recordId: string;
      projectId: string;
      title: string;
      content: string;
      url: string;
    }) {
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(capture)
          .set({
            state: "filed",
            projectId: input.projectId,
            filedRecordKind: "link",
            filedRecordId: input.recordId,
            filedAt: new Date(),
          })
          .where(
            and(eq(capture.id, input.captureId), eq(capture.state, "unfiled")),
          )
          .returning();
        if (!updated)
          throw new CaptureError(
            "CAPTURE_ALREADY_FILED",
            "Capture is already filed",
          );
        const [record] = await tx
          .insert(knowledgeItem)
          .values({
            id: input.recordId,
            projectId: input.projectId,
            sourceCaptureId: input.captureId,
            kind: "link",
            title: input.title,
            content: input.content,
            url: input.url,
          })
          .returning();
        if (!record) throw new Error("Knowledge link insert returned no row");
        return {
          capture: captureRecord(updated),
          record: knowledgeRecord(record),
        };
      });
    },
    async fileAsDocument(input: {
      captureId: string;
      recordId: string;
      projectId: string;
      title: string;
      content: string;
    }) {
      return db.transaction(async (tx) => {
        const [file] = await tx
          .select()
          .from(captureFile)
          .where(eq(captureFile.captureId, input.captureId))
          .limit(1);
        if (!file)
          throw new CaptureError(
            "CAPTURE_KIND_INVALID",
            "Only an original file can be filed as a document",
          );
        const [updated] = await tx
          .update(capture)
          .set({
            state: "filed",
            projectId: input.projectId,
            filedRecordKind: "document",
            filedRecordId: input.recordId,
            filedAt: new Date(),
          })
          .where(
            and(eq(capture.id, input.captureId), eq(capture.state, "unfiled")),
          )
          .returning();
        if (!updated)
          throw new CaptureError(
            "CAPTURE_ALREADY_FILED",
            "Capture is already filed",
          );
        const [document] = await tx
          .insert(knowledgeItem)
          .values({
            id: input.recordId,
            projectId: input.projectId,
            sourceCaptureId: input.captureId,
            kind: "document",
            title: input.title,
            content: input.content,
          })
          .returning();
        if (!document)
          throw new Error("Knowledge document insert returned no row");
        return {
          capture: captureRecord(updated, file),
          record: knowledgeRecord(document),
        };
      });
    },
    async listProjectWork(projectId: string, input: PageQuery) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: workItem.createdAt })
            .from(workItem)
            .where(
              and(
                eq(workItem.id, input.cursor),
                or(
                  eq(workItem.projectId, projectId),
                  sql`exists (select 1 from work_project_link context where context.work_item_id = ${workItem.id} and context.project_id = ${projectId}::uuid and context.lifecycle = 'active')`,
                ),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({ item: workItem, context: workProjectLink })
        .from(workItem)
        .leftJoin(
          workProjectLink,
          and(
            eq(workProjectLink.workItemId, workItem.id),
            eq(workProjectLink.projectId, projectId),
            eq(workProjectLink.lifecycle, "active"),
          ),
        )
        .where(
          and(
            or(
              eq(workItem.projectId, projectId),
              isNotNull(workProjectLink.id),
            ),
            anchor
              ? sql`(${workItem.createdAt}, ${workItem.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(workItem.createdAt), desc(workItem.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(({ item, context }) => workRecord(item, context)),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.item.id ?? null) : null,
      };
    },
    async listProjectKnowledge(projectId: string, input: PageQuery) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: knowledgeItem.createdAt })
            .from(knowledgeItem)
            .where(
              and(
                eq(knowledgeItem.id, input.cursor),
                or(
                  eq(knowledgeItem.projectId, projectId),
                  sql`exists (select 1 from knowledge_project_link context where context.knowledge_item_id = ${knowledgeItem.id} and context.project_id = ${projectId}::uuid and context.lifecycle = 'active')`,
                ),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
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
          and(
            or(
              eq(knowledgeItem.projectId, projectId),
              isNotNull(knowledgeProjectLink.id),
            ),
            anchor
              ? sql`(${knowledgeItem.createdAt}, ${knowledgeItem.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(knowledgeItem.createdAt), desc(knowledgeItem.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(({ item, context }) => knowledgeRecord(item, context)),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.item.id ?? null) : null,
      };
    },
    async listWork(
      input: PageQuery & {
        projectId?: string | undefined;
      } & WorkFocus,
    ) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: workItem.createdAt })
            .from(workItem)
            .where(
              and(
                eq(workItem.id, input.cursor),
                input.projectId
                  ? or(
                      eq(workItem.projectId, input.projectId),
                      sql`exists (select 1 from work_project_link context where context.work_item_id = ${workItem.id} and context.project_id = ${input.projectId}::uuid and context.lifecycle = 'active')`,
                    )
                  : undefined,
                workFocusPredicate(input),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({
          item: workItem,
          projectName: project.name,
          context: workProjectLink,
        })
        .from(workItem)
        .innerJoin(project, eq(workItem.projectId, project.id))
        .leftJoin(
          workProjectLink,
          and(
            eq(workProjectLink.workItemId, workItem.id),
            input.projectId
              ? eq(workProjectLink.projectId, input.projectId)
              : sql`false`,
            eq(workProjectLink.lifecycle, "active"),
          ),
        )
        .where(
          and(
            input.projectId
              ? or(
                  eq(workItem.projectId, input.projectId),
                  isNotNull(workProjectLink.id),
                )
              : undefined,
            workFocusPredicate(input),
            anchor
              ? sql`(${workItem.createdAt}, ${workItem.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(workItem.createdAt), desc(workItem.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(({ item, projectName, context }) => ({
          ...workRecord(item, input.projectId ? context : undefined),
          projectName,
        })),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.item.id ?? null) : null,
      };
    },
    async listKnowledge(
      input: PageQuery & {
        projectId?: string | undefined;
        kind?: typeof knowledgeItem.$inferSelect.kind | undefined;
      },
    ) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: knowledgeItem.createdAt })
            .from(knowledgeItem)
            .where(
              and(
                eq(knowledgeItem.id, input.cursor),
                input.kind ? eq(knowledgeItem.kind, input.kind) : undefined,
                input.projectId
                  ? or(
                      eq(knowledgeItem.projectId, input.projectId),
                      sql`exists (select 1 from knowledge_project_link context where context.knowledge_item_id = ${knowledgeItem.id} and context.project_id = ${input.projectId}::uuid and context.lifecycle = 'active')`,
                    )
                  : undefined,
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({
          item: knowledgeItem,
          projectName: project.name,
          context: knowledgeProjectLink,
        })
        .from(knowledgeItem)
        .innerJoin(project, eq(knowledgeItem.projectId, project.id))
        .leftJoin(
          knowledgeProjectLink,
          and(
            eq(knowledgeProjectLink.knowledgeItemId, knowledgeItem.id),
            input.projectId
              ? eq(knowledgeProjectLink.projectId, input.projectId)
              : sql`false`,
            eq(knowledgeProjectLink.lifecycle, "active"),
          ),
        )
        .where(
          and(
            input.projectId
              ? or(
                  eq(knowledgeItem.projectId, input.projectId),
                  isNotNull(knowledgeProjectLink.id),
                )
              : undefined,
            input.kind ? eq(knowledgeItem.kind, input.kind) : undefined,
            anchor
              ? sql`(${knowledgeItem.createdAt}, ${knowledgeItem.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(knowledgeItem.createdAt), desc(knowledgeItem.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(({ item, projectName, context }) => ({
          ...knowledgeRecord(item, input.projectId ? context : undefined),
          projectName,
        })),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.item.id ?? null) : null,
      };
    },
    async search(input: PageQuery & { q: string; projectId?: string }) {
      const scope = input.projectId
        ? sql`project_id = ${input.projectId}::uuid`
        : sql`true`;
      const resourceScope = input.projectId
        ? sql`exists (
            select 1 from project_resource_link link
            where link.resource_id = resource.id
              and link.project_id = ${input.projectId}::uuid
              and link.lifecycle = 'active'
          )`
        : sql`true`;
      const domainScope = input.projectId
        ? sql`exists (
            select 1 from project_domain_link link
            where link.domain_id = domain.id
              and link.project_id = ${input.projectId}::uuid
              and link.lifecycle = 'active'
          )`
        : sql`true`;
      const systemScope = input.projectId
        ? sql`exists (
            select 1 from system_project_link link
            where link.system_id = modeled_system.id
              and link.project_id = ${input.projectId}::uuid
              and link.lifecycle = 'active'
          )`
        : sql`true`;
      const resourceProjectId = input.projectId
        ? sql`${input.projectId}::uuid`
        : sql`null::uuid`;
      const continuation = input.cursor
        ? sql`(created_at, id) < (select created_at, id from hits where id = ${input.cursor}::uuid)`
        : sql`true`;
      const result = await db.execute<SearchRow>(sql`
        with hits as (
          select id, 'capture'::text as kind, project_id,
            left(original_content, 100) as title,
            left(original_content, 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, created_at
          from capture
          where to_tsvector('simple', original_content) @@ websearch_to_tsquery('simple', ${input.q})
          union all
          select capture.id, 'capture'::text as kind, capture.project_id,
            capture_file.original_name as title,
            left(capture_file.original_name || ' · Original local file', 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, capture.created_at
          from capture_file
          inner join capture on capture.id = capture_file.capture_id
          where to_tsvector('simple', capture_file.original_name) @@ websearch_to_tsquery('simple', ${input.q})
          union all
          select capture.id, 'capture'::text as kind, capture.project_id,
            capture_file.original_name as title,
            left('Derived local file text: ' || derived.extracted_text, 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, capture.created_at
          from capture_file_text derived
          inner join capture on capture.id = derived.capture_id
          inner join capture_file on capture_file.capture_id = capture.id
          where capture.state = 'unfiled' and derived.status = 'extracted'
            and to_tsvector('simple', derived.extracted_text) @@ websearch_to_tsquery('simple', ${input.q})
          union all
          select id, work_type::text as kind, ${input.projectId ? sql`${input.projectId}::uuid` : sql`project_id`} as project_id, title,
            left(description, 220) as excerpt, source_capture_id, null::uuid as target_id, created_at
          from work_item
          where to_tsvector('simple', title || ' ' || description) @@ websearch_to_tsquery('simple', ${input.q})
            and ${input.projectId ? sql`(project_id = ${input.projectId}::uuid or exists (select 1 from work_project_link context where context.work_item_id = work_item.id and context.project_id = ${input.projectId}::uuid and context.lifecycle = 'active'))` : sql`true`}
          union all
          select knowledge_item.id, knowledge_item.kind, ${input.projectId ? sql`${input.projectId}::uuid` : sql`knowledge_item.project_id`} as project_id, knowledge_item.title,
            case when derived.status = 'extracted'
              and to_tsvector('simple', derived.extracted_text) @@ websearch_to_tsquery('simple', ${input.q})
              then left('Derived local file text: ' || derived.extracted_text, 220)
              else left(knowledge_item.content || ' ' || coalesce(knowledge_item.url, ''), 220)
            end as excerpt, knowledge_item.source_capture_id, null::uuid as target_id, knowledge_item.created_at
          from knowledge_item
          left join capture_file_text derived on derived.capture_id = knowledge_item.source_capture_id
          where (to_tsvector('simple', knowledge_item.title || ' ' || knowledge_item.content || ' ' || coalesce(knowledge_item.url, '')) @@ websearch_to_tsquery('simple', ${input.q})
            or (derived.status = 'extracted' and to_tsvector('simple', derived.extracted_text) @@ websearch_to_tsquery('simple', ${input.q})))
            and ${input.projectId ? sql`(project_id = ${input.projectId}::uuid or exists (select 1 from knowledge_project_link context where context.knowledge_item_id = knowledge_item.id and context.project_id = ${input.projectId}::uuid and context.lifecycle = 'active'))` : sql`true`}
          union all
          select id, 'comment'::text as kind, project_id, 'Work comment'::text as title,
            left(body, 220) as excerpt, null::uuid as source_capture_id, work_item_id as target_id, created_at
          from work_item_comment
          where to_tsvector('simple', body) @@ websearch_to_tsquery('simple', ${input.q})
          union all
          select id, 'decision'::text as kind, project_id, question as title,
            left(outcome || ' ' || rationale, 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, created_at
          from project_decision
          where to_tsvector('simple', question || ' ' || outcome || ' ' || rationale) @@ websearch_to_tsquery('simple', ${input.q})
          union all
          select domain.id, 'domain'::text as kind, ${resourceProjectId} as project_id,
            domain.name as title, left(coalesce(domain.description, ''), 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, domain.created_at
          from domain
          where to_tsvector('simple', domain.name || ' ' || coalesce(domain.description, '')) @@ websearch_to_tsquery('simple', ${input.q})
            and ${domainScope}
          union all
          select modeled_system.id, 'system'::text as kind, ${resourceProjectId} as project_id,
            modeled_system.name as title, left(coalesce(modeled_system.summary, ''), 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, modeled_system.created_at
          from "system" as modeled_system
          where to_tsvector('simple', modeled_system.name || ' ' || coalesce(modeled_system.summary, '')) @@ websearch_to_tsquery('simple', ${input.q})
            and ${systemScope}
          union all
          select id, 'project'::text as kind, id as project_id, name as title,
            left(coalesce(summary, ''), 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, created_at
          from project
          where to_tsvector('simple', name || ' ' || coalesce(summary, '')) @@ websearch_to_tsquery('simple', ${input.q})
          union all
          select resource.id, 'resource'::text as kind,
            ${resourceProjectId} as project_id, resource.name as title,
            left(resource.kind || coalesce(' · ' || resource.subtype, ''), 220) as excerpt,
            null::uuid as source_capture_id, null::uuid as target_id, resource.created_at
          from resource
          where to_tsvector('simple', resource.name || ' ' || resource.kind || ' ' || coalesce(resource.subtype, '')) @@ websearch_to_tsquery('simple', ${input.q})
            and ${resourceScope}
        )
        select id, kind, project_id, title, excerpt, source_capture_id, target_id, created_at
        from hits
        where ${scope} and ${continuation}
        order by created_at desc, id desc
        limit ${input.limit + 1}
      `);
      const page = result.rows.slice(0, input.limit);
      return {
        items: page.map((row) => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          excerpt: row.excerpt,
          href:
            row.kind === "capture"
              ? `/inbox?captureId=${row.id}`
              : row.kind === "resource"
                ? `/resources/${row.id}`
                : row.kind === "domain"
                  ? `/domains/${row.id}`
                  : row.kind === "system"
                    ? `/systems/${row.id}`
                    : row.kind === "project"
                      ? `/projects/${row.id}`
                      : row.kind === "task" ||
                          row.kind === "initiative" ||
                          row.kind === "subtask"
                        ? `/work-items/${row.id}`
                        : row.kind === "comment"
                          ? `/work-items/${row.target_id}#discussion`
                          : row.kind === "decision"
                            ? `/projects/${row.project_id}#decisions-heading`
                            : `/knowledge-items/${row.id}`,
          projectId: row.project_id,
          sourceCaptureId: row.source_capture_id,
          createdAt: new Date(row.created_at).toISOString(),
        })),
        nextCursor:
          result.rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
