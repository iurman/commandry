import { z } from "zod";

export const resourceSummarySchema = z.object({
  id: z.uuid(),
  kind: z.string().min(1),
  name: z.string().min(1),
  subtype: z.string().nullable(),
  parentResourceId: z.uuid().nullable(),
  state: z.string().nullable(),
  externalUrl: z.url().nullable(),
  lastObservedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const projectResourceRelationshipTypeSchema = z.enum([
  "supports",
  "relates_to",
]);

export const projectResourceLinkSchema = z.object({
  id: z.uuid(),
  type: projectResourceRelationshipTypeSchema,
  inverseType: z.enum(["supported_by", "relates_to"]),
  resource: resourceSummarySchema,
});
