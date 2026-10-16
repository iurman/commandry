import { z } from "zod";
import { foundationActorSchema } from "./agent-foundation";
import { projectResourceLinkSchema, resourceSummarySchema } from "./resources";

const identity = foundationActorSchema.shape.projectId;
const datetime = foundationActorSchema.shape.expiresAt;

// Each active connection is a distinct record. A resource can have several
// connections; this projection assigns no primary project to the resource.
export const foundationProjectResourceRecordSchema = projectResourceLinkSchema
  .extend({ resource: resourceSummarySchema.strict() })
  .strict();
export type FoundationProjectResourceRecord = z.infer<
  typeof foundationProjectResourceRecordSchema
>;

export const foundationProjectResourceCursorSchema = z.strictObject({
  projectId: identity,
  afterLinkId: identity,
});
export type FoundationProjectResourceCursor = z.infer<
  typeof foundationProjectResourceCursorSchema
>;

// The endpoint injects its authenticated project. Cursor bindings grant no
// access and a live traversal has no snapshot cutoff or arbitrary filters.
export const foundationProjectResourceToolQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: foundationProjectResourceCursorSchema.nullable().default(null),
});
export type FoundationProjectResourceToolQuery = z.infer<
  typeof foundationProjectResourceToolQuerySchema
>;

export const foundationProjectResourceQuerySchema = z
  .strictObject({
    projectId: identity,
    ...foundationProjectResourceToolQuerySchema.shape,
  })
  .superRefine((query, context) => {
    if (query.cursor !== null && query.cursor.projectId !== query.projectId) {
      context.addIssue({
        code: "custom",
        path: ["cursor", "projectId"],
        message: "Cursor must belong to the requested project",
      });
    }
  });
export type FoundationProjectResourceQuery = z.infer<
  typeof foundationProjectResourceQuerySchema
>;

// This live DTO checks structure and continuation identity only. The
// application/database prove active SQL membership, ordering, grant, digest
// and freshness. selectedAt is the actual read time, not a frozen cutoff.
export const foundationProjectResourcePageSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    requestedProjectId: identity,
    consistency: z.literal("live"),
    selectedAt: datetime,
    items: z
      .array(
        z.strictObject({
          connection: foundationProjectResourceRecordSchema,
          contentDigest: z
            .string()
            .length(64)
            .regex(/^[a-f0-9]{64}$/),
        }),
      )
      .max(100),
    nextCursor: foundationProjectResourceCursorSchema.nullable(),
  })
  .superRefine((page, context) => {
    const connections = new Set<string>();
    for (const [index, { connection }] of page.items.entries()) {
      // Canonical resource/connection UUIDs preserve their spelling.
      const connectionId = connection.id.toLowerCase();
      if (connections.has(connectionId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "connection", "id"],
          message: "Duplicate connection identity",
        });
      }
      connections.add(connectionId);
    }
    if (page.nextCursor !== null) {
      if (page.nextCursor.projectId !== page.requestedProjectId) {
        context.addIssue({
          code: "custom",
          path: ["nextCursor", "projectId"],
          message: "Continuation must belong to the requested project",
        });
      }
      const lastConnection = page.items.at(-1)?.connection;
      if (
        lastConnection === undefined ||
        page.nextCursor.afterLinkId !== lastConnection.id.toLowerCase()
      ) {
        context.addIssue({
          code: "custom",
          path: ["nextCursor", "afterLinkId"],
          message: "Continuation must refer to the last returned connection",
        });
      }
    }
  });
export type FoundationProjectResourcePage = z.infer<
  typeof foundationProjectResourcePageSchema
>;
