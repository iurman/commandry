// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SimulatedApprovalAuditView,
  SimulatedApprovalView,
} from "@commandry/ui";
import ApprovalWorkspace from "./ApprovalWorkspace";

const at = "2026-09-25T10:00:00.000Z";
const approvalId = "b5ad2eb9-038b-467f-ac2f-efb11d62391d";
const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const resourceId = "92fa3fe6-c2db-43a8-9e10-647662e77ae5";
const linkId = "d3e9650f-0877-4e13-b7a7-7d4b96f1aff6";
const digest = "b".repeat(64);

const pending: SimulatedApprovalView = {
  id: approvalId,
  occurrenceId: "817b0a61-972a-4c24-bc0b-7694e8203c38",
  requestFingerprint: "a".repeat(64),
  descriptorDigest: digest,
  descriptor: {
    schemaVersion: "simulated-resource-restart/v1",
    actionType: "simulated.resource.restart",
    intendedActor: {
      agentId: "8f24f301-47fa-4ca8-8492-4264993c5025",
      runId: "3a11e8b9-97df-4831-924e-12d1e786775d",
    },
    proposedBy: "local-reviewer:unattributed",
    packet: {
      id: "96aa7133-d53d-41e4-af33-9fecc2b91721",
      version: 2,
      digest: "c".repeat(64),
    },
    target: { projectId, resourceId, projectResourceLinkId: linkId },
    parameters: { mode: "graceful" },
    reason:
      "Demonstrate approval review for a synthetic local resource restart.",
    expectedResult:
      "Record a no-effect local simulation; resource state does not change.",
    risk: "sensitive",
    requiredCapability: "infrastructure.restart",
    policy: {
      automaticCeiling: "reversible",
      approvalRequired: true,
      grantScope: "simulation_only",
    },
    reversibility: {
      isApplicable: false,
      explanation: "No real change is made; rollback is not applicable.",
    },
    expiresAt: "2099-09-25T11:00:00.000Z",
    sourceLabel: "Synthetic local action proposal",
    isSynthetic: true,
    externalActions: [],
  },
  state: "pending",
  decision: null,
  outcome: null,
  createdAt: at,
  updatedAt: at,
};

const proposed: SimulatedApprovalAuditView = {
  id: "6fe8091e-a4dd-4dab-bd31-5c7bc1862ed4",
  approvalId,
  eventType: "proposed",
  actor: "local-reviewer:unattributed",
  occurrenceId: pending.occurrenceId,
  detail: "Exact proposal recorded",
  createdAt: at,
};
const recorded: SimulatedApprovalAuditView = {
  id: "4cb80f14-1dfb-4815-9813-7ba660a6d0ad",
  approvalId,
  eventType: "simulation_recorded",
  actor: "local-worker",
  occurrenceId: null,
  detail: "No-effect outcome recorded",
  createdAt: "2026-09-25T10:03:02.000Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("exact local approval review", () => {
  it("shows the fixed descriptor, approves its digest, and continues audit history", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "cdb88224-97a5-4749-99f8-c1e531a5d924",
    });
    let current = pending;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === `/api/v1/approvals/${approvalId}`) return json(current);
      if (path === `/api/v1/projects/${projectId}`)
        return json({ id: projectId, name: "Harbor operations" });
      if (path === `/api/v1/resources/${resourceId}`)
        return json({
          id: resourceId,
          name: "Local test service",
          externalUrl: "https://source.invalid/?token=not-for-review",
        });
      if (path.startsWith(`/api/v1/approvals/${approvalId}/audit`))
        return json(
          path.includes("cursor=")
            ? { items: [recorded], nextCursor: null }
            : { items: [proposed], nextCursor: "next-event" },
        );
      if (
        path === `/api/v1/approvals/${approvalId}/decisions` &&
        init?.method === "POST"
      ) {
        current = {
          ...pending,
          state: "approved",
          decision: {
            kind: "approve",
            actor: "local-reviewer:unattributed",
            occurrenceId: "cdb88224-97a5-4749-99f8-c1e531a5d924",
            decidedAt: "2026-09-25T10:03:00.000Z",
          },
          outcome: {
            kind: "simulated_only",
            verificationStatus: "unverified",
            externalActions: [],
            resourceStateChanged: false,
            recordedAt: "2026-09-25T10:03:02.000Z",
            summary:
              "Synthetic local restart simulation recorded. No external action occurred and resource state did not change.",
          },
        };
        return json(current);
      }
      return json({ message: "Unexpected request" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalWorkspace approvalId={approvalId} />);
    expect(
      await screen.findByRole("heading", {
        name: "Simulated resource restart",
      }),
    ).toBeTruthy();
    expect(await screen.findByText("Harbor operations")).toBeTruthy();
    expect(screen.getByText("Local test service")).toBeTruthy();
    expect(screen.getByText("mode=graceful")).toBeTruthy();
    expect(screen.getAllByText(digest).length).toBeGreaterThan(0);
    expect(screen.getByText("infrastructure.restart")).toBeTruthy();
    expect(
      screen.getByText("Approval required above local automatic ceiling"),
    ).toBeTruthy();
    expect(
      screen.getByText("Synthetic review. No external effect."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("not-for-review");
    const audit = screen.getByRole("region", {
      name: "Approval audit history",
    });
    expect(
      await within(audit).findByText("Exact proposal recorded"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Load more approval events" }),
    );
    expect(
      await within(audit).findByText("No-effect outcome recorded"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Approve local simulation" }),
    );
    expect(
      await screen.findByText(
        "Synthetic local restart simulation recorded. No external action occurred and resource state did not change.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Approve local simulation" })
        .hasAttribute("disabled"),
    ).toBe(true);
    const request = fetchMock.mock.calls.find(
      (call) =>
        call[0] === `/api/v1/approvals/${approvalId}/decisions` &&
        call[1]?.method === "POST",
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      decision: "approve",
      expectedDigest: digest,
      occurrenceId: "cdb88224-97a5-4749-99f8-c1e531a5d924",
    });
  });

  it("reloads stale state after a decision conflict and closes terminal controls", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "cdb88224-97a5-4749-99f8-c1e531a5d924",
    });
    let latest = pending;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === `/api/v1/approvals/${approvalId}`) return json(latest);
        if (path.startsWith(`/api/v1/approvals/${approvalId}/audit`))
          return json({ items: [proposed], nextCursor: null });
        if (
          path === `/api/v1/approvals/${approvalId}/decisions` &&
          init?.method === "POST"
        ) {
          latest = {
            ...pending,
            state: "rejected",
            decision: {
              kind: "reject",
              actor: "local-reviewer:unattributed",
              occurrenceId: "770e775c-459b-4110-a51b-d6a9f4b88d52",
              decidedAt: "2026-09-25T10:04:00.000Z",
            },
          };
          return json(
            { code: "DECISION_CONFLICT", message: "Already decided" },
            409,
          );
        }
        return json({ message: "Unavailable" }, 404);
      }),
    );
    render(<ApprovalWorkspace approvalId={approvalId} />);
    const approve = await screen.findByRole("button", {
      name: "Approve local simulation",
    });
    fireEvent.click(approve);
    expect(await screen.findByText(/Already decided/)).toBeTruthy();
    await waitFor(() => expect(approve.hasAttribute("disabled")).toBe(true));
    expect(
      screen.getByText(
        "This proposal is rejected. Decision controls are closed.",
      ),
    ).toBeTruthy();
  });
});
