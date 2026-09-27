// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkItemWorkspace from "./WorkItemWorkspace";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const workId = "ba972830-024c-4bb5-b60c-eb20256fe76d";
const captureId = "7cb8f86e-a063-4658-8d5e-0cc3678ca2a7";
const noteOneId = "dd51b59e-9013-4e49-84c3-c177ad0b7956";
const noteTwoId = "e707c1eb-ce34-42ee-9bf9-1c463a1c1a0a";
const resourceId = "cab264fd-a273-4b24-972f-cd112134a44d";
const packetId = "96aa7133-d53d-41e4-af33-9fecc2b91721";
const at = "2026-09-25T10:00:00.000Z";

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

describe("Work item workspace", () => {
  it("links the exact source, preserves selections across pages and creates a packet", async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === `/api/v1/work-items/${workId}`)
        return json({
          id: workId,
          projectId,
          sourceCaptureId: captureId,
          title: "Prepare launch",
          description: "Confirm local venue.",
          status: "open",
          createdAt: at,
          updatedAt: at,
        });
      if (path === `/api/v1/work-items/${workId}/acceptance`)
        return json({
          workItemId: workId,
          criteria: "",
          version: 0,
          updatedAt: null,
        });
      if (path.startsWith(`/api/v1/projects/${projectId}/knowledge`)) {
        if (path.includes(`cursor=${noteOneId}`))
          return json({
            items: [
              {
                id: noteTwoId,
                projectId,
                title: "Safety note",
                content: "Check exits.",
                sourceCaptureId: captureId,
              },
            ],
            nextCursor: null,
          });
        return json({
          items: [
            {
              id: noteOneId,
              projectId,
              title: "Venue note",
              content: "West door.",
              sourceCaptureId: captureId,
            },
          ],
          nextCursor: noteOneId,
        });
      }
      if (path.startsWith(`/api/v1/projects/${projectId}/resources`))
        return json({
          items: [
            {
              id: "3f45ee4c-bc80-42d6-8101-71e271d62e6b",
              resource: {
                id: resourceId,
                kind: "service",
                name: "Docs service",
                subtype: null,
                state: null,
                externalUrl: null,
                lastObservedAt: null,
              },
              type: "relates_to",
              inverseType: "relates_to",
            },
          ],
          nextCursor: null,
        });
      if (path.startsWith(`/api/v1/work-items/${workId}/execution-packets`)) {
        if (init?.method === "POST")
          return json({ id: packetId, packetVersion: 2, generatedAt: at }, 201);
        return json({
          items: [
            {
              id: "b50472cd-a606-4a9f-9bc7-60d6e94ce802",
              packetVersion: 1,
              generatedAt: at,
            },
          ],
          nextCursor: null,
        });
      }
      return json({ code: "NOT_FOUND", message: "Missing" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkItemWorkspace workItemId={workId} />);

    expect(
      await screen.findByRole("heading", { name: "Prepare launch" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View exact original capture" })
        .getAttribute("href"),
    ).toBe(`/inbox?captureId=${captureId}`);
    expect(screen.getByText("Confirm local venue.")).toBeTruthy();
    expect(
      await screen.findByRole("checkbox", { name: /Venue note/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Venue note/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Load more knowledge" }),
    );
    expect(
      await screen.findByRole("checkbox", { name: /Safety note/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Safety note/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Docs service/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Create execution packet" }),
    );

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([path, init]) =>
          path === `/api/v1/work-items/${workId}/execution-packets` &&
          init?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        selectedKnowledgeIds: [noteOneId, noteTwoId],
        selectedResourceIds: [resourceId],
      });
    });
    expect(
      (
        await screen.findByRole("link", { name: "Review execution packet" })
      ).getAttribute("href"),
    ).toBe(`/execution-packets/${packetId}`);
    expect(screen.getByRole("link", { name: "Version 1" })).toBeTruthy();
  });

  it("shows an empty context and still allows a packet with explicit empty selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === `/api/v1/work-items/${workId}`)
          return json({
            id: workId,
            projectId,
            sourceCaptureId: captureId,
            title: "Review plan",
            description: "",
            status: "open",
            createdAt: at,
            updatedAt: at,
          });
        if (path === `/api/v1/work-items/${workId}/acceptance`)
          return json({
            workItemId: workId,
            criteria: "",
            version: 0,
            updatedAt: null,
          });
        return json({ items: [], nextCursor: null });
      }),
    );
    render(<WorkItemWorkspace workItemId={workId} />);
    expect(
      await screen.findByText("No project knowledge is recorded."),
    ).toBeTruthy();
    expect(
      screen.getByText("No resources are linked to this project."),
    ).toBeTruthy();
    expect(screen.getByText("No packets yet")).toBeTruthy();
    expect(screen.getByText("No task description was recorded.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create execution packet" }),
    ).toBeTruthy();
  });
});
