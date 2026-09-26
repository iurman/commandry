import { describe, expect, it } from "vitest";
import {
  evaluateLocalMcpRead,
  localMcpAuditReason,
  localMcpTokenDigest,
} from "./local-mcp";

const projectId = "b81f6938-e216-4e15-bc30-c2cb7d1f857d";
const workItemId = "2fa1320c-b68d-4796-9e75-a1e256590be2";
const now = new Date("2026-09-26T10:00:00.000Z");
const session = {
  projectId,
  workItemId,
  expiresAt: "2026-09-26T10:30:00.000Z",
  revokedAt: null,
};

describe("local MCP read policy", () => {
  it("permits only the packet project, work item and read operations", () => {
    expect(
      evaluateLocalMcpRead(
        session,
        { projectId, operation: "project.brief.read" },
        now,
      ),
    ).toBe("ALLOWED");
    expect(
      evaluateLocalMcpRead(
        session,
        { projectId, workItemId, operation: "work.read" },
        now,
      ),
    ).toBe("ALLOWED");
    expect(
      evaluateLocalMcpRead(
        session,
        { projectId: crypto.randomUUID(), operation: "project.brief.read" },
        now,
      ),
    ).toBe("PROJECT_SCOPE_DENIED");
    expect(
      evaluateLocalMcpRead(
        session,
        { projectId, workItemId: crypto.randomUUID(), operation: "work.read" },
        now,
      ),
    ).toBe("WORK_SCOPE_DENIED");
    expect(
      evaluateLocalMcpRead(
        session,
        { projectId, operation: "resource.restart" },
        now,
      ),
    ).toBe("OPERATION_DENIED");
  });

  it("closes at expiry or revocation and does not retain supplied secrets", () => {
    expect(
      evaluateLocalMcpRead(
        session,
        { projectId, operation: "project.brief.read" },
        new Date(session.expiresAt),
      ),
    ).toBe("SESSION_EXPIRED");
    expect(
      evaluateLocalMcpRead(
        { ...session, revokedAt: now.toISOString() },
        { projectId, operation: "project.brief.read" },
        now,
      ),
    ).toBe("SESSION_REVOKED");
    expect(localMcpAuditReason("Bearer sk_secret")).not.toContain("sk_secret");
    expect(localMcpTokenDigest("mcp_example")).toMatch(/^[0-9a-f]{64}$/);
    expect(localMcpTokenDigest("mcp_example")).not.toContain("mcp_example");
  });
});
