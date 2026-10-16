import { and, eq, gt } from "drizzle-orm";
import {
  FoundationError,
  projectResourceRelationship,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { projectResourceLink, resource } from "./schema";

export function canonicalResourceSummary(row: typeof resource.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    subtype: row.subtype,
    parentResourceId: row.parentResourceId,
    state: row.state,
    externalUrl: row.externalUrl,
    lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
  };
}

export async function listCanonicalProjectResources(
  db: Pick<CommandryDatabase, "select">,
  projectId: string,
  input: { limit: number; cursor?: string | undefined },
  options: { requireValidCursor?: boolean } = {},
) {
  if (options.requireValidCursor && input.cursor) {
    const [anchor] = await db
      .select({ id: projectResourceLink.id })
      .from(projectResourceLink)
      .where(
        and(
          eq(projectResourceLink.id, input.cursor),
          eq(projectResourceLink.projectId, projectId),
          eq(projectResourceLink.lifecycle, "active"),
        ),
      )
      .limit(1);
    if (!anchor)
      throw new FoundationError(
        "INVALID_REFERENCE",
        "Resource cursor unavailable in this project; restart traversal",
      );
  }
  const rows = await db
    .select({ link: projectResourceLink, resource })
    .from(projectResourceLink)
    .innerJoin(resource, eq(projectResourceLink.resourceId, resource.id))
    .where(
      and(
        eq(projectResourceLink.projectId, projectId),
        eq(projectResourceLink.lifecycle, "active"),
        input.cursor ? gt(projectResourceLink.id, input.cursor) : undefined,
      ),
    )
    .orderBy(projectResourceLink.id)
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  return {
    items: page.map(({ link, resource: linkedResource }) => ({
      id: link.id,
      type: link.type,
      inverseType: projectResourceRelationship(link.type).inverseType,
      resource: canonicalResourceSummary(linkedResource),
    })),
    nextCursor:
      rows.length > input.limit ? (page.at(-1)?.link.id ?? null) : null,
  };
}
