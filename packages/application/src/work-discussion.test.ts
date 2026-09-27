import { describe, expect, it, vi } from "vitest";
import {
  createWorkDiscussionService,
  type WorkDiscussionPort,
} from "./work-discussion";

const workItemId = "27344514-85d1-49b7-83ca-5097d4838e18";
const projectId = "62062f66-a429-48da-a066-d1f91ade94ee";

describe("work discussion application", () => {
  it("passes a normalized append to persistence and returns its source", async () => {
    const port: WorkDiscussionPort = {
      create: vi.fn(async (_id: string, body: string) => ({
        id: crypto.randomUUID(),
        workItemId,
        projectId,
        body,
        actor: "local-user:unattributed" as const,
        sourceLabel: "Manual local work comment" as const,
        createdAt: "2026-09-26T17:00:00.000Z",
      })),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
    };
    const service = createWorkDiscussionService(port);
    const comment = await service.create(workItemId, "  Evidence reviewed.  ");
    expect(comment.body).toBe("Evidence reviewed.");
    expect(port.create).toHaveBeenCalledWith(workItemId, "Evidence reviewed.");
    await expect(service.create(workItemId, "  ")).rejects.toMatchObject({
      code: "INVALID_COMMENT",
    });
    expect(port.create).toHaveBeenCalledTimes(1);
  });
});
