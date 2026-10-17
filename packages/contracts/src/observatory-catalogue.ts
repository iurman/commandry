import { z } from "zod";
import {
  observatoryMetadataSchema,
  observatoryProvenanceSchema,
  observatoryProviderDependencySchema,
  observatoryRelationSchema,
  observatoryRequirementSchema,
} from "./observatory";
import { observatorySourceBindingChangeSchema } from "./observatory-management";
import { observatorySceneQuerySchema } from "./observatory-queries";

// Canonical row identities retain their recorded spelling; public query UUIDs use
// the same normalization as the existing scene query.
const identity = z.uuid();
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0);
const provenance = observatoryProvenanceSchema.refine(
  (value) =>
    value.evidenceRefs.every((reference) => reference.trim().length > 0),
  "Evidence references must not be blank",
);
export const observatoryCatalogueKindSchema = z.enum([
  "annotation",
  "relation",
  "provider",
  "source",
]);
export const observatoryCatalogueQuerySchema =
  observatorySceneQuerySchema.extend({
    kind: observatoryCatalogueKindSchema,
    resourceId: observatorySceneQuerySchema.shape.projectId,
  });
export const observatoryAnnotationCatalogueItemSchema = z
  .strictObject({
    kind: z.literal("annotation"),
    id: identity,
    resourceId: identity,
    version,
    metadata: observatoryMetadataSchema.extend({ provenance }),
    requirement: observatoryRequirementSchema.shape.role,
  })
  .refine(
    (value) =>
      value.id === value.resourceId &&
      value.metadata.resourceId === value.resourceId,
    "Annotation identity must match its resource",
  );
export const observatoryRelationCatalogueItemSchema = z
  .strictObject({
    kind: z.literal("relation"),
    id: identity,
    sourceId: identity,
    targetId: identity,
    version,
    active: z.boolean(),
    record: observatoryRelationSchema.safeExtend({ provenance }),
  })
  .refine(
    (value) =>
      value.record.id === value.id &&
      value.record.sourceId === value.sourceId &&
      value.record.targetId === value.targetId,
    "Relation identity and endpoints must match the record",
  );
export const observatoryProviderCatalogueItemSchema = z
  .strictObject({
    kind: z.literal("provider"),
    id: identity,
    resourceId: identity,
    providerResourceId: identity,
    version,
    active: z.boolean(),
    feedId: z.literal("cloudflare"),
    componentId: text(200),
    record: observatoryProviderDependencySchema.extend({ provenance }),
  })
  .refine(
    (value) =>
      value.record.id === value.id &&
      value.record.resourceId === value.resourceId &&
      value.record.providerId === value.providerResourceId &&
      value.record.product === value.componentId,
    "Provider mapping identity, endpoints and component must match the record",
  );
export const observatorySourceCatalogueItemSchema = z
  .strictObject({
    kind: z.literal("source"),
    id: identity,
    resourceId: identity,
    projectId: identity.nullable(),
    environment: text(100).nullable(),
    version,
    sourceKind: observatorySourceBindingChangeSchema.shape.kind,
    externalId: text(250),
    enabled: z.boolean(),
    freshnessSeconds:
      observatorySourceBindingChangeSchema.shape.freshnessSeconds,
    provenance,
  })
  .refine((value) => {
    // This is the reviewed binding syntax, applied without rewriting stored text.
    return value.sourceKind === "github-repository"
      ? /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.externalId) &&
          !value.externalId
            .split("/")
            .some((part) => part === "." || part === "..")
      : /^[A-Za-z0-9_-]+$/.test(value.externalId);
  }, "Invalid source identity");
export const observatoryCatalogueItemSchema = z.discriminatedUnion("kind", [
  observatoryAnnotationCatalogueItemSchema,
  observatoryRelationCatalogueItemSchema,
  observatoryProviderCatalogueItemSchema,
  observatorySourceCatalogueItemSchema,
]);
const envelope = {
  schemaVersion: z.literal(1),
  scopeDigest: text(500),
  projectionRevision: text(500),
  completeness: z.literal("complete"),
};
export const observatoryCatalogueResultSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...envelope,
      kind: z.literal("annotation"),
      items: z.array(observatoryAnnotationCatalogueItemSchema),
    }),
    z.strictObject({
      ...envelope,
      kind: z.literal("relation"),
      items: z.array(observatoryRelationCatalogueItemSchema),
    }),
    z.strictObject({
      ...envelope,
      kind: z.literal("provider"),
      items: z.array(observatoryProviderCatalogueItemSchema),
    }),
    z.strictObject({
      ...envelope,
      kind: z.literal("source"),
      items: z.array(observatorySourceCatalogueItemSchema),
    }),
  ])
  .refine(
    (value) =>
      value.items.every(
        (item, index) =>
          index === 0 || value.items[index - 1]!.id.localeCompare(item.id) < 0,
      ),
    "Catalogue identities must be unique and sorted",
  );

export type ObservatoryCatalogueQuery = z.infer<
  typeof observatoryCatalogueQuerySchema
>;
export type ObservatoryCatalogueItem = z.infer<
  typeof observatoryCatalogueItemSchema
>;
export type ObservatoryCatalogueResult = z.infer<
  typeof observatoryCatalogueResultSchema
>;
