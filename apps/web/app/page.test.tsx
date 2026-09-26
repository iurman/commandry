// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

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
      ["Activity", "/activity"],
      ["Search", "/search"],
      ["Agents", "/agents"],
    ]);

    expect(
      screen.getByRole("heading", { name: "Command Center" }),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "No active synthetic attention has been derived from local fixtures.",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "No synthetic events have been normalized by the local worker.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No live sources")).toBeTruthy();
    expect(
      screen.getByText(/do not report project or resource health/),
    ).toBeTruthy();
  });

  it("shows only labeled synthetic attention and changes with source evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) =>
        path.startsWith("/api/v1/attention")
          ? json({
              items: [
                {
                  id: "a30339c4-54af-4d9b-9704-44864e5f5168",
                  priority: "critical",
                  title: "Review simulated availability",
                  reason: "A linked synthetic monitor reported unavailable.",
                  ruleId: "synthetic.monitor-unavailable",
                  alertId: "8615b5ea-933b-492a-9df7-b456f76012c4",
                  projectId: "1b2c052d-31b4-432b-8b3c-f314fc7c8f26",
                  resourceId: "bb74035f-774f-412a-b794-85f72d450859",
                  lastObservedAt: "2026-09-25T10:02:00.000Z",
                  evidenceEventIds: ["61eb483c-af3a-4b34-8cbe-9fe47c9182a9"],
                  evidenceHref:
                    "/api/v1/source-envelopes/50c5f184-c2fb-4506-8293-7a11fa806d54",
                  sourceLabel: "Synthetic operational fixture",
                  isSynthetic: true,
                },
              ],
              nextCursor: null,
            })
          : json({
              items: [
                {
                  id: "61eb483c-af3a-4b34-8cbe-9fe47c9182a9",
                  type: "operations.monitor-down",
                  summary: "Synthetic monitor reported unavailable",
                  severity: "critical",
                  projectId: "1b2c052d-31b4-432b-8b3c-f314fc7c8f26",
                  resourceId: "bb74035f-774f-412a-b794-85f72d450859",
                  occurredAt: "2026-09-25T10:00:00.000Z",
                  ingestedAt: "2026-09-25T10:02:00.000Z",
                  sourceEnvelopeId: "50c5f184-c2fb-4506-8293-7a11fa806d54",
                  sourceKind: "synthetic-operations",
                  sourceLabel: "Synthetic operational fixture",
                  isSynthetic: true,
                  processingVersion: 1,
                  alertId: "8615b5ea-933b-492a-9df7-b456f76012c4",
                  evidenceHref:
                    "/api/v1/source-envelopes/50c5f184-c2fb-4506-8293-7a11fa806d54",
                },
              ],
              nextCursor: null,
            }),
      ),
    );

    render(<HomePage />);
    expect(
      await screen.findByText("Review simulated availability"),
    ).toBeTruthy();
    expect(
      await screen.findByText("Synthetic monitor reported unavailable"),
    ).toBeTruthy();
    expect(screen.getByText("No live sources")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: /Inspect synthetic source/ }),
    ).toHaveLength(2);
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
    expect(await screen.findAllByText("Data unavailable")).toHaveLength(2);
    expect(screen.getByText("No live sources")).toBeTruthy();
  });
});
