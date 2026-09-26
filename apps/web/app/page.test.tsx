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
import HomePage from "./page";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const notification = {
  id: "alert-open:8615b5ea-933b-492a-9df7-b456f76012c4:1",
  kind: "synthetic_alert",
  projectId: "1b2c052d-31b4-432b-8b3c-f314fc7c8f26",
  projectName: "Example project",
  priority: "critical",
  title: "Synthetic monitor needs attention",
  reason:
    "Affected resource: example service. A fixed local monitor reported unavailable.",
  sourceLabel: "Synthetic operational fixture",
  isSynthetic: true,
  occurredAt: "2026-09-25T10:02:00.000Z",
  href: "/resources/bb74035f-774f-412a-b794-85f72d450859",
  evidenceHref: "/api/v1/alerts/8615b5ea-933b-492a-9df7-b456f76012c4",
  state: "unread",
  snoozedUntil: null,
  version: 0,
} as const;

const event = {
  id: "61eb483c-af3a-4b34-8cbe-9fe47c9182a9",
  type: "operations.monitor-down",
  summary: "Synthetic monitor reported unavailable",
  severity: "critical",
  projectId: notification.projectId,
  resourceId: "bb74035f-774f-412a-b794-85f72d450859",
  occurredAt: "2026-09-25T10:00:00.000Z",
  ingestedAt: "2026-09-25T10:02:00.000Z",
  sourceEnvelopeId: "50c5f184-c2fb-4506-8293-7a11fa806d54",
  sourceKind: "synthetic-operations",
  sourceLabel: "Synthetic operational fixture",
  isSynthetic: true,
  processingVersion: 1,
  alertId: "8615b5ea-933b-492a-9df7-b456f76012c4",
  evidenceHref: "/api/v1/source-envelopes/50c5f184-c2fb-4506-8293-7a11fa806d54",
} as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Command Center", () => {
  it("links working destinations and shows explicit empty synthetic states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ items: [], nextCursor: null })),
    );
    render(<HomePage />);

    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });
    const links = within(navigation).getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Home", "/"],
      ["Inbox", "/inbox"],
      ["Projects", "/projects"],
      ["Infrastructure", "/infrastructure"],
      ["Activity", "/activity"],
      ["Search", "/search"],
      ["Agents", "/agents"],
      ["Approvals", "/approvals"],
      ["Automations", "/automations"],
      ["Notifications", "/notifications"],
    ]);
    expect(
      screen.getByRole("heading", { name: "Command Center" }),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "No current local notification needs attention. This does not establish external system health.",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "No synthetic events have been normalized by the local worker.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No live sources")).toBeTruthy();
    expect(
      screen.getByText(/Navigation opens the local workspaces/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Review captures in Inbox" })
        .getAttribute("href"),
    ).toBe("/inbox");
  });

  it("shows source-linked attention, changes local state, and refreshes the next action", async () => {
    let notificationReads = 0;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/state") && init?.method === "PUT")
        return json({ ...notification, state: "dismissed", version: 1 });
      if (path.startsWith("/api/v1/notifications")) {
        notificationReads += 1;
        return json({
          items: notificationReads === 1 ? [notification] : [],
          nextCursor: null,
        });
      }
      if (path.startsWith("/api/v1/events"))
        return json({ items: [event], nextCursor: null });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<HomePage />);

    expect(
      await screen.findByText("Synthetic monitor needs attention"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Synthetic operational fixture \/ Synthetic/),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Review context" }).getAttribute("href"),
    ).toBe(notification.href);
    expect(
      screen
        .getByRole("link", { name: "Exact source record" })
        .getAttribute("href"),
    ).toBe(notification.evidenceHref);
    expect(
      screen
        .getByRole("link", { name: "Review Synthetic monitor needs attention" })
        .getAttribute("href"),
    ).toBe(notification.href);
    expect(
      await screen.findByText("Synthetic monitor reported unavailable"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      expect(
        screen.queryByText("Synthetic monitor needs attention"),
      ).toBeNull();
    });
    expect(
      screen
        .getByRole("link", { name: "Review captures in Inbox" })
        .getAttribute("href"),
    ).toBe("/inbox");
    const mutation = fetcher.mock.calls.find(
      ([path, init]) => path.endsWith("/state") && init?.method === "PUT",
    );
    expect(JSON.parse(mutation?.[1]?.body as string)).toMatchObject({
      action: "dismiss",
      expectedVersion: 0,
    });
    expect(notificationReads).toBe(2);
  });

  it("reports unavailable data without implying healthy systems", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          { code: "database_unavailable", message: "Data unavailable" },
          503,
        ),
      ),
    );
    render(<HomePage />);
    expect(await screen.findAllByText("Data unavailable")).toHaveLength(3);
    expect(screen.getByText("No live sources")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Review captures in Inbox" }),
    ).toBeNull();
  });
});
