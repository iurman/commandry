import { z } from "zod";

export const workItemSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceCaptureId: z.uuid(),
  generatedFromWorkItemId: z.uuid().nullable().optional(),
  title: z.string(),
  description: z.string(),
  workType: z.enum(["task", "initiative", "subtask"]).optional(),
  assigneeKind: z.enum(["unassigned", "local_user", "agent"]).optional(),
  assigneeAgentId: z.uuid().nullable().optional(),
  assigneeLabel: z.string().nullable().optional(),
  status: z.enum(["open", "done"]),
  priority: z.enum(["low", "normal", "high"]).nullable().optional(),
  dueOn: z.iso.date().nullable().optional(),
  contextLink: z
    .object({
      id: z.uuid(),
      projectId: z.uuid(),
      createdAt: z.iso.datetime({ offset: true }),
    })
    .nullable()
    .optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
