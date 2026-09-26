// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import type { ProjectBrief } from "@commandry/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectBriefPanel from "./ProjectBriefPanel";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const workId = "ba972830-024c-4bb5-b60c-eb20256fe76d";
const eventId = "13e65c38-4ee6-4c2a-916e-220e61a87c21";
const at = "2026-09-25T10:00:00.000Z";
const projectEvidence = {
  kind: "project" as const,
  id: projectId,
  href: `/api/v1/projects/${projectId}`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: "Manual local record",
  isSynthetic: false,
};
const workEvidence = {
  kind: "work_item" as const,
  id: workId,
  href: `/api/v1/work-items/${workId}`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: "Manual local capture",
  isSynthetic: false,
};
const syntheticEvidence = {
  kind: "event" as const,
  id: eventId,
  href: `/api/v1/events/${eventId}`,
  recordedAt: at,
  occurredAt: at,
  sourceLabel: "Synthetic operational fixture",
  isSynthetic: true,
};
const emptySection = (path: string) => ({
  items: [],
  nextCursor: null,
  fullListHref: path,
  emptyState: "No records in this section.",
});
const brief: ProjectBrief = {
  project: {
    id: projectId,
    name: "Harbor notes",
    summary: "Local work",
    type: "general",
    lifecycle: "active",
    createdAt: at,
    updatedAt: at,
  },
  generatedAt: "2026-09-25T10:05:00.000Z",
  asOf: "2026-09-25T10:04:00.000Z",
  method: "deterministic-local-v1",
  state: { text: "Project lifecycle is active.", evidence: [projectEvidence] },
  sections: {
    work: {
      items: [
        {
          id: workId,
          kind: "work_item",
          title: "Prepare launch",
          detail: "Open task",
          evidence: [workEvidence],
          sourceLabel: "Manual local capture",
          isSynthetic: false,
        },
      ],
      nextCursor: workId,
      fullListHref: `/api/v1/projects/${projectId}/work`,
      emptyState: null,
    },
    knowledge: emptySection(`/api/v1/projects/${projectId}/knowledge`),
    resources: emptySection(`/api/v1/projects/${projectId}/resources`),
    activity: {
      items: [
        {
          id: eventId,
          kind: "event",
          title: "Monitor fixture down",
          detail: "Simulation only",
          evidence: [syntheticEvidence],
          sourceLabel: "Synthetic operational fixture",
          isSynthetic: true,
        },
      ],
      nextCursor: null,
      fullListHref: `/api/v1/events?projectId=${projectId}`,
      emptyState: null,
    },
    attention: emptySection(`/api/v1/attention?projectId=${projectId}`),
  },
  missing: {
    decisions: { status: "not_recorded", message: "No decisions recorded." },
    questions: { status: "not_recorded", message: "No questions recorded." },
    blockers: { status: "not_recorded", message: "No blockers recorded." },
    acceptanceCriteria: {
      status: "not_recorded",
      message: "No acceptance criteria recorded.",
    },
  },
  nextActions: {
    items: [
      {
        kind: "inference",
        ruleId: "open-work-review-v1",
        text: "Review open task: Prepare launch",
        evidence: [workEvidence],
      },
    ],
    scope: "preview_only",
    explanation: "Rule-based preview from open work.",
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Project brief panel", () => {
  it("shows source-linked facts, freshness, bounded continuation and explicit gaps", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(brief), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ProjectBriefPanel projectId={projectId} />);
    expect(
      await screen.findByRole("heading", { name: "Project brief" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/projects/${projectId}/brief`,
      expect.anything(),
    );
    expect(screen.getByText("2026-09-25T10:05:00.000Z")).toBeTruthy();
    expect(screen.getByText("2026-09-25T10:04:00.000Z")).toBeTruthy();
    const openWork = screen.getByRole("region", { name: "Open work" });
    expect(within(openWork).getByText("Prepare launch")).toBeTruthy();
    expect(
      within(openWork)
        .getByRole("link", { name: "View all work" })
        .getAttribute("href"),
    ).toBe(`/projects/${projectId}#work-heading`);
    expect(
      within(openWork).getByText("More records available in the full list."),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Synthetic · Synthetic operational fixture/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("No decisions recorded.")).toBeTruthy();
    expect(screen.getByText("No blockers recorded.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View all attention" })
        .getAttribute("href"),
    ).toBe(`/activity?projectId=${projectId}#attention`);
  });

  it("shows a retryable error for an invalid projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: projectId }), { status: 200 }),
      ),
    );
    render(<ProjectBriefPanel projectId={projectId} />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Project brief response is invalid.",
    );
    expect(
      screen.getByRole("button", { name: "Retry project brief" }),
    ).toBeTruthy();
  });
});
