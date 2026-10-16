import { projectResourceRelationship } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { projectResourceLink, resource } from "./schema";

type Writer = Pick<CommandryDatabase, "insert">;

/** Canonical insert on exactly the supplied database or transaction. Callers
 * retain authentication, identity resolution, locks, receipts and audit. */
export async function insertCanonicalResource(
  writer: Writer,
  input: {
    id: string;
    kind: string;
    name: string;
    subtype?: string | null;
    externalUrl?: string | null;
    at?: Date;
  },
) {
  const [row] = await writer
    .insert(resource)
    .values({
      id: input.id,
      kind: input.kind,
      name: input.name,
      subtype: input.subtype ?? null,
      state: null,
      externalUrl: input.externalUrl ?? null,
      ...(input.at ? { createdAt: input.at, updatedAt: input.at } : {}),
    })
    .returning();
  if (!row) throw new Error("Resource insert returned no row");
  return row;
}

/** A duplicate includes archived connections. This helper never reactivates or
 * edits one; callers must inspect the actual canonical row after a conflict. */
export function insertCanonicalProjectResourceLink(
  writer: Writer,
  input: {
    id: string;
    projectId: string;
    resourceId: string;
    type: "supports" | "relates_to";
    sourceKind: "project" | "resource";
    targetKind: "project" | "resource";
    provenance?: "manual" | "foundation-onboarding";
    at?: Date;
  },
) {
  const definition = projectResourceRelationship(input.type);
  if (
    input.sourceKind !== definition.sourceKind ||
    input.targetKind !== definition.targetKind
  )
    throw new Error("Relationship direction does not match its type");
  return writer
    .insert(projectResourceLink)
    .values({
      id: input.id,
      projectId: input.projectId,
      resourceId: input.resourceId,
      type: input.type,
      sourceKind: input.sourceKind,
      targetKind: input.targetKind,
      lifecycle: "active",
      provenance: input.provenance ?? "manual",
      ...(input.at ? { createdAt: input.at } : {}),
    })
    .onConflictDoNothing({
      target: [
        projectResourceLink.projectId,
        projectResourceLink.resourceId,
        projectResourceLink.type,
      ],
    })
    .returning({ id: projectResourceLink.id });
}
