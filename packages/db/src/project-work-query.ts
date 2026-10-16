import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { FoundationError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { workItem, workProjectLink } from "./schema";

export function canonicalWorkRecord(
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

export async function listCanonicalProjectWork(
  db: Pick<CommandryDatabase, "select">,
  projectId: string,
  input: { limit: number; cursor?: string | undefined },
  options: { requireValidCursor?: boolean } = {},
) {
  const [anchor] = input.cursor
    ? await db
        .select({ createdAt: sql<string>`${workItem.createdAt}::text` })
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
  if (input.cursor && !anchor) {
    if (options.requireValidCursor)
      throw new FoundationError(
        "INVALID_REFERENCE",
        "Work cursor unavailable in this project",
      );
    return { items: [], nextCursor: null };
  }
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
        or(eq(workItem.projectId, projectId), isNotNull(workProjectLink.id)),
        anchor
          ? sql`(${workItem.createdAt}, ${workItem.id}) < (${anchor.createdAt}::timestamptz, ${input.cursor}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(workItem.createdAt), desc(workItem.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  return {
    items: page.map(({ item, context }) => canonicalWorkRecord(item, context)),
    nextCursor:
      rows.length > input.limit ? (page.at(-1)?.item.id ?? null) : null,
  };
}
