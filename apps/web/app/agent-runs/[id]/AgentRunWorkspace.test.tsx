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
import AgentRunWorkspace from "./AgentRunWorkspace";

const at = "2026-09-25T10:00:00.000Z";
const runId = "3a11e8b9-97df-4831-924e-12d1e786775d";
const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const agentId = "8f24f301-47fa-4ca8-8492-4264993c5025";
const packetId = "96aa7133-d53d-41e4-af33-9fecc2b91721";
const run = {
  id: runId,
  occurrenceId: "f68b29e9-908c-4097-b8e4-75850865e45d",
  agentId,
  packetId,
  packetVersion: 2,
  packetDigest: "a".repeat(64),
  workItemId: "ba972830-024c-4bb5-b60c-eb20256fe76d",
  projectId,
  state: "succeeded",
  attempts: 1,
  attemptHistory: [
    {
      id: "a82590fd-b714-4d85-a407-a4b83bc00101",
      number: 1,
      state: "succeeded",
      error: null,
      startedAt: at,
      completedAt: at,
    },
  ],
  grant: {
    projectId,
    operations: ["project.brief.read", "work.read"],
    expiresAt: "2026-09-25T10:30:00.000Z",
  },
  result: {
    summary: "Deterministic packet context was read. No work was performed.",
    contextReadIds: ["6e8314c0-c272-4fe4-bd11-fd1e6a2a4251"],
    evidence: [
      {
        kind: "project",
        id: projectId,
        href: `/api/v1/projects/${projectId}`,
        recordedAt: at,
        occurredAt: null,
        sourceLabel: "Synthetic lab project",
        isSynthetic: true,
      },
    ],
    runtime: "local-fake-v1",
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
  },
  error: null,
  verificationStatus: "unverified",
  runtime: "local-fake-v1",
  sourceLabel: "Synthetic local agent",
  isSynthetic: true,
  externalActions: [],
  createdAt: at,
  startedAt: at,
  completedAt: at,
};
const allowed = {
  id: "50dfa7f5-15fd-40ec-ac25-6a75a6db72b0",
  runId,
  actor: "local-fake-v1",
  operation: "project.brief.read",
  projectId,
  decision: "allowed",
  code: null,
  reason: "Read packet context",
  createdAt: at,
};
const denied = {
  id: "3d082a97-a279-4ebc-973b-c51708c811e1",
  runId,
  actor: "local-review",
  operation: "resource.write",
  projectId,
  decision: "denied",
  code: "OPERATION_NOT_GRANTED",
  reason: "Inspect ungranted operation",
  createdAt: at,
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

describe("fake local run workspace", () => {
  it("shows packet lineage, scoped grant, attempt, evidence, and an audited terminal denial", async () => {
    let readAttempted = false;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === `/api/v1/agent-runs/${runId}`) return json(run);
      if (path === `/api/v1/agents/${agentId}`)
        return json({
          id: agentId,
          name: "Harbor reader",
          role: "Read only",
          runtime: "local-fake-v1",
          sourceLabel: "Synthetic local agent",
          isSynthetic: true,
          createdAt: at,
        });
      if (path.startsWith(`/api/v1/agent-runs/${runId}/audit`))
        return json({
          items: readAttempted ? [denied, allowed] : [allowed],
          nextCursor: null,
        });
      if (
        path === `/api/v1/agent-runs/${runId}/context-reads` &&
        init?.method === "POST"
      ) {
        readAttempted = true;
        return json(
          {
            code: "OPERATION_NOT_GRANTED",
            message: "Operation is not granted",
          },
          403,
        );
      }
      return json({ message: "Unexpected request" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentRunWorkspace runId={runId} />);
    expect(
      await screen.findByRole("heading", { name: "Fake local run" }),
    ).toBeTruthy();
    expect(
      await screen.findByText("Harbor reader / Packet version 2"),
    ).toBeTruthy();
    expect(screen.getByText("Attempt 1: succeeded")).toBeTruthy();
    expect(
      screen.getByText(
        "Deterministic packet context was read. No work was performed.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Review immutable packet version 2" })
        .getAttribute("href"),
    ).toBe(`/execution-packets/${packetId}`);
    expect(
      screen
        .getByRole("link", { name: "View project source" })
        .getAttribute("href"),
    ).toBe(`/api/v1/projects/${projectId}`);
    expect(screen.getByText(/its manual read grant is closed/)).toBeTruthy();
    const audit = screen.getByRole("region", { name: "Audit history" });
    expect(await within(audit).findByText("project.brief.read")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Operation"), {
      target: { value: "resource.write" },
    });
    fireEvent.change(screen.getByLabelText("Reason *"), {
      target: { value: "Inspect ungranted operation" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Read scoped context" }),
    );
    expect(await screen.findByText("Operation is not granted")).toBeTruthy();
    await waitFor(() =>
      expect(within(audit).getByText("resource.write")).toBeTruthy(),
    );
    const posted = fetchMock.mock.calls.find(
      (call) =>
        call[0] === `/api/v1/agent-runs/${runId}/context-reads` &&
        call[1]?.method === "POST",
    );
    expect(JSON.parse(String(posted?.[1]?.body))).toEqual({
      projectId,
      operation: "resource.write",
      reason: "Inspect ungranted operation",
    });
  });

  it("loads later audit events through the cursor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === `/api/v1/agent-runs/${runId}`) return json(run);
        if (path === `/api/v1/agents/${agentId}`)
          return json({ id: agentId, name: "Harbor reader" });
        if (path.includes("/audit?"))
          return json(
            path.includes("cursor=")
              ? { items: [denied], nextCursor: null }
              : { items: [allowed], nextCursor: "next-audit" },
          );
        return json({ message: "Unexpected request" }, 404);
      }),
    );
    render(<AgentRunWorkspace runId={runId} />);
    const more = await screen.findByRole("button", {
      name: "Load more audit events",
    });
    fireEvent.click(more);
    const audit = screen.getByRole("region", { name: "Audit history" });
    await waitFor(() =>
      expect(within(audit).getByText("resource.write")).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: "Load more audit events" }),
    ).toBeNull();
  });

  it("proposes only an exact packet-selected resource link for local review", async () => {
    const linkId = "8939850f-5511-4d9c-901b-091ce2e61f49";
    const approvalId = "688630d7-69fc-46b7-8e0e-dc656c042fee";
    vi.stubGlobal("crypto", {
      randomUUID: () => "33d534df-3398-4cfd-b835-74bdb4324d60",
    });
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === `/api/v1/agent-runs/${runId}`) return json(run);
      if (path === `/api/v1/agents/${agentId}`)
        return json({ id: agentId, name: "Harbor reader" });
      if (path === `/api/v1/execution-packets/${packetId}`)
        return json({
          snapshot: {
            selectedResources: [
              {
                id: "5201e394-c3a1-4968-babc-c96811df29a9",
                linkId,
                linkType: "uses",
              },
            ],
          },
        });
      if (path.startsWith(`/api/v1/agent-runs/${runId}/audit`))
        return json({ items: [allowed], nextCursor: null });
      if (
        path === `/api/v1/agent-runs/${runId}/simulated-actions` &&
        init?.method === "POST"
      )
        return json({ id: approvalId });
      return json({ message: "Unexpected request" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentRunWorkspace runId={runId} />);
    const target = await screen.findByRole("combobox", {
      name: "Packet-selected resource link",
    });
    fireEvent.change(target, { target: { value: linkId } });
    fireEvent.click(
      screen.getByRole("button", { name: "Create proposal for review" }),
    );
    const link = await screen.findByRole("link", {
      name: "Review approval request",
    });
    expect(link.getAttribute("href")).toBe(`/approvals/${approvalId}`);
    const request = fetchMock.mock.calls.find(
      (call) =>
        call[0] === `/api/v1/agent-runs/${runId}/simulated-actions` &&
        call[1]?.method === "POST",
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      projectResourceLinkId: linkId,
      mode: "graceful",
      occurrenceId: "33d534df-3398-4cfd-b835-74bdb4324d60",
    });
    expect(
      screen.getByText(/run.s read grant does not become a write/),
    ).toBeTruthy();
  });
});
