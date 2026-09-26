// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentsPage from "./page";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const agentId = "8f24f301-47fa-4ca8-8492-4264993c5025";
const at = "2026-09-25T10:00:00.000Z";
const project = {
  id: projectId,
  name: "Harbor notes",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: at,
  updatedAt: at,
};
const agent = {
  id: agentId,
  name: "Harbor reader",
  role: "Read project context",
  runtime: "local-fake-v1",
  sourceLabel: "Synthetic local agent",
  isSynthetic: true,
  createdAt: at,
};
const assignment = {
  id: "f16c7463-b95f-44c4-871b-28d451db68a6",
  agentId,
  projectId,
  isSynthetic: true,
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

describe("local agents registry", () => {
  it("creates a synthetic profile with project scope and reloads the persisted assignment", async () => {
    let created = false;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/v1/projects"))
        return json({ items: [project], nextCursor: null });
      if (path === "/api/v1/agents" && init?.method === "POST") {
        created = true;
        return json(agent);
      }
      if (
        path === `/api/v1/agents/${agentId}/projects` &&
        init?.method === "POST"
      )
        return json(assignment);
      if (path.startsWith(`/api/v1/agents/${agentId}/projects`))
        return json({ items: [assignment], nextCursor: null });
      if (path.startsWith("/api/v1/agents"))
        return json({ items: created ? [agent] : [], nextCursor: null });
      return json({ message: "Unexpected path" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<AgentsPage />);
    expect(await screen.findByText("No local agents yet")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: agent.name },
    });
    fireEvent.change(screen.getByLabelText("Role Optional"), {
      target: { value: agent.role },
    });
    fireEvent.change(screen.getByLabelText("Project scope *"), {
      target: { value: projectId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create local agent" }));
    expect(
      await screen.findByText(
        `${agent.name} was created with one project-scoped read assignment.`,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("article", { name: agent.name })).toBeTruthy();
    expect(screen.getByRole("link", { name: project.name })).toHaveProperty(
      "href",
      `http://localhost:3000/projects/${projectId}`,
    );
    const createCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/v1/agents" && call[1]?.method === "POST",
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      name: agent.name,
      role: agent.role,
    });
    view.unmount();
    render(<AgentsPage />);
    expect(
      await screen.findByRole("article", { name: agent.name }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("link", { name: project.name }),
    ).toBeTruthy();
  });

  it("continues through agent and project pages instead of hiding later records", async () => {
    const second = {
      ...agent,
      id: "8f24f301-47fa-4ca8-8492-4264993c5026",
      name: "Second reader",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path.startsWith("/api/v1/projects"))
          return json({
            items: [project],
            nextCursor: path.includes("cursor=") ? null : "next-project",
          });
        if (path.includes("/projects") && path.includes("/agents/"))
          return json({ items: [], nextCursor: null });
        if (path.startsWith("/api/v1/agents"))
          return json(
            path.includes("cursor=")
              ? { items: [second], nextCursor: null }
              : { items: [agent], nextCursor: "next-agent" },
          );
        return json({ message: "Unexpected path" }, 404);
      }),
    );
    render(<AgentsPage />);
    expect(
      await screen.findByRole("article", { name: agent.name }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more agents" }));
    expect(
      await screen.findByRole("article", { name: second.name }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more projects" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more projects" }),
      ).toBeNull(),
    );
  });
});
