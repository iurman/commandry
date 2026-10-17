import { z } from "zod";
import {
  observatoryMetadataSchema,
  observatoryProviderDependencySchema,
  observatoryRelationSchema,
  observatoryRequirementSchema,
} from "./observatory";

const id = z.uuid().toLowerCase();
const expectedVersion = z.number().int().nonnegative();
const review = z.strictObject({
  evidenceRefs: z
    .array(
      z
        .string()
        .min(1)
        .max(2000)
        .refine(
          (value) => value.trim().length > 0,
          "Evidence reference must not be blank",
        ),
    )
    .min(1),
  note: z.string().trim().min(1).max(4000),
});
export const observatoryAnnotationChangeSchema = z.strictObject({
  expectedVersion,
  resourceId: id,
  role: observatoryMetadataSchema.shape.role,
  pinned: z.boolean(),
  environment: z.string().trim().min(1).max(100).nullable(),
  requirement: observatoryRequirementSchema.shape.role,
  review,
});
export const observatoryRelationChangeSchema = z
  .strictObject({
    expectedVersion,
    id,
    relation: z.strictObject({
      id: observatoryRelationSchema.shape.id,
      type: observatoryRelationSchema.shape.type,
      sourceId: observatoryRelationSchema.shape.sourceId,
      targetId: observatoryRelationSchema.shape.targetId,
      sourceKind: observatoryRelationSchema.shape.sourceKind,
      targetKind: observatoryRelationSchema.shape.targetKind,
      environment: observatoryRelationSchema.shape.environment,
    }),
    active: z.boolean(),
    review,
  })
  .refine(
    (value) => value.id === value.relation.id,
    "Relation identity must match",
  );
export const observatoryProviderMappingChangeSchema = z
  .strictObject({
    expectedVersion,
    id,
    dependency: observatoryProviderDependencySchema.omit({ provenance: true }),
    feedId: z.literal("cloudflare"),
    componentId: z.string().trim().min(1).max(200),
    active: z.boolean(),
    review,
  })
  .refine(
    (value) => value.id === value.dependency.id,
    "Mapping identity must match",
  );
export const observatoryClientScopeChangeSchema = z.strictObject({
  clientId: id,
  expectedVersion,
  resourceIds: z
    .array(id)
    .refine(
      (values) => new Set(values).size === values.length,
      "Duplicate resource",
    ),
  review,
});
export const observatorySourceBindingChangeSchema = z
  .strictObject({
    id,
    expectedVersion,
    resourceId: id,
    projectId: id,
    environment: z.string().trim().min(1).max(100).nullable(),
    kind: z.enum(["infraagent-monitor", "github-repository"]),
    externalId: z.string().trim().min(1).max(250),
    enabled: z.boolean(),
    freshnessSeconds: z.number().int().min(30).max(86400),
    review,
  })
  .superRefine((value, context) => {
    const valid =
      value.kind === "github-repository"
        ? /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.externalId) &&
          !value.externalId
            .split("/")
            .some((part) => part === "." || part === "..")
        : /^[A-Za-z0-9_-]+$/.test(value.externalId);
    if (!valid)
      context.addIssue({
        code: "custom",
        message: "Invalid source identity",
        path: ["externalId"],
      });
  });
export type ObservatoryAnnotationChange = z.infer<
  typeof observatoryAnnotationChangeSchema
>;
export type ObservatoryRelationChange = z.infer<
  typeof observatoryRelationChangeSchema
>;
export type ObservatoryProviderMappingChange = z.infer<
  typeof observatoryProviderMappingChangeSchema
>;
export type ObservatoryClientScopeChange = z.infer<
  typeof observatoryClientScopeChangeSchema
>;
export type ObservatorySourceBindingChange = z.infer<
  typeof observatorySourceBindingChangeSchema
>;
