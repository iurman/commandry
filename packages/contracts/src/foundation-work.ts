import { z } from "zod";
import {
  foundationActorSchema,
  foundationEvidenceInputSchema,
} from "./agent-foundation";
import { workItemSchema } from "./work";

const identity = foundationActorSchema.shape.projectId;
const datetime = foundationActorSchema.shape.expiresAt;

export const foundationProjectWorkCursorSchema = z.strictObject({
  projectId: identity,
  afterId: identity,
});
export type FoundationProjectWorkCursor = z.infer<
  typeof foundationProjectWorkCursorSchema
>;

// The endpoint injects its authenticated project, then validates the full query.
// A cursor's project binding never grants access to that project.
export const foundationProjectWorkToolQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: foundationProjectWorkCursorSchema.nullable().default(null),
});

export const foundationProjectWorkQuerySchema = z
  .strictObject({
    projectId: identity,
    ...foundationProjectWorkToolQuerySchema.shape,
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
export type FoundationProjectWorkQuery = z.infer<
  typeof foundationProjectWorkQuerySchema
>;

// Require the existing serializer's nullable fields without changing the UI
// contract, original text, or the Work item's actual primary project.
export const foundationProjectWorkRecordSchema = workItemSchema
  .required()
  .extend({
    contextLink: workItemSchema.shape.contextLink
      .unwrap()
      .unwrap()
      .strict()
      .nullable(),
  })
  .strict();
export type FoundationProjectWorkRecord = z.infer<
  typeof foundationProjectWorkRecordSchema
>;

// This live DTO validates project bindings and continuation structure only.
// The application/database prove active membership, grants, digests, ordering
// and exhaustion. selectedAt is a server read time, not a snapshot cutoff.
export const foundationProjectWorkPageSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    requestedProjectId: identity,
    consistency: z.literal("live"),
    selectedAt: datetime,
    items: z
      .array(
        z.strictObject({
          work: foundationProjectWorkRecordSchema,
          contentDigest:
            foundationEvidenceInputSchema.shape.contentDigest.length(64),
        }),
      )
      .max(100),
    nextCursor: foundationProjectWorkCursorSchema.nullable(),
  })
  .superRefine((page, context) => {
    const identities = new Set<string>();
    for (const [index, { work }] of page.items.entries()) {
      // Canonical Work keeps its original UUID spelling; compare identities
      // case-insensitively with the foundation's normalized project binding.
      const workId = work.id.toLowerCase();
      if (identities.has(workId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "work", "id"],
          message: "Duplicate Work identity",
        });
      }
      identities.add(workId);

      const contextProjectId = work.contextLink?.projectId.toLowerCase();
      if (
        work.contextLink !== null &&
        contextProjectId !== page.requestedProjectId
      ) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "work", "contextLink", "projectId"],
          message: "Context link must belong to the requested project",
        });
      }
      if (
        work.projectId.toLowerCase() !== page.requestedProjectId &&
        contextProjectId !== page.requestedProjectId
      ) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "work"],
          message: "Work must have primary or linked project context",
        });
      }
    }

    if (page.nextCursor !== null) {
      if (page.nextCursor.projectId !== page.requestedProjectId) {
        context.addIssue({
          code: "custom",
          path: ["nextCursor", "projectId"],
          message: "Continuation must belong to the requested project",
        });
      }
      const lastWork = page.items.at(-1)?.work;
      if (
        lastWork === undefined ||
        page.nextCursor.afterId !== lastWork.id.toLowerCase()
      ) {
        context.addIssue({
          code: "custom",
          path: ["nextCursor", "afterId"],
          message: "Continuation must refer to the last returned Work item",
        });
      }
    }
  });
export type FoundationProjectWorkPage = z.infer<
  typeof foundationProjectWorkPageSchema
>;
