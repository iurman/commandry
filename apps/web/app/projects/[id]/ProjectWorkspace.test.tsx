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
import ProjectWorkspace from "./ProjectWorkspace";
import type {
  ProjectRecord,
  ProjectResourceLink,
  ResourceRecord,
} from "../api";

const project: ProjectRecord = {
  id: "0ef5d360-5d30-4863-a148-b4e4ba020101",
  name: "Harbor notes",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: "2026-09-25T09:00:00.000Z",
  updatedAt: "2026-09-25T09:00:00.000Z",
};

const existingResource: ResourceRecord = {
  id: "cab264fd-a273-4b24-972f-cd112134a44d",
  kind: "domain",
  name: "harbor.example",
  subtype: null,
  state: null,
  externalUrl: null,
  lastObservedAt: null,
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

describe("Project workspace", () => {
  it("creates and links a manual resource, then reads the same canonical ID after remount", async () => {
    const relations: ProjectResourceLink[] = [];
    const resource: ResourceRecord = {
      ...existingResource,
      id: "1b6b1216-c093-4b35-826a-1dc8e1454669",
      kind: "service",
      name: "Docs service",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path.includes(`/projects/${project.id}/resources`)) {
          if (init?.method === "POST") {
            const relation = {
              id: "5aad5cd6-9cae-4ced-85ed-231f6d5c0064",
              type: "relates_to",
              inverseType: "relates_to",
              resource,
            };
            relations.push(relation);
            return json(relation);
          }
          return json({ items: relations, nextCursor: null });
        }
        if (path.includes(`/projects/${project.id}`)) return json(project);
        if (path === "/api/v1/resources" && init?.method === "POST")
          return json(resource);
        return json({ items: [], nextCursor: null });
      }),
    );

    const view = render(<ProjectWorkspace projectId={project.id} />);
    expect(await screen.findByText("No linked resources")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Docs service" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create and link resource" })
        .closest("form")!,
    );

    expect(await screen.findByText("Docs service")).toBeTruthy();
    expect(screen.getByText(resource.id)).toBeTruthy();
    expect(
      screen.getByText("Manual record. No operational observation."),
    ).toBeTruthy();
    const linked = screen.getByRole("list", { name: "Linked resources" });
    expect(
      within(linked).getByText("Project relates to resource"),
    ).toBeTruthy();
    expect(
      within(linked).getByText("Resource relates to project"),
    ).toBeTruthy();

    view.unmount();
    render(<ProjectWorkspace projectId={project.id} />);
    expect(await screen.findByText("Docs service")).toBeTruthy();
    expect(screen.getByText(resource.id)).toBeTruthy();
  });

  it("links an existing record without creating another resource", async () => {
    const relations: ProjectResourceLink[] = [];
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes(`/projects/${project.id}/resources`)) {
        if (init?.method === "POST") {
          const relation = {
            id: "5aad5cd6-9cae-4ced-85ed-231f6d5c0064",
            type: "supports",
            inverseType: "supported_by",
            resource: existingResource,
          };
          relations.push(relation);
          return json(relation);
        }
        return json({ items: relations, nextCursor: null });
      }
      if (path.includes(`/projects/${project.id}`)) return json(project);
      return json({ items: [existingResource], nextCursor: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectWorkspace projectId={project.id} />);
    await screen.findByText("No linked resources");
    fireEvent.click(
      screen.getByRole("button", { name: "Choose an existing resource" }),
    );
    await screen.findByRole("option", {
      name: new RegExp(existingResource.name),
    });
    fireEvent.change(screen.getByLabelText("Resource"), {
      target: { value: existingResource.id },
    });
    fireEvent.change(
      screen.getByLabelText("Relationship", {
        selector: "select#existing-relationship-type",
      }),
      { target: { value: "supports" } },
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Link resource" }).closest("form")!,
    );

    const linked = await screen.findByRole("list", {
      name: "Linked resources",
    });
    expect(within(linked).getByText("Resource supports project")).toBeTruthy();
    expect(
      within(linked).getByText("Project supported by resource"),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([path, init]) =>
            path === "/api/v1/resources" && init?.method === "POST",
        ),
      ).toBe(false),
    );
  });
});
