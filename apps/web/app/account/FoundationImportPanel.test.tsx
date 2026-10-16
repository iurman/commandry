// @vitest-environment jsdom

import { createHash, webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  planMnemosyneImport,
  type MnemosyneImportEnvelope,
} from "@commandry/application";
import FoundationImportPanel from "./FoundationImportPanel";

const id = (n: number) =>
  "0ef5d360-5d30-4863-a148-" + String(n).padStart(12, "0");
const projectId = id(1);
const key = id(99);
const original = "\uFEFFprivate\r\n<script>alert(1)</script>\u0000end";
const project = {
  id: projectId,
  name: "Notebook",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};
function envelope(count = 1): MnemosyneImportEnvelope {
  return {
    schemaVersion: 1,
    projectId,
    namespace: "selected-mnemosyne",
    records: Array.from({ length: count }, (_, index) => ({
      externalId: "memory-" + (index + 1),
      knowledgeItemId: id(10 + index),
      statement: "Exact statement " + (index + 1),
      category: "finding",
      sourceTier: (["public", "private", "client", "unknown"] as const)[
        index % 4
      ]!,
      selected: true,
      sources: [
        {
          evidence: {
            projectId,
            sourceKind: "external",
            sourceId: "source-" + index,
            sourceVersion: "v1",
            contentDigest: createHash("sha256").update(original).digest("hex"),
            locator: "closed-export:" + index,
            observedAt: "2026-10-01T09:00:00.123456+01:00",
            availability: "available",
          },
          originalContent: original,
        },
      ],
    })),
  };
}
function plan(e: MnemosyneImportEnvelope) {
  return planMnemosyneImport(e, {
    projectId: e.projectId,
    existing: [],
    reviewedSelections: new Map(),
  });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function receipt(e: MnemosyneImportEnvelope, replayed = false) {
  const rows = plan(e).records.filter((row) => row.selected);
  return {
    record: {
      schemaVersion: 1,
      id: id(100),
      projectId: e.projectId,
      namespace: e.namespace,
      appliedBy: "owner",
      recordedAt: "2026-10-16T09:00:00.000Z",
      records: rows.map((row, index) => ({
        externalId: row.alias.externalId,
        sourceTier: row.sourceTier,
        sourceFingerprint: row.sourceFingerprint,
        selectionFingerprint: row.selectionFingerprint,
        action: "created",
        memoryId: id(200 + index),
        version: 1,
        contentDigest: "c".repeat(64),
        importRevisionId: id(300 + index),
        sourceCount: row.sources.length,
      })),
    },
    replayed,
    correlationId: id(100),
  };
}
function mockServer(
  options: {
    preview?: (e: MnemosyneImportEnvelope) => unknown;
    apply?: (init: RequestInit) => Promise<Response>;
    project?: unknown;
  } = {},
) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/v1/projects/"))
      return json(options.project ?? project);
    const e = JSON.parse(String(init?.body)) as MnemosyneImportEnvelope;
    if (path.endsWith("/preview"))
      return json(options.preview ? options.preview(e) : plan(e));
    if (options.apply) return options.apply(init!);
    return json(
      receipt(
        (
          JSON.parse(String(init?.body)) as {
            envelope: MnemosyneImportEnvelope;
          }
        ).envelope,
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function upload(value: unknown = envelope(), file?: File) {
  const selected =
    file ??
    new File([JSON.stringify(value)], "selected.json", {
      type: "application/json",
    });
  fireEvent.change(screen.getByLabelText("Closed export JSON file"), {
    target: { files: [selected] },
  });
  return selected;
}
async function preview(value = envelope()) {
  upload(value);
  fireEvent.click(
    await screen.findByRole("button", { name: "Preview selected import" }),
  );
  await screen.findByRole("heading", { name: "Review destination: Notebook" });
}
function review(alias = "memory-1") {
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Review exact selection " + alias }),
  );
}
function confirm() {
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm reviewed selection" }),
  );
}
function applyCalls(mock: ReturnType<typeof mockServer>) {
  return mock.mock.calls.filter(([path]) => path.endsWith("/apply"));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("crypto", {
    subtle: webcrypto.subtle,
    randomUUID: vi.fn(() => key),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Selected memory import", () => {
  it("requires owner sign-in and performs no reads until explicit preview", async () => {
    const fetchMock = mockServer();
    const view = render(
      <FoundationImportPanel enabled={false} environment="local" />,
    );
    expect(screen.getByText(/Sign in with the owner password/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    view.rerender(<FoundationImportPanel enabled environment="local" />);
    upload();
    await screen.findByRole("button", { name: "Preview selected import" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["malformed", "oversize", "utf8", "records", "sources", "shape"])(
    "rejects %s files before network access",
    async (kind) => {
      const fetchMock = mockServer();
      render(<FoundationImportPanel enabled environment="test" />);
      if (kind === "malformed")
        upload(null, new File(["not JSON"], "bad.json"));
      else if (kind === "oversize") {
        const file = new File(["{}"], "large.json");
        Object.defineProperty(file, "size", { value: 8 * 1024 * 1024 + 1 });
        upload(null, file);
      } else if (kind === "utf8")
        upload(null, new File([new Uint8Array([0xc3, 0x28])], "invalid.json"));
      else if (kind === "records") upload(envelope(1001));
      else if (kind === "sources") {
        const e = envelope();
        e.records[0]!.sources = Array.from(
          { length: 1001 },
          () => e.records[0]!.sources[0]!,
        );
        upload(e);
      } else
        upload({ ...envelope(), records: [{ externalId: "private details" }] });
      await screen.findByRole("alert");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Preview selected import" }),
      ).toBeNull();
      expect(screen.getByRole("alert").textContent).not.toContain(
        "private details",
      );
    },
  );

  it("binds actual destination and requires each exact review for every source tier and separate cancellable confirmation", async () => {
    const e = envelope(4);
    const fetchMock = mockServer();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<FoundationImportPanel enabled environment="preview" />);
    await preview(e);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(4);
    expect(boxes.every((box) => !box.checked)).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Confirm reviewed selection" })
        .matches(":disabled"),
    ).toBe(true);
    expect(applyCalls(fetchMock)).toHaveLength(0);
    for (const row of e.records) review(row.externalId);
    confirm();
    const confirmation = screen.getByRole("group", {
      name: "Confirm selected memory import",
    });
    for (const text of [
      "Notebook",
      projectId,
      "preview",
      e.namespace,
      "4 selected records",
      "proposed and unverified",
    ])
      expect(confirmation.textContent).toContain(text);
    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    expect(applyCalls(fetchMock)).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Import as proposals" }),
    ).toBeNull();
    confirm();
    fireEvent.click(
      screen.getByRole("button", { name: "Import as proposals" }),
    );
    await screen.findByRole("heading", { name: "Import confirmed" });
    expect(applyCalls(fetchMock)).toHaveLength(1);
    const init = applyCalls(fetchMock)[0]![1]!;
    expect(JSON.parse(String(init.body))).toEqual({
      envelope: e,
      decision: "apply_proposed_unverified",
      reviewedSelections: plan(e).records.map((row) => ({
        externalId: row.alias.externalId,
        selectionFingerprint: row.selectionFingerprint,
        expectedExistingMemory: null,
      })),
    });
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    });
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.credentials).toBe("same-origin");
      expect(options?.cache).toBe("no-store");
      expect(options?.headers ?? {}).not.toHaveProperty("Origin");
    }
    expect(storage).not.toHaveBeenCalled();
    expect(screen.queryByText("Exact statement 1")).toBeNull();
    expect(document.body.textContent).not.toContain(original);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      (screen.getByLabelText("Closed export JSON file") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      screen
        .getByRole("link", { name: "Import revision " + id(300) })
        .getAttribute("href"),
    ).toBe("/api/v1/foundation/imports/" + id(300) + "?projectId=" + projectId);
  });

  it("makes all record and source pages reachable and preserves exact escaped originals and metadata", async () => {
    const e = envelope(21);
    e.records[0]!.sources = Array.from({ length: 11 }, (_, index) => ({
      ...e.records[0]!.sources[0]!,
      evidence: {
        ...e.records[0]!.sources[0]!.evidence,
        sourceId: "source-" + index,
      },
    }));
    mockServer();
    render(<FoundationImportPanel enabled environment="test" />);
    await preview(e);
    expect(screen.getAllByRole("checkbox")).toHaveLength(20);
    expect(
      screen.queryByRole("checkbox", {
        name: "Review exact selection memory-21",
      }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Original text memory-1 source 1").textContent,
    ).toBe(original);
    expect(
      screen.getByLabelText("Original JSON memory-1 source 1").textContent,
    ).toBe(JSON.stringify(original));
    expect(document.querySelector("script")).toBeNull();
    expect(
      screen.getAllByText("2026-10-01T09:00:00.123456+01:00").length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Inspect originals for memory-1 (11)"));
    fireEvent.click(
      screen.getByRole("button", { name: "Next sources for memory-1" }),
    );
    expect(
      screen.getByLabelText("Original text memory-1 source 11").textContent,
    ).toBe(original);
    expect(
      screen.queryByLabelText("Original text memory-1 source 1"),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Previous sources for memory-1" }),
    );
    expect(
      screen.getByLabelText("Original JSON memory-1 source 1").textContent,
    ).toBe(JSON.stringify(original));
    review();
    fireEvent.click(screen.getByRole("button", { name: "Next records" }));
    review("memory-21");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Next records" }).matches(":disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous records" }));
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Review exact selection memory-1",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it.each([
    "project",
    "namespace",
    "alias",
    "order",
    "selection",
    "fingerprint",
    "source",
    "count",
    "statement",
  ])("rejects corrupt preview %s without enabling apply", async (kind) => {
    const fetchMock = mockServer({
      preview: (e) => {
        const p = plan(e);
        if (kind === "project") p.projectId = id(9);
        if (kind === "namespace") p.namespace = "wrong";
        if (kind === "alias") p.records[0]!.alias.externalId = "wrong";
        if (kind === "order") p.records.reverse();
        if (kind === "selection") p.records[0]!.selected = false;
        if (kind === "fingerprint")
          p.records[0]!.selectionFingerprint = "a".repeat(64);
        if (kind === "source") p.records[0]!.sources[0]!.locator = "wrong";
        if (kind === "count") p.records[0]!.sources = [];
        if (kind === "statement") p.records[0]!.statement = "unrelated";
        return p;
      },
    });
    render(<FoundationImportPanel enabled environment="test" />);
    upload(envelope(2));
    fireEvent.click(
      await screen.findByRole("button", { name: "Preview selected import" }),
    );
    await screen.findByText(/Could not validate this preview/);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(applyCalls(fetchMock)).toHaveLength(0);
  });

  it("rejects a mismatched actual project and never renders unbounded server errors", async () => {
    const fetchMock = mockServer({
      project: { ...project, id: id(2), name: "private server text" },
    });
    render(<FoundationImportPanel enabled environment="local" />);
    upload();
    fireEvent.click(
      await screen.findByRole("button", { name: "Preview selected import" }),
    );
    await screen.findByRole("alert");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("private server text");
    expect(screen.getByRole("alert").textContent!.length).toBeLessThan(200);
  });

  it.each(["unavailable", "owner", "baseline", "knowledge"])(
    "blocks %s records with a repreview reason",
    async (kind) => {
      const e = envelope();
      if (kind === "unavailable") {
        e.records[0]!.sources[0]!.originalContent = null;
        e.records[0]!.sources[0]!.evidence.availability = "unavailable";
      }
      mockServer({
        preview: (value) => {
          const p = plan(value);
          if (kind !== "unavailable") {
            p.records[0]!.expectedExistingMemory = {
              id: id(700),
              version: 2,
              contentDigest: "b".repeat(64),
              knowledgeItemId: value.records[0]!.knowledgeItemId,
            };
            p.records[0]!.action =
              kind === "owner"
                ? "preserve_owner_changes"
                : "revision_requires_review";
            p.records[0]!.reason =
              kind === "owner"
                ? "owner_content_changed"
                : kind === "baseline"
                  ? "baseline_unavailable"
                  : "knowledge_item_changed";
          }
          return p;
        },
      });
      render(<FoundationImportPanel enabled environment="local" />);
      await preview(e);
      expect(screen.getByRole("checkbox").matches(":disabled")).toBe(true);
      expect(
        screen
          .getByRole("button", { name: "Confirm reviewed selection" })
          .matches(":disabled"),
      ).toBe(true);
    },
  );

  it("retries an uncertain write with the same exact snapshot and key without duplicate pending writes", async () => {
    const retry = deferred<Response>();
    let attempts = 0;
    const e = envelope();
    const fetchMock = mockServer({
      apply: async () => {
        if (++attempts === 1) throw new Error("private network details");
        return retry.promise;
      },
    });
    render(<FoundationImportPanel enabled environment="production" />);
    await preview(e);
    review();
    confirm();
    fireEvent.click(
      screen.getByRole("button", { name: "Import as proposals" }),
    );
    await screen.findByText(/Import outcome is uncertain/);
    expect(applyCalls(fetchMock)).toHaveLength(1);
    expect(document.body.textContent).not.toContain("private network details");
    expect(
      screen.getByLabelText("Closed export JSON file").matches(":disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry exact reviewed import" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry exact reviewed import" }),
    );
    expect(applyCalls(fetchMock)).toHaveLength(2);
    expect(applyCalls(fetchMock)[1]![1]!.body).toBe(
      applyCalls(fetchMock)[0]![1]!.body,
    );
    expect(applyCalls(fetchMock)[1]![1]!.headers).toEqual(
      applyCalls(fetchMock)[0]![1]!.headers,
    );
    await act(async () => retry.resolve(json(receipt(e, true))));
    await screen.findByText(/Original receipt replayed/);
    expect(document.body.textContent).not.toContain(original);
  });

  it("requires repreview and fresh exact reviews after a conflict", async () => {
    const fetchMock = mockServer({
      apply: async () => json({ error: original.repeat(1000) }, 409),
    });
    render(<FoundationImportPanel enabled environment="test" />);
    await preview();
    review();
    confirm();
    fireEvent.click(
      screen.getByRole("button", { name: "Import as proposals" }),
    );
    await screen.findByText(/baseline changed/);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview selected import" }),
    );
    await screen.findByRole("checkbox");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(applyCalls(fetchMock)).toHaveLength(1);
  });

  it("ignores stale file reads and preview responses after a file change", async () => {
    const oldRead = deferred<ArrayBuffer>();
    const oldPreview = deferred<Response>();
    let oldSignal: AbortSignal | undefined;
    const fetchMock = mockServer();
    fetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/v1/projects/")) return json(project);
      oldSignal = init?.signal ?? undefined;
      return oldPreview.promise;
    });
    render(<FoundationImportPanel enabled environment="preview" />);
    const file = new File([""], "slow.json");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => oldRead.promise,
    });
    upload(null, file);
    const next = envelope();
    next.namespace = "new-selection";
    upload(next);
    await screen.findByText(/new-selection/);
    await act(async () =>
      oldRead.resolve(
        new TextEncoder().encode(JSON.stringify(envelope()))
          .buffer as ArrayBuffer,
      ),
    );
    expect(document.body.textContent).not.toContain(
      "Namespace: selected-mnemosyne",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview selected import" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    upload(envelope());
    await screen.findByText(/Namespace: selected-mnemosyne/);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => oldPreview.resolve(json(plan(next))));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(applyCalls(fetchMock)).toHaveLength(0);
  });

  it.each(["disable", "unmount"])(
    "aborts preview on %s and ignores late delivery",
    async (action) => {
      const pending = deferred<Response>();
      const fetchMock = mockServer();
      let signal: AbortSignal | undefined;
      fetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
        if (path.startsWith("/api/v1/projects/")) return json(project);
        signal = init?.signal ?? undefined;
        return pending.promise;
      });
      const view = render(
        <FoundationImportPanel enabled environment="local" />,
      );
      upload();
      fireEvent.click(
        await screen.findByRole("button", { name: "Preview selected import" }),
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      if (action === "disable")
        view.rerender(
          <FoundationImportPanel enabled={false} environment="local" />,
        );
      else view.unmount();
      expect(signal?.aborted).toBe(true);
      await act(async () => pending.resolve(json(plan(envelope()))));
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(applyCalls(fetchMock)).toHaveLength(0);
    },
  );

  it("clears reviews and confirmation on repreview and file changes", async () => {
    mockServer();
    render(<FoundationImportPanel enabled environment="test" />);
    await preview();
    review();
    confirm();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview selected import" }),
    );
    await screen.findByRole("checkbox");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      screen.queryByRole("button", { name: "Import as proposals" }),
    ).toBeNull();
    review();
    confirm();
    upload(envelope(2));
    await screen.findByText(/2 records, 2 selected/);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Import as proposals" }),
    ).toBeNull();
  });

  it("treats corrupt success receipts as uncertain and keeps canonical IDs private until validated", async () => {
    const fetchMock = mockServer({
      apply: async () => {
        const result = receipt(envelope());
        result.record.records[0]!.selectionFingerprint = "a".repeat(64);
        return json(result);
      },
    });
    render(<FoundationImportPanel enabled environment="test" />);
    await preview();
    review();
    confirm();
    fireEvent.click(
      screen.getByRole("button", { name: "Import as proposals" }),
    );
    await screen.findByText(/Import outcome is uncertain/);
    expect(screen.queryByRole("link", { name: /Import revision/ })).toBeNull();
    expect(applyCalls(fetchMock)).toHaveLength(1);
  });
});
