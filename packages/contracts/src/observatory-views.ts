import { z } from "zod";
import { observatoryViewConfigurationSchema } from "./observatory-queries";

const id = z.uuid().toLowerCase();
const projectId = id.nullable();
const name = z.string().trim().min(1).max(100);
const version = z.number().int().positive();
export const observatoryViewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  projectId,
  name,
  version,
  configuration: observatoryViewConfigurationSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});
/** Owner/session authority comes from the trusted boundary, never this payload. */
export const observatoryViewCreateSchema = z.strictObject({
  id,
  projectId: projectId.default(null),
  name,
  expectedVersion: z.literal(0),
  configuration: observatoryViewConfigurationSchema,
});
export const observatoryViewUpdateSchema = z.strictObject({
  id,
  // Required even for global views: omission must never widen a project scope.
  projectId,
  name,
  expectedVersion: version,
  configuration: observatoryViewConfigurationSchema,
});
export const observatoryViewDeleteSchema = z.strictObject({
  id,
  expectedVersion: version,
});
export const observatoryViewReadSchema = z.strictObject({ id });
/** Omitted project means all this owner's views; null means global views only. */
export const observatoryViewPageQuerySchema = z.strictObject({
  projectId: projectId.optional(),
  cursor: id.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});
export const observatoryViewPageSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    items: z.array(observatoryViewSchema).max(100),
    total: z.number().int().nonnegative(),
    nextCursor: id.nullable(),
  })
  .superRefine((page, context) => {
    if (
      new Set(page.items.map((view) => view.id)).size !== page.items.length ||
      page.items.length > page.total ||
      (page.nextCursor !== null &&
        (page.items.length === 0 ||
          page.items.length >= page.total ||
          page.items.at(-1)?.id !== page.nextCursor))
    )
      context.addIssue({
        code: "custom",
        message: "Invalid named-view continuation",
      });
  });
export const observatoryViewDeletedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  version,
  deleted: z.literal(true),
  updatedAt: z.iso.datetime({ offset: true }),
});
/** Persistence-only envelope. HTTP and MCP use observatoryViewSchema, which
 * deliberately contains neither the immutable create receipt nor a tombstone.
 */
export const observatoryViewStorageSchema = z.strictObject({
  envelopeVersion: z.literal(1),
  projectId,
  configuration: observatoryViewConfigurationSchema,
  creation: z
    .strictObject({
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      view: observatoryViewSchema,
    })
    .nullable(),
  deleted: z.boolean(),
});
export type ObservatoryViewStorage = z.infer<
  typeof observatoryViewStorageSchema
>;
export type ObservatoryView = z.infer<typeof observatoryViewSchema>;
export type ObservatoryViewCreate = z.infer<typeof observatoryViewCreateSchema>;
export type ObservatoryViewUpdate = z.infer<typeof observatoryViewUpdateSchema>;
export type ObservatoryViewDelete = z.infer<typeof observatoryViewDeleteSchema>;
export type ObservatoryViewRead = z.infer<typeof observatoryViewReadSchema>;
export type ObservatoryViewPageQuery = z.infer<
  typeof observatoryViewPageQuerySchema
>;
export type ObservatoryViewPage = z.infer<typeof observatoryViewPageSchema>;
export type ObservatoryViewDeleted = z.infer<
  typeof observatoryViewDeletedSchema
>;
