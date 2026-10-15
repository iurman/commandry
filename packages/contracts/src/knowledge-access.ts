import { z } from "zod";

export const knowledgeAccessPageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
export const createKnowledgeClientSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  projectId: z.uuid(),
  ttlSeconds: z.number().int().min(60).max(604800).default(86400),
});
export const knowledgeClientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  projectId: z.uuid(),
  createdBy: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const createdKnowledgeClientSchema = z.object({
  client: knowledgeClientSchema,
  token: z.string().regex(/^ck_[A-Za-z0-9_-]{43}$/),
  notice: z.literal("Read-only project credential; shown once"),
});
export const listKnowledgeClientsSchema = z.object({
  items: z.array(knowledgeClientSchema),
  nextCursor: z.uuid().nullable(),
});
export const searchKnowledgeSchema = knowledgeAccessPageSchema.extend({
  q: z.string().trim().max(200).default(""),
});
export const readKnowledgeSchema = z.object({
  id: z.uuid(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(12000).default(8000),
});
export type KnowledgeClient = z.infer<typeof knowledgeClientSchema>;
export type CreateKnowledgeClient = z.infer<typeof createKnowledgeClientSchema>;
export type KnowledgeAccessPage = z.infer<typeof knowledgeAccessPageSchema>;
export type SearchKnowledge = z.infer<typeof searchKnowledgeSchema>;
export type ReadKnowledge = z.infer<typeof readKnowledgeSchema>;
