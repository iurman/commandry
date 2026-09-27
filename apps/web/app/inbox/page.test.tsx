// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InboxPage from "./page";
import type { CaptureRecord } from "./api";
import type { ProjectRecord } from "../projects/api";

const captureId = "af796862-5bd6-4c2a-b534-a667ad42c823";
const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const project: ProjectRecord = {
  id: projectId,
  name: "Harbor notes",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: "2026-09-25T09:00:00.000Z",
  updatedAt: "2026-09-25T09:00:00.000Z",
};

function capture(
  originalContent: string,
  inputType: "text" | "url" = "text",
): CaptureRecord {
  return {
    id: captureId,
    inputType,
    originalContent,
    source: "manual-local",
    author: "local-user",
    state: "unfiled",
    projectId: null,
    filedRecord: null,
    createdAt: "2026-09-25T10:00:00.000Z",
    filedAt: null,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("Inbox", () => {
  it("preserves the exact original while filing a separate linked task", async () => {
    const exactOriginal = "  Coolify cleanup\n  maybe stale jobs?  ";
    let saved: CaptureRecord | null = null;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/v1/projects")) {
        return json({ items: [project], nextCursor: null });
      }
      if (path === "/api/v1/captures" && init?.method === "POST") {
        const input = JSON.parse(String(init.body)) as {
          inputType: "text";
          originalContent: string;
        };
        saved = capture(input.originalContent, input.inputType);
        return json(saved, 201);
      }
      if (path.startsWith(`/api/v1/captures/${captureId}/file`)) {
        const request = JSON.parse(String(init?.body)) as {
          kind: string;
          workType: string;
          projectId: string;
          title: string;
          body: string;
        };
        expect(request).toEqual({
          projectId,
          kind: "task",
          workType: "task",
          title: "Inspect stale jobs",
          body: "Check scheduled deployment jobs before cleanup.",
        });
        saved = {
          ...saved!,
          state: "filed",
          projectId,
          filedRecord: {
            kind: "task",
            id: "c8a3ef5d-9c8b-45d8-80b7-87312e7f1066",
          },
          filedAt: "2026-09-25T11:00:00.000Z",
        };
        return json(
          { capture: saved, record: { id: saved.filedRecord!.id } },
          201,
        );
      }
      if (path === `/api/v1/captures/${captureId}`) return json(saved);
      if (path.startsWith("/api/v1/captures?")) {
        return json({ items: saved ? [saved] : [], nextCursor: null });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<InboxPage />);
    expect(await screen.findByText("Inbox is clear")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Original text *"), {
      target: { value: exactOriginal },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save to Inbox" }).closest("form")!,
    );

    const source = await screen.findByRole("article", {
      name: "Original input",
    });
    expect(source.querySelector("pre")?.textContent).toBe(exactOriginal);
    expect(screen.getByText("Manual local capture")).toBeTruthy();
    expect(
      (
        JSON.parse(
          String(
            fetchMock.mock.calls.find(
              ([path, init]) =>
                path === "/api/v1/captures" && init?.method === "POST",
            )?.[1]?.body,
          ),
        ) as { originalContent: string }
      ).originalContent,
    ).toBe(exactOriginal);

    fireEvent.change(screen.getByLabelText("Project *"), {
      target: { value: projectId },
    });
    fireEvent.change(screen.getByLabelText("Title *"), {
      target: { value: "Inspect stale jobs" },
    });
    fireEvent.change(screen.getByLabelText("Description Optional"), {
      target: { value: "Check scheduled deployment jobs before cleanup." },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "File as task" }).closest("form")!,
    );

    expect(await screen.findByText("Filed as Work")).toBeTruthy();
    expect(source.querySelector("pre")?.textContent).toBe(exactOriginal);
    expect(
      screen
        .getByRole("link", { name: "Open Harbor notes" })
        .getAttribute("href"),
    ).toBe(`/projects/${projectId}`);

    view.unmount();
    render(<InboxPage />);
    expect(await screen.findByText("Filed as Work")).toBeTruthy();
    expect(
      screen
        .getByRole("article", { name: "Original input" })
        .querySelector("pre")?.textContent,
    ).toBe(exactOriginal);
  });

  it("opens a deep-linked URL original beyond the first Inbox page without fetching that URL", async () => {
    const originalUrl = "https://example.invalid/reference?view=original";
    window.history.replaceState({}, "", `/inbox?captureId=${captureId}`);
    const fetchMock = vi.fn(async (path: string) => {
      if (path.startsWith("/api/v1/projects")) {
        return json({ items: [], nextCursor: null });
      }
      if (path.startsWith("/api/v1/captures?")) {
        return json({ items: [], nextCursor: null });
      }
      if (path === `/api/v1/captures/${captureId}`) {
        return json(capture(originalUrl, "url"));
      }
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InboxPage />);
    const source = await screen.findByRole("article", {
      name: "Original input",
    });
    expect(source.querySelector("pre")?.textContent).toBe(originalUrl);
    expect(screen.getByText("URL", { selector: "dd" })).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Captured items" }).textContent,
    ).toContain(originalUrl);
    expect(fetchMock.mock.calls.some(([path]) => path === originalUrl)).toBe(
      false,
    );
  });

  it("files an existing capture as a knowledge note while keeping the source separate", async () => {
    const exactOriginal = "Meeting ideas\n- compare two approaches";
    const noteId = "db30b719-b62c-4828-91d0-2e1503968206";
    let saved = capture(exactOriginal);
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/v1/projects")) {
        return json({ items: [project], nextCursor: null });
      }
      if (path.startsWith("/api/v1/captures?")) {
        return json({ items: [saved], nextCursor: null });
      }
      if (
        path === `/api/v1/captures/${captureId}/file` &&
        init?.method === "POST"
      ) {
        expect(JSON.parse(String(init.body))).toEqual({
          projectId,
          kind: "note",
          knowledgeType: "note",
          title: "Meeting ideas",
          body: "Compare the options before deciding.",
        });
        saved = {
          ...saved,
          state: "filed",
          projectId,
          filedRecord: {
            kind: "note",
            id: noteId,
          },
          filedAt: "2026-09-25T11:00:00.000Z",
        };
        return json({ capture: saved, record: { id: noteId } }, 201);
      }
      if (path === `/api/v1/captures/${captureId}`) return json(saved);
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InboxPage />);
    const source = await screen.findByRole("article", {
      name: "Original input",
    });
    fireEvent.change(screen.getByLabelText("Project *"), {
      target: { value: projectId },
    });
    fireEvent.change(screen.getByLabelText("File as"), {
      target: { value: "note" },
    });
    fireEvent.change(screen.getByLabelText("Title *"), {
      target: { value: "Meeting ideas" },
    });
    fireEvent.change(screen.getByLabelText("Content Optional"), {
      target: { value: "Compare the options before deciding." },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "File as note" }).closest("form")!,
    );

    expect(
      await screen.findByText("Filed as a note in the selected project."),
    ).toBeTruthy();
    expect(source.querySelector("pre")?.textContent).toBe(exactOriginal);
    expect(screen.getByText(noteId)).toBeTruthy();
  });

  it("loads more captures and reports a recoverable detail error", async () => {
    const first = capture("First capture");
    const second = {
      ...capture("Second capture"),
      id: "cc796862-5bd6-4c2a-b534-a667ad42c823",
    };
    let detailCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path.startsWith("/api/v1/projects"))
          return json({ items: [project], nextCursor: null });
        if (path.includes("cursor="))
          return json({ items: [second], nextCursor: null });
        if (path.startsWith("/api/v1/captures?")) {
          return json({ items: [first], nextCursor: first.id });
        }
        if (path === `/api/v1/captures/${first.id}`) {
          detailCalls += 1;
          return detailCalls === 1
            ? json({ code: "unavailable", message: "Try again" }, 503)
            : json(first);
        }
        if (path === `/api/v1/captures/${second.id}`) return json(second);
        throw new Error(`Unexpected request ${path}`);
      }),
    );

    render(<InboxPage />);
    expect(await screen.findByText("Try again")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry capture" }));
    expect(
      await screen.findByRole("article", { name: "Original input" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more captures" }));
    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: "Captured items" }).textContent,
      ).toContain("Second capture"),
    );
  });
});
