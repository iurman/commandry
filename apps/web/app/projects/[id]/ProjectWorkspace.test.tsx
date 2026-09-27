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
import { defaultProjectPresentation } from "@commandry/domain";
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
  parentResourceId: null,
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
  it("shows filed work and notes with a route back to each original capture", async () => {
    const taskCaptureId = "7cb8f86e-a063-4658-8d5e-0cc3678ca2a7";
    const noteCaptureId = "6d61656a-1a69-43f7-abeb-2d3b82e1a7e9";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path.includes(`/projects/${project.id}/presentation`))
          return json(defaultProjectPresentation);
        if (path.includes(`/projects/${project.id}/changes`))
          return json({ items: [], nextCursor: null });
        if (path.includes(`/projects/${project.id}/agent-findings`))
          return json({
            items: [],
            nextCursor: null,
            asOf: new Date().toISOString(),
          });
        if (path.includes(`/projects/${project.id}/work`))
          return json({
            items: [
              {
                id: "ba972830-024c-4bb5-b60c-eb20256fe76d",
                projectId: project.id,
                sourceCaptureId: taskCaptureId,
                title: "Prepare the venue",
                description: "Confirm access and equipment.",
                status: "open",
                createdAt: "2026-09-25T09:00:00.000Z",
                updatedAt: "2026-09-25T09:00:00.000Z",
              },
            ],
            nextCursor: null,
          });
        if (path.includes(`/projects/${project.id}/knowledge`))
          return json({
            items: [
              {
                id: "dd51b59e-9013-4e49-84c3-c177ad0b7956",
                projectId: project.id,
                sourceCaptureId: noteCaptureId,
                kind: "note",
                title: "Venue context",
                content: "The west door is accessible.",
                createdAt: "2026-09-25T09:00:00.000Z",
              },
            ],
            nextCursor: null,
          });
        if (path.includes(`/projects/${project.id}/resources`))
          return json({ items: [], nextCursor: null });
        if (path.includes(`/projects/${project.id}/decisions`))
          return json({ items: [], nextCursor: null });
        if (path.includes(`/projects/${project.id}/systems`))
          return json({ items: [], nextCursor: null });
        if (path.includes(`/projects/${project.id}`)) return json(project);
        return json({ items: [], nextCursor: null });
      }),
    );

    render(<ProjectWorkspace projectId={project.id} />);
    expect(await screen.findByText("Prepare the venue")).toBeTruthy();
    expect(screen.getByText("Venue context")).toBeTruthy();
    const work = screen.getByRole("list", { name: "Project work" });
    const knowledge = screen.getByRole("list", { name: "Project knowledge" });
    expect(
      within(work)
        .getByRole("link", { name: "Original capture" })
        .getAttribute("href"),
    ).toBe(`/inbox?captureId=${taskCaptureId}`);
    expect(
      within(knowledge)
        .getByRole("link", { name: "View original capture" })
        .getAttribute("href"),
    ).toBe(`/inbox?captureId=${noteCaptureId}`);
  });

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
        if (path.includes(`/projects/${project.id}/presentation`))
          return json(defaultProjectPresentation);
        if (path.includes(`/projects/${project.id}/changes`))
          return json({ items: [], nextCursor: null });
        if (path.includes(`/projects/${project.id}/agent-findings`))
          return json({
            items: [],
            nextCursor: null,
            asOf: new Date().toISOString(),
          });
        if (
          path.includes(`/projects/${project.id}/work`) ||
          path.includes(`/projects/${project.id}/knowledge`)
        )
          return json({ items: [], nextCursor: null });
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
        if (path.includes(`/projects/${project.id}/decisions`))
          return json({ items: [], nextCursor: null });
        if (path.includes(`/projects/${project.id}/systems`))
          return json({ items: [], nextCursor: null });
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
      if (path.includes(`/projects/${project.id}/presentation`))
        return json(defaultProjectPresentation);
      if (path.includes(`/projects/${project.id}/changes`))
        return json({ items: [], nextCursor: null });
      if (path.includes(`/projects/${project.id}/agent-findings`))
        return json({
          items: [],
          nextCursor: null,
          asOf: new Date().toISOString(),
        });
      if (
        path.includes(`/projects/${project.id}/work`) ||
        path.includes(`/projects/${project.id}/knowledge`)
      )
        return json({ items: [], nextCursor: null });
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
      if (path.includes(`/projects/${project.id}/decisions`))
        return json({ items: [], nextCursor: null });
      if (path.includes(`/projects/${project.id}/systems`))
        return json({ items: [], nextCursor: null });
      if (path.includes(`/projects/${project.id}`)) return json(project);
      if (path.startsWith("/api/v1/systems"))
        return json({ items: [], nextCursor: null });
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
