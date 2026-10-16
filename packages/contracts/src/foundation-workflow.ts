import { z } from "zod";
import {
  foundationActorSchema,
  foundationPageSchema,
} from "./agent-foundation";

/** A continuation is an opaque, scope-bound application cursor. Authorization
 * and canonical anchor membership must be checked on every page. */
export const foundationWorkflowListQuerySchema = z.strictObject({
  projectId: foundationActorSchema.shape.projectId,
  limit: foundationPageSchema.shape.limit,
  cursor: z.string().min(1).max(8192).optional(),
});
export type FoundationWorkflowListQuery = z.infer<
  typeof foundationWorkflowListQuerySchema
>;

export const foundationWorkflowListToolQuerySchema =
  foundationWorkflowListQuerySchema.omit({ projectId: true });
