// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectsPage from "./page";
import type { ProjectRecord } from "./api";

const baseProject: ProjectRecord = {
  id: "0ef5d360-5d30-4863-a148-b4e4ba020101",
  name: "Harbor notes",
  summary: "A writing project",
  type: "general",
  lifecycle: "active",
  createdAt: "2026-09-25T09:00:00.000Z",
  updatedAt: "2026-09-25T09:00:00.000Z",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Projects index", () => {
  it("creates a project, links to its workspace, and retains it after remount", async () => {
    const records: ProjectRecord[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const input = JSON.parse(String(init.body)) as {
            name: string;
            summary?: string;
          };
          const created = {
            ...baseProject,
            name: input.name,
            summary: input.summary ?? null,
          };
          records.unshift(created);
          return json(created);
        }
        return json({ items: records, nextCursor: null });
      }),
    );

    const view = render(<ProjectsPage />);
    expect(await screen.findByText("No projects yet")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Field journal" },
    });
    fireEvent.change(screen.getByLabelText("Summary Optional"), {
      target: { value: "Trip planning" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Create project" }).closest("form")!,
    );

    const link = await screen.findByRole("link", { name: "Field journal" });
    expect(link.getAttribute("href")).toBe(`/projects/${baseProject.id}`);
    expect(
      screen.getByText("Created Field journal. Open it from the index."),
    ).toBeTruthy();

    view.unmount();
    render(<ProjectsPage />);
    expect(
      await screen.findByRole("link", { name: "Field journal" }),
    ).toBeTruthy();
  });

  it("loads the next page so projects beyond the first page remain reachable", async () => {
    const second = {
      ...baseProject,
      id: "0ef5d360-5d30-4863-a148-b4e4ba020102",
      name: "Second project",
    };
    const fetchMock = vi.fn(async (path: string) =>
      json(
        path.includes("cursor=")
          ? { items: [second], nextCursor: null }
          : {
              items: [baseProject],
              nextCursor: "0ef5d360-5d30-4863-a148-b4e4ba020103",
            },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more projects" }),
    );
    expect(
      await screen.findByRole("link", { name: "Second project" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more projects" }),
      ).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
