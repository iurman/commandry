// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KnowledgeItemWorkspace from "./KnowledgeItemWorkspace";

const noteId = "dd51b59e-9013-4e49-84c3-c177ad0b7956";
const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const captureId = "7cb8f86e-a063-4658-8d5e-0cc3678ca2a7";
const at = "2026-09-25T10:00:00.000Z";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Knowledge note detail", () => {
  it("shows the saved note and exact original capture link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: noteId,
              projectId,
              sourceCaptureId: captureId,
              kind: "note",
              title: "Venue note",
              content: "West door access.\nKeep the original note.",
              createdAt: at,
              updatedAt: at,
            }),
            { status: 200 },
          ),
      ),
    );
    render(<KnowledgeItemWorkspace knowledgeItemId={noteId} />);
    expect(
      await screen.findByRole("heading", { name: "Venue note" }),
    ).toBeTruthy();
    expect(screen.getByText(/West door access/).textContent).toBe(
      "West door access.\nKeep the original note.",
    );
    expect(
      screen
        .getByRole("link", { name: "View exact original capture" })
        .getAttribute("href"),
    ).toBe(`/inbox?captureId=${captureId}`);
    expect(
      screen.getByRole("link", { name: "Project" }).getAttribute("href"),
    ).toBe(`/projects/${projectId}`);
  });

  it("shows an empty saved body explicitly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: noteId,
              projectId,
              sourceCaptureId: captureId,
              kind: "note",
              title: "Venue note",
              content: "",
              createdAt: at,
              updatedAt: at,
            }),
            { status: 200 },
          ),
      ),
    );
    render(<KnowledgeItemWorkspace knowledgeItemId={noteId} />);
    expect(await screen.findByText("No note body was recorded.")).toBeTruthy();
  });
});
