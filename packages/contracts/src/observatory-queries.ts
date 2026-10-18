import { z } from "zod";
import {
  observatoryCapacityObservationSchema,
  observatoryAccessSchema,
  observatoryFacetAccessSchema,
  observatoryFacetSchema,
  observatoryGroupingSchema,
  observatoryProviderExposureSchema,
  observatoryRelationSchema,
  observatorySignalSchema,
  observatorySourceObservationSchema,
  observatorySceneSchema,
} from "./observatory";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const identity = z.uuid().toLowerCase();
const uniqueIds = z
  .array(identity)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate identity");
const representationIds = z
  .array(text(1000))
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Duplicate representation",
  );
export const observatorySectorSchema = z.strictObject({
  id: text(100),
  label: text(100),
  resourceIds: uniqueIds,
  grouping: observatoryGroupingSchema.exclude(["custom"]),
});
const sectors = z
  .array(observatorySectorSchema)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Duplicate sector identity",
  );
export const observatorySceneQuerySchema = z.strictObject({
  schemaVersion: z.literal(1).default(1),
  projectId: identity.optional(),
  grouping: observatoryGroupingSchema.default("operational"),
  environment: text(100).nullable().default(null),
  expandedRepresentationIds: representationIds.default([]),
  /** "members" reveals nested members within the shared budget; "groups"
   * shows root groups and only explicitly expanded members. */
  reveal: z.enum(["members", "groups"]).default("members"),
  search: z.string().trim().max(500).default(""),
  sectors: sectors.default([]),
  viewRevision: text(200).default("1"),
});
export const observatoryMembershipQuerySchema =
  observatorySceneQuerySchema.extend({
    groupId: text(1000),
    scopeDigest: text(500),
    projectionRevision: text(500),
    limit: z.number().int().min(1).max(100).default(25),
    cursor: text(4000).nullable().default(null),
  });
export const observatoryRelationsQuerySchema =
  observatorySceneQuerySchema.extend({ resourceId: identity.optional() });
export const observatorySignalEvidenceQuerySchema =
  observatorySceneQuerySchema.extend({
    resourceId: identity,
    facet: observatoryFacetSchema,
    signalId: text(1000).optional(),
  });
export const observatoryProviderExplanationQuerySchema =
  observatorySceneQuerySchema.extend({
    resourceId: identity,
    noticeId: text(1000).optional(),
  });

/** Display data only. It never writes canonical mapping or authorizes a resource. */
export const observatoryViewConfigurationSchema = z.strictObject({
  schemaVersion: z.literal(2),
  grouping: observatoryGroupingSchema.default("operational"),
  environment: text(100).nullable().default(null),
  sectors: sectors.default([]),
  palette: z
    .record(text(100), z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .default({}),
  palettePreset: z.enum(["semantic", "ocean", "earth"]).default("semantic"),
  /** Canonical resource ID -> chosen badge icon key; a resource without an
   * entry uses its automatic icon. Views saved before this field omit it, and
   * applying them leaves a device's own choices unchanged. Clients apply only
   * keys in their vendored icon set; a choice is presentation, never a
   * mapping, role or permission. */
  icons: z
    .record(z.uuid(), z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/))
    .refine(
      (value) => Object.keys(value).length <= 1000,
      "At most 1000 icon choices",
    )
    .optional(),
  ambient: z.boolean().default(false),
  textScale: z
    .union([z.literal(1), z.literal(1.25), z.literal(1.5)])
    .default(1),
  paused: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  sizeBasis: z.enum(["services", "ram", "uniform"]).default("services"),
  camera: z.enum(["composed", "manual", "orbit", "tour"]).default("composed"),
  lens: z.boolean().default(false),
  theme: z.enum(["system", "porcelain", "midnight"]).default("system"),
  labels: z.boolean().default(true),
  tv: z.boolean().default(false),
  motion: z.boolean().default(true),
});
export const observatoryNamedViewCreateSchema = z.strictObject({
  projectId: identity.optional(),
  name: text(100),
  expectedVersion: z.literal(0),
  configuration: observatoryViewConfigurationSchema,
});
export const observatoryNamedViewUpdateSchema = z.strictObject({
  viewId: identity,
  expectedVersion: z.number().int().positive(),
  name: text(100),
  configuration: observatoryViewConfigurationSchema,
});

const envelope = z.strictObject({
  schemaVersion: z.literal(1),
  scopeDigest: text(500),
  projectionRevision: text(500),
  completeness: z.literal("complete"),
});
export const observatorySceneReadResultSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    scene: observatorySceneSchema,
    facetAccess: z.array(observatoryFacetAccessSchema),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.scene.membershipIndex.resourceIds);
    const keys = value.facetAccess.map(
      (item) => `${item.resourceId}:${item.facet}`,
    );
    if (
      keys.length !== ids.size * observatoryFacetSchema.options.length ||
      new Set(keys).size !== keys.length ||
      value.facetAccess.some((item) => !ids.has(item.resourceId))
    )
      context.addIssue({
        code: "custom",
        message: "Incomplete or foreign facet access disclosure",
      });
  });
export const observatoryRelationsResultSchema = envelope.extend({
  items: z.array(observatoryRelationSchema),
});
export const observatorySignalEvidenceResultSchema = envelope
  .extend({
    resourceId: identity,
    facet: observatoryFacetSchema,
    access: observatoryAccessSchema,
    signals: z.array(observatorySignalSchema),
    sourceObservations: z.array(observatorySourceObservationSchema),
    capacityObservations: z.array(observatoryCapacityObservationSchema),
  })
  .superRefine((value, context) => {
    if (
      value.signals.some(
        (signal) =>
          signal.resourceId !== value.resourceId ||
          signal.facet !== value.facet,
      ) ||
      value.sourceObservations.some(
        (source) => source.resourceId !== value.resourceId,
      ) ||
      value.capacityObservations.some(
        (metric) => metric.resourceId !== value.resourceId,
      ) ||
      (value.facet !== "telemetry" && value.sourceObservations.length > 0) ||
      (value.facet !== "capacity" && value.capacityObservations.length > 0)
    )
      context.addIssue({
        code: "custom",
        message: "Evidence subject or facet mismatch",
      });
  });
export const observatoryProviderExplanationResultSchema = envelope
  .extend({
    resourceId: identity,
    items: z.array(observatoryProviderExposureSchema),
  })
  .refine(
    (value) =>
      value.items.every((item) => item.resourceId === value.resourceId),
    "Provider explanation subject mismatch",
  );

export type ObservatorySceneQuery = z.infer<typeof observatorySceneQuerySchema>;
export type ObservatorySceneReadResult = z.infer<
  typeof observatorySceneReadResultSchema
>;
export type ObservatoryMembershipQuery = z.infer<
  typeof observatoryMembershipQuerySchema
>;
export type ObservatoryRelationsQuery = z.infer<
  typeof observatoryRelationsQuerySchema
>;
export type ObservatorySignalEvidenceQuery = z.infer<
  typeof observatorySignalEvidenceQuerySchema
>;
export type ObservatoryProviderExplanationQuery = z.infer<
  typeof observatoryProviderExplanationQuerySchema
>;
export type ObservatoryViewConfiguration = z.infer<
  typeof observatoryViewConfigurationSchema
>;
export type ObservatoryNamedViewCreate = z.infer<
  typeof observatoryNamedViewCreateSchema
>;
export type ObservatoryNamedViewUpdate = z.infer<
  typeof observatoryNamedViewUpdateSchema
>;
export type ObservatoryRelationsResult = z.infer<
  typeof observatoryRelationsResultSchema
>;
export type ObservatorySignalEvidenceResult = z.infer<
  typeof observatorySignalEvidenceResultSchema
>;
export type ObservatoryProviderExplanationResult = z.infer<
  typeof observatoryProviderExplanationResultSchema
>;
