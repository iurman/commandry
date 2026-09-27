// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KnowledgeItemWorkspace from "./KnowledgeItemWorkspace";

const noteId = "dd51b59e-9013-4e49-84c3-c177ad0b7956";
const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const captureId = "7cb8f86e-a063-4658-8d5e-0cc3678ca2a7";
const at = "2026-09-25T10:00:00.000Z";

function responseFor(path: string, content: string) {
  const body =
    path.includes("/revisions") ||
    path.includes("/projects?") ||
    path.includes("/project-audit?")
      ? { items: [], nextCursor: null }
      : path === `/api/v1/projects/${projectId}`
        ? {
            id: projectId,
            name: "Venue project",
            summary: null,
            type: "general",
            lifecycle: "active",
            createdAt: at,
            updatedAt: at,
          }
        : {
            id: noteId,
            projectId,
            sourceCaptureId: captureId,
            kind: "note",
            title: "Venue note",
            content,
            version: 1,
            createdAt: at,
            updatedAt: at,
          };
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Knowledge note detail", () => {
  it("shows the saved note and exact original capture link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) =>
        responseFor(path, "West door access.\nKeep the original note."),
      ),
    );
    render(<KnowledgeItemWorkspace knowledgeItemId={noteId} />);
    expect(
      await screen.findByRole("heading", { name: "Venue note" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/West door access/, { selector: ".cmd-detail-body" })
        .textContent,
    ).toBe("West door access.\nKeep the original note.");
    expect(
      screen
        .getByRole("link", { name: "View exact original capture" })
        .getAttribute("href"),
    ).toBe(`/inbox?captureId=${captureId}`);
    expect(
      screen.getByRole("link", { name: "Project" }).getAttribute("href"),
    ).toBe(`/projects/${projectId}`);
    expect(await screen.findByText(/Primary project:/)).toBeTruthy();
  });

  it("shows an empty saved body explicitly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => responseFor(path, "")),
    );
    render(<KnowledgeItemWorkspace knowledgeItemId={noteId} />);
    expect(await screen.findByText("No note body was recorded.")).toBeTruthy();
  });
});
