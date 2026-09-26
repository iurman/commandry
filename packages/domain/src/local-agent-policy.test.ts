import { describe, expect, it } from "vitest";
import {
  evaluateLocalAgentRead,
  sanitizeLocalAgentAuditOperation,
  sanitizeLocalAgentAuditReason,
  type LocalAgentAuthorization,
} from "./local-agent-policy";

const projectId = "94b10a2d-7e32-4b8c-bfb2-241dcf359e29";
const authorization: LocalAgentAuthorization = {
  runId: "4d6d9762-7fa5-4b95-b1fc-1fd5cbdc489a",
  agentId: "910ed27d-8aa6-49e1-9755-04b97e8983a6",
  packetId: "7171173f-5512-4924-a311-c7b40ffce513",
  workItemId: "ed69458b-e8ef-4192-ac25-1fac4615552a",
  projectId,
  state: "running",
  grants: [
    {
      projectId,
      operation: "project.brief.read",
      expiresAt: "2026-09-27T11:00:00.000Z",
    },
    {
      projectId,
      operation: "work.read",
      expiresAt: "2026-09-27T11:00:00.000Z",
    },
  ],
};

describe("provisional local agent read policy", () => {
  it("allows only granted operations for the packet project before expiry", () => {
    const now = new Date("2026-09-27T10:00:00.000Z");
    expect(
      evaluateLocalAgentRead(
        authorization,
        { projectId, operation: "project.brief.read" },
        now,
      ),
    ).toBe("ALLOWED");
    expect(
      evaluateLocalAgentRead(
        authorization,
        { projectId, operation: "work.read" },
        now,
      ),
    ).toBe("ALLOWED");
    expect(
      evaluateLocalAgentRead(
        authorization,
        { projectId: crypto.randomUUID(), operation: "work.read" },
        now,
      ),
    ).toBe("PROJECT_SCOPE_DENIED");
    expect(
      evaluateLocalAgentRead(
        authorization,
        { projectId, operation: "deploy.execute" },
        now,
      ),
    ).toBe("OPERATION_DENIED");
    expect(
      evaluateLocalAgentRead(
        authorization,
        { projectId, operation: "work.read" },
        new Date("2026-09-27T11:00:00.000Z"),
      ),
    ).toBe("GRANT_EXPIRED");
    expect(
      evaluateLocalAgentRead(
        { ...authorization, state: "succeeded" },
        { projectId, operation: "work.read" },
        now,
      ),
    ).toBe("RUN_NOT_ACTIVE");
    expect(
      evaluateLocalAgentRead(
        { ...authorization, state: "succeeded" },
        { projectId: crypto.randomUUID(), operation: "work.read" },
        now,
      ),
    ).toBe("PROJECT_SCOPE_DENIED");
  });

  it("stores only bounded known reasons, never arbitrary credential-bearing text", () => {
    const sensitiveReasons = [
      "Authorization: Bearer sk_example",
      "Inspect https://host.test/path?token=abc token=SECRET123",
      "Read work with password hunter2 and arbitrary private context",
    ];
    for (const reason of sensitiveReasons) {
      expect(sanitizeLocalAgentAuditReason(reason)).toBe(
        "Manual local context read; supplied reason withheld",
      );
    }
    expect(
      sanitizeLocalAgentAuditReason(
        "Synthetic local run needs project state and evidence",
      ),
    ).toBe("Synthetic local run needs project state and evidence");
    expect(sanitizeLocalAgentAuditOperation("work.read")).toBe("work.read");
    expect(
      sanitizeLocalAgentAuditOperation("Authorization: Bearer sk_example"),
    ).toBe("unrecognized.operation");
  });
});
