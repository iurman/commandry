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
import ActivityPage from "./page";
import type {
  SyntheticAlertRecord,
  SyntheticAttentionRecord,
  SyntheticEventRecord,
  SyntheticImportRecord,
} from "./api";
import type { ProjectRecord, ProjectResourceLink } from "../projects/api";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const resourceId = "9b67a1a8-9745-46db-92ef-1c9c72662fe6";
const downEventId = "13e65c38-4ee6-4c2a-916e-220e61a87c21";
const recoveryEventId = "cdd0b376-442d-4286-9f91-1c21fe4867d9";
const envelopeId = "ba9c969f-a376-40ef-85e5-73c9d762eb1d";

const project: ProjectRecord = {
  id: projectId,
  name: "Harbor notes",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: "2026-09-25T09:00:00.000Z",
  updatedAt: "2026-09-25T09:00:00.000Z",
};

const linkedResource: ProjectResourceLink = {
  id: "b483203d-96a7-410f-9fcb-35e65d890d5c",
  type: "relates_to",
  inverseType: "relates_to",
  resource: {
    id: resourceId,
    kind: "service",
    name: "Docs service",
    subtype: null,
    state: null,
    externalUrl: null,
    lastObservedAt: null,
  },
};

const downEvent: SyntheticEventRecord = {
  id: downEventId,
  type: "operations.monitor-down",
  summary: "Synthetic monitor reported unavailable",
  severity: "critical",
  projectId,
  resourceId,
  occurredAt: "2026-09-25T10:00:00.000Z",
  ingestedAt: "2026-09-25T10:02:00.000Z",
  sourceEnvelopeId: envelopeId,
  sourceKind: "synthetic-operations",
  sourceLabel: "Synthetic operational fixture",
  isSynthetic: true,
  processingVersion: 1,
  alertId: "ec4dc843-0c5e-48b3-8f1d-e8e9c6d04a97",
  evidenceHref: `/api/v1/source-envelopes/${envelopeId}`,
};

const activeAlert: SyntheticAlertRecord = {
  id: "ec4dc843-0c5e-48b3-8f1d-e8e9c6d04a97",
  state: "active",
  severity: "critical",
  ruleId: "synthetic.monitor-unavailable",
  reason: "A linked synthetic monitor reported unavailable.",
  projectId,
  resourceId,
  firstObservedAt: "2026-09-25T10:00:00.000Z",
  lastObservedAt: "2026-09-25T10:02:00.000Z",
  resolvedAt: null,
  lastEventId: downEventId,
  evidenceEventIds: [downEventId],
  sourceLabel: "Synthetic operational fixture",
  isSynthetic: true,
};

const activeAttention: SyntheticAttentionRecord = {
  id: "4437469d-04a3-4103-a60c-3fca2fc7e0ef",
  priority: "critical",
  title: "Review simulated availability",
  reason: activeAlert.reason,
  ruleId: activeAlert.ruleId,
  alertId: activeAlert.id,
  projectId,
  resourceId,
  lastObservedAt: activeAlert.lastObservedAt,
  evidenceEventIds: [downEventId],
  evidenceHref: downEvent.evidenceHref,
  sourceLabel: downEvent.sourceLabel,
  isSynthetic: true,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("Synthetic activity workspace", () => {
  it("imports a project-scoped development fixture and shows the queued source receipt", async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/v1/projects?")) {
        return json({ items: [project], nextCursor: null });
      }
      if (path === `/api/v1/projects/${projectId}/resources?limit=20`) {
        return json({ items: [], nextCursor: null });
      }
      if (path.startsWith("/api/v1/synthetic-event-imports?")) {
        return json({ items: [], nextCursor: null });
      }
      if (
        path === "/api/v1/synthetic-event-imports" &&
        init?.method === "POST"
      ) {
        expect(JSON.parse(String(init.body))).toEqual({
          scenarioId: "development.pr-merged",
          projectId,
          occurrenceId: "local-test-pr-001",
        });
        const imported: SyntheticImportRecord = {
          id: "c56e7e64-811c-4ee1-b63a-e94298037dc3",
          occurrenceId: "local-test-pr-001",
          scenarioId: "development.pr-merged",
          projectId,
          resourceId: null,
          sourceKind: "synthetic-development",
          sourceLabel: "Synthetic development fixture",
          isSynthetic: true,
          state: "queued",
          attempts: 0,
          error: null,
          sourceEnvelopeId: envelopeId,
          eventId: null,
          occurredAt: "2026-09-25T10:00:00.000Z",
          receivedAt: "2026-09-25T10:01:00.000Z",
          createdAt: "2026-09-25T10:01:00.000Z",
          completedAt: null,
        };
        return json(imported, 202);
      }
      if (
        path.startsWith("/api/v1/events?") ||
        path.startsWith("/api/v1/alerts?") ||
        path.startsWith("/api/v1/attention?")
      ) {
        return json({ items: [], nextCursor: null });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ActivityPage />);
    await screen.findByRole("option", { name: "Harbor notes" });
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: projectId },
    });
    expect(
      await screen.findByText(/Development fixtures can still be imported/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Synthetic occurrence ID"), {
      target: { value: "local-test-pr-001" },
    });
    const submit = screen.getByRole("button", {
      name: "Import synthetic event",
    });
    expect(submit.hasAttribute("disabled")).toBe(false);
    fireEvent.submit(submit.closest("form")!);

    expect(
      await screen.findByText("Synthetic fixture queued for the local worker."),
    ).toBeTruthy();
    const receipt = screen
      .getByRole("heading", { name: "Import status" })
      .closest("div")!;
    expect(receipt.textContent).toContain("queued");
    expect(
      screen
        .getByRole("link", { name: "Inspect submitted synthetic envelope" })
        .getAttribute("href"),
    ).toBe(`/api/v1/source-envelopes/${envelopeId}`);
  });

  it("shows linked evidence and resolves synthetic attention after a recovery import", async () => {
    window.history.replaceState({}, "", `/activity?projectId=${projectId}`);
    let recovered = false;
    const recoveryEvent: SyntheticEventRecord = {
      ...downEvent,
      id: recoveryEventId,
      type: "operations.monitor-recovered",
      summary: "Synthetic monitor reported recovered",
      severity: "informational",
      occurredAt: "2026-09-25T10:08:00.000Z",
      ingestedAt: "2026-09-25T10:09:00.000Z",
    };
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/v1/projects?"))
        return json({ items: [], nextCursor: null });
      if (path === `/api/v1/projects/${projectId}`) return json(project);
      if (path.startsWith(`/api/v1/projects/${projectId}/resources?`)) {
        return json({ items: [linkedResource], nextCursor: null });
      }
      if (path.startsWith("/api/v1/synthetic-event-imports?")) {
        return json({ items: [], nextCursor: null });
      }
      if (
        path === "/api/v1/synthetic-event-imports" &&
        init?.method === "POST"
      ) {
        expect(JSON.parse(String(init.body))).toEqual({
          scenarioId: "operations.monitor-recovered",
          projectId,
          resourceId,
          occurrenceId: "local-test-recovery-001",
        });
        recovered = true;
        return json(
          {
            id: "93f63ab0-2599-4e49-a8c4-0d5ec4256c3b",
            occurrenceId: "local-test-recovery-001",
            scenarioId: "operations.monitor-recovered",
            projectId,
            resourceId,
            sourceKind: "synthetic-operations",
            sourceLabel: "Synthetic operational fixture",
            isSynthetic: true,
            state: "succeeded",
            attempts: 1,
            error: null,
            sourceEnvelopeId: envelopeId,
            eventId: recoveryEventId,
            occurredAt: recoveryEvent.occurredAt,
            receivedAt: recoveryEvent.ingestedAt,
            createdAt: recoveryEvent.ingestedAt,
            completedAt: recoveryEvent.ingestedAt,
          },
          202,
        );
      }
      if (path.startsWith("/api/v1/events?")) {
        return json({
          items: recovered ? [recoveryEvent, downEvent] : [downEvent],
          nextCursor: null,
        });
      }
      if (path.startsWith("/api/v1/attention?")) {
        return json({
          items: recovered ? [] : [activeAttention],
          nextCursor: null,
        });
      }
      if (path.startsWith("/api/v1/alerts?")) {
        return json({
          items: [
            recovered
              ? {
                  ...activeAlert,
                  state: "resolved",
                  lastEventId: recoveryEventId,
                  evidenceEventIds: [downEventId, recoveryEventId],
                  resolvedAt: recoveryEvent.occurredAt,
                }
              : activeAlert,
          ],
          nextCursor: null,
        });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ActivityPage />);
    expect(
      await screen.findByText("Review simulated availability"),
    ).toBeTruthy();
    expect(
      await screen.findByText("Synthetic monitor reported unavailable"),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Project") as HTMLSelectElement).value,
      ).toBe(projectId),
    );
    fireEvent.change(screen.getByLabelText("Linked resource"), {
      target: { value: resourceId },
    });
    fireEvent.change(screen.getByLabelText("Synthetic scenario"), {
      target: { value: "operations.monitor-recovered" },
    });
    fireEvent.change(screen.getByLabelText("Synthetic occurrence ID"), {
      target: { value: "local-test-recovery-001" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Import synthetic event" })
        .closest("form")!,
    );

    expect(
      await screen.findByText("Synthetic monitor reported recovered"),
    ).toBeTruthy();
    const alertList = screen.getByRole("list", {
      name: "Synthetic alert history",
    });
    expect(
      within(alertList).getByText("Resolved", { selector: "span" }),
    ).toBeTruthy();
    expect(
      await screen.findByText("No active synthetic attention"),
    ).toBeTruthy();
    const eventList = screen.getByRole("list", { name: "Synthetic events" });
    expect(
      within(eventList).getAllByRole("link", {
        name: "Inspect synthetic source envelope",
      }),
    ).toHaveLength(2);
    expect(
      within(alertList)
        .getByRole("link", { name: "Inspect synthetic source evidence" })
        .getAttribute("href"),
    ).toBe(`/api/v1/events/${recoveryEventId}`);
    expect(linkedResource.resource.state).toBeNull();
  });
});
