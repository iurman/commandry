// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimulatedApprovalView } from "@commandry/ui";
import ApprovalsPage from "./page";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const resourceId = "92fa3fe6-c2db-43a8-9e10-647662e77ae5";
const firstId = "b5ad2eb9-038b-467f-ac2f-efb11d62391d";
const secondId = "c89bfeb7-e3a1-4c6c-898a-5722b551857d";

function fixture(id: string): SimulatedApprovalView {
  return {
    id,
    state: "pending",
    createdAt: "2026-09-25T10:00:00.000Z",
    descriptor: {
      target: { projectId, resourceId },
      expiresAt: "2099-09-25T11:00:00.000Z",
    },
    outcome: null,
  } as SimulatedApprovalView;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("approval queue", () => {
  it("continues through cursor pages and filters pending records", async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (path.includes("cursor="))
        return json({ items: [fixture(secondId)], nextCursor: null });
      if (path.includes("state=pending"))
        return json({ items: [fixture(secondId)], nextCursor: null });
      return json({ items: [fixture(firstId)], nextCursor: "next-page" });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalsPage />);
    expect(
      await screen.findByRole("heading", { name: "Approval requests" }),
    ).toBeTruthy();
    const first = await screen.findByRole("link", {
      name: "Simulated resource restart",
    });
    expect(first.getAttribute("href")).toBe(`/approvals/${firstId}`);
    fireEvent.click(
      screen.getByRole("button", { name: "Load more approvals" }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", { name: "Simulated resource restart" }),
      ).toHaveLength(2),
    );
    expect(
      screen.queryByRole("button", { name: "Load more approvals" }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Decision state" }), {
      target: { value: "pending" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: "Approval requests" }).children,
      ).toHaveLength(1),
    );
    expect(
      screen
        .getByRole("link", { name: "Simulated resource restart" })
        .getAttribute("href"),
    ).toBe(`/approvals/${secondId}`);
    expect(
      fetchMock.mock.calls.some(([path]) => path.includes("state=pending")),
    ).toBe(true);
  });
});
