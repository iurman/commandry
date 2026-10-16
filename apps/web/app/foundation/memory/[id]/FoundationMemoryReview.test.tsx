// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  foundationOwnerMemoryReadSchema,
  foundationOwnerMemoryReviewResultSchema,
  foundationReviewMemorySchema,
  type FoundationOwnerMemoryRead,
} from "@commandry/contracts";
import { FoundationMemoryReview } from "./FoundationMemoryReview";

// Synthetic HTTP only. These tests establish no owner-session, database,
// browser layout, production transport or audit persistence behavior.
const id = (n: number) =>
  "0ef5d360-5d30-4863-a148-" + String(n).padStart(12, "0");
const projectId = id(1);
const memoryId = id(2);
const key = id(90);
const at = "2026-10-16T09:00:00.000Z";
const statement =
  "\ufeff  Exact <script>attack()</script>\r\n<img src=x onerror=attack()>\r\n  end  ";
const reason =
  "\ufeff  Owner reviewed this exact assertion.\n  Preserve spacing.  ";
const props = { enabled: true, projectId, memoryId };

function detail(
  memory = memoryId,
  project = projectId,
): FoundationOwnerMemoryRead {
  return foundationOwnerMemoryReadSchema.parse({
    memory: {
      schemaVersion: 1,
      id: memory,
      projectId: project,
      knowledgeItemId: id(3),
      version: 4,
      contentDigest: "a".repeat(64),
      content: {
        statement,
        category: "instruction",
        evidenceIds: [id(4)],
        relatedMemoryIds: [id(5)],
        relationType: "contradicts",
      },
      lifecycle: "proposed",
      verification: "unverified",
      recordedBy: "foundation-client:" + id(6),
      recordedAt: at,
    },
    anchor: {
      knowledgeItemId: id(3),
      knowledgeVersion: 7,
      evidenceId: id(4),
      sourceVersion: "exact revision 7",
      contentDigest: "b".repeat(64),
      freshness: "unknown",
    },
  });
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function receipt(d = detail(), decision = "accepted", replayed = false) {
  return foundationOwnerMemoryReviewResultSchema.parse({
    record: { ...d.memory, lifecycle: decision },
    replayed,
    correlationId: id(91),
  });
}
function server(
  options: {
    read?: (path: string, init?: RequestInit) => Promise<Response>;
    post?: (path: string, init: RequestInit) => Promise<Response>;
  } = {},
) {
  const mock = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return options.post
        ? options.post(path, init)
        : json(receipt(detail(), JSON.parse(String(init.body)).decision));
    return options.read ? options.read(path, init) : json(detail());
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
function posts(mock: ReturnType<typeof server>) {
  return mock.mock.calls.filter(([, init]) => init?.method === "POST");
}
function sent(mock: ReturnType<typeof server>, index = 0) {
  const [path, init] = posts(mock)[index]!;
  return {
    path,
    init: init!,
    body: JSON.parse(String(init!.body)) as Record<string, unknown>,
  };
}
async function ready() {
  await screen.findByLabelText("Review decision");
}
function select(decision = "accepted", text = reason) {
  fireEvent.change(screen.getByLabelText("Review decision"), {
    target: { value: decision },
  });
  fireEvent.change(screen.getByLabelText("Review reason"), {
    target: { value: text },
  });
}
function save() {
  fireEvent.submit(screen.getByLabelText("Review reason").closest("form")!);
}
async function uncertain() {
  await screen.findByText(
    "This review may have been saved. Retry the same decision to confirm its receipt.",
  );
}

beforeEach(() => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(key);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("owner memory review read boundary", () => {
  it("does not fetch while disabled and clears a loaded selection on disable", async () => {
    const mock = server();
    const view = render(<FoundationMemoryReview {...props} enabled={false} />);
    expect(mock).not.toHaveBeenCalled();
    expect(screen.getByText(/Sign in with the owner password/)).toBeTruthy();
    view.rerender(<FoundationMemoryReview {...props} />);
    await ready();
    view.rerender(<FoundationMemoryReview {...props} enabled={false} />);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Assertion statement")).toBeNull();
    expect(screen.queryByLabelText("Review reason")).toBeNull();
  });

  it("loads exact scope with same-origin/no-store and shows escaped assertion/source metadata", async () => {
    const mock = server();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const view = render(<FoundationMemoryReview {...props} />);
    await ready();
    expect(mock.mock.calls[0]?.[0]).toBe(
      "/api/v1/foundation/memory/" + memoryId + "?projectId=" + projectId,
    );
    expect(mock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(screen.getByLabelText("Assertion statement").textContent).toBe(
      statement,
    );
    expect(view.container.querySelector("script")).toBeNull();
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByText("instruction")).toBeTruthy();
    expect(screen.getByText("unknown")).toBeTruthy();
    expect(screen.getByText("foundation-client:" + id(6))).toBeTruthy();
    expect(
      screen.getByText(
        "Acceptance changes lifecycle only. Factual verification and instruction approval require separate owner decisions.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View current Knowledge source JSON" })
        .getAttribute("href"),
    ).toBe("/api/v1/knowledge-items/" + id(3));
    expect(screen.getByLabelText("Review decision").tagName).toBe("SELECT");
    expect(
      (screen.getByLabelText("Review decision") as HTMLSelectElement).value,
    ).toBe("");
    expect(storage).not.toHaveBeenCalled();
  });

  it("keeps every evidence and related assertion ID reachable without truncating long source text", async () => {
    const d = detail();
    d.memory.content.statement =
      "<script>private()</script>" + "x".repeat(19000);
    d.memory.content.evidenceIds = Array.from({ length: 137 }, (_, i) =>
      id(100 + i),
    );
    d.memory.content.relatedMemoryIds = Array.from({ length: 131 }, (_, i) =>
      id(300 + i),
    );
    d.anchor.evidenceId = d.memory.content.evidenceIds[0]!;
    d.anchor.sourceVersion = "exact-source-" + "x".repeat(10000);
    server({ read: async () => json(d) });
    const view = render(<FoundationMemoryReview {...props} />);
    await ready();
    expect(
      screen.getByLabelText("All evidence IDs").querySelectorAll("li"),
    ).toHaveLength(137);
    expect(
      screen.getByLabelText("All related assertion IDs").querySelectorAll("li"),
    ).toHaveLength(131);
    expect(screen.getByText(id(236))).toBeTruthy();
    expect(screen.getByLabelText("Assertion statement").textContent).toBe(
      d.memory.content.statement,
    );
    expect(screen.getByText(d.anchor.sourceVersion)).toBeTruthy();
    expect(view.container.querySelector("script")).toBeNull();
    expect(view.container.querySelector("style")).toBeNull();
  });

  it.each([401, 403, 404, 503])(
    "renders static read %i failure with safe retry",
    async (status) => {
      let count = 0;
      const mock = server({
        read: async () =>
          ++count === 1 ? json({ message: statement }, status) : json(detail()),
      });
      render(<FoundationMemoryReview {...props} />);
      const button = await screen.findByRole("button", {
        name:
          status === 401 || status === 403
            ? "Retry after sign-in"
            : "Reload current state",
      });
      expect(document.body.textContent).not.toContain(statement);
      expect(screen.queryByLabelText("Review reason")).toBeNull();
      fireEvent.click(button);
      await ready();
      expect(mock).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["memory", "project", "anchor", "extra", "nested-extra"] as const)(
    "withholds actions for malformed or wrong %s read",
    async (change) => {
      const d = detail(
        change === "memory" ? id(50) : memoryId,
        change === "project" ? id(51) : projectId,
      );
      let value: unknown = d;
      if (change === "anchor") d.anchor.knowledgeItemId = id(52);
      if (change === "extra") value = { ...d, owner: true };
      if (change === "nested-extra")
        value = { ...d, memory: { ...d.memory, private: statement } };
      server({ read: async () => json(value) });
      render(<FoundationMemoryReview {...props} />);
      await screen.findByRole("alert");
      expect(screen.queryByLabelText("Review decision")).toBeNull();
      expect(document.body.textContent).not.toContain(statement);
    },
  );

  it("does not mistake an accepted GET state for a confirmed POST receipt", async () => {
    const d = detail();
    d.memory.lifecycle = "accepted";
    const mock = server({ read: async () => json(d) });
    render(<FoundationMemoryReview {...props} />);
    await ready();
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.queryByText("Review receipt confirmed")).toBeNull();
    expect(posts(mock)).toHaveLength(0);
  });
});

describe("explicit lifecycle review", () => {
  it.each(["accepted", "rejected", "superseded"] as const)(
    "submits exact %s choice/reason with preserved content version and strict receipt",
    async (choice) => {
      const mock = server();
      render(<FoundationMemoryReview {...props} />);
      await ready();
      select(choice);
      save();
      await screen.findByText("Review receipt confirmed");
      expect(sent(mock).path).toBe(
        "/api/v1/foundation/memory/" + memoryId + "/review",
      );
      expect(sent(mock).body).toEqual({
        projectId,
        expectedVersion: 4,
        decision: choice,
        reason,
      });
      expect(sent(mock).init.headers).toEqual({
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      });
      expect(sent(mock).init).toMatchObject({
        credentials: "same-origin",
        cache: "no-store",
      });
      expect(
        foundationReviewMemorySchema.safeParse({ ...sent(mock).body, memoryId })
          .success,
      ).toBe(true);
      expect(
        screen.getByText(
          "Lifecycle in this receipt: " + choice + ". Content version: 4.",
        ),
      ).toBeTruthy();
      expect(screen.queryByLabelText("Review reason")).toBeNull();
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["", reason],
    ["accepted", ""],
    ["accepted", "   "],
    ["accepted", "x".repeat(4001)],
  ])(
    "requires a valid explicit choice and nonblank bounded reason",
    async (choice, text) => {
      const mock = server();
      render(<FoundationMemoryReview {...props} />);
      await ready();
      select(choice, text);
      save();
      await screen.findByRole("alert");
      expect(posts(mock)).toHaveLength(0);
      expect(crypto.randomUUID).not.toHaveBeenCalled();
    },
  );

  it("fails safely before network when secure UUID preparation throws", async () => {
    vi.mocked(crypto.randomUUID).mockImplementation(() => {
      throw new Error(statement);
    });
    const mock = server();
    render(<FoundationMemoryReview {...props} />);
    await ready();
    select();
    save();
    await screen.findByText(
      "Could not prepare a secure review request. Try again.",
    );
    expect(posts(mock)).toHaveLength(0);
    expect(document.body.textContent).not.toContain(statement + statement);
  });

  it("blocks duplicate sends while pending and ignores programmatic edits to frozen fields", async () => {
    const pending = deferred<Response>();
    const mock = server({ post: async () => pending.promise });
    render(<FoundationMemoryReview {...props} />);
    await ready();
    select();
    save();
    save();
    expect(posts(mock)).toHaveLength(1);
    expect(
      (screen.getByLabelText("Review reason") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Review reason"), {
      target: { value: "changed" },
    });
    fireEvent.change(screen.getByLabelText("Review decision"), {
      target: { value: "rejected" },
    });
    expect(
      (screen.getByLabelText("Review reason") as HTMLTextAreaElement).value,
    ).toBe(reason);
    expect(
      (screen.getByLabelText("Review decision") as HTMLSelectElement).value,
    ).toBe("accepted");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same decision" }),
    );
    expect(posts(mock)).toHaveLength(1);
    await act(async () => pending.resolve(json(receipt())));
    await screen.findByText("Review receipt confirmed");
  });

  it("handles an exact version conflict by requiring a fresh read/new decision", async () => {
    let reads = 0;
    const revised = detail();
    revised.memory.version = 5;
    revised.memory.contentDigest = "c".repeat(64);
    const mock = server({
      read: async () => json(++reads === 1 ? detail() : revised),
      post: async (_path, init) =>
        JSON.parse(String(init.body)).expectedVersion === 4
          ? json({ code: "VERSION_CONFLICT" }, 409)
          : json(receipt(revised, JSON.parse(String(init.body)).decision)),
    });
    render(<FoundationMemoryReview {...props} />);
    await ready();
    select();
    save();
    await screen.findByText(
      "The assertion version changed. Reload current state before deciding again.",
    );
    expect(
      screen.queryByRole("button", { name: "Retry same decision" }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Review decision") as HTMLSelectElement).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current state" }),
    );
    await ready();
    expect(
      (screen.getByLabelText("Review decision") as HTMLSelectElement).value,
    ).toBe("");
    select("rejected", "New version review");
    save();
    await screen.findByText("Review receipt confirmed");
    expect(sent(mock, 1).body.expectedVersion).toBe(5);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
  });

  it("accepts independent factual verification changes without implying instruction approval", async () => {
    const result = receipt();
    result.record.verification = "source_matched";
    server({ post: async () => json(result) });
    render(<FoundationMemoryReview {...props} />);
    await ready();
    select();
    save();
    await screen.findByText("Review receipt confirmed");
    expect(screen.getByText("unverified")).toBeTruthy();
    expect(screen.queryByText("source_matched")).toBeNull();
  });
});

describe("uncertain delivery and exact retry", () => {
  it.each([
    "network",
    "bad-json",
    "server",
    "auth",
    "malformed-conflict",
  ] as const)(
    "retains frozen input/key after %s and resolves only a valid exact receipt",
    async (failure) => {
      let writes = 0;
      const mock = server({
        post: async () => {
          if (++writes > 1) return json(receipt(detail(), "accepted", true));
          if (failure === "network") throw new Error("private wire details");
          if (failure === "bad-json")
            return new Response("private invalid json");
          if (failure === "server") return json({ code: "PRIVATE" }, 503);
          if (failure === "auth") return json({ code: "EXPIRED" }, 401);
          return json({ code: "VERSION_CONFLICT", private: statement }, 409);
        },
      });
      render(<FoundationMemoryReview {...props} />);
      await ready();
      select();
      save();
      await uncertain();
      expect(screen.queryByText("Review receipt confirmed")).toBeNull();
      expect(
        (screen.getByLabelText("Review reason") as HTMLTextAreaElement)
          .disabled,
      ).toBe(true);
      expect(
        screen.queryByRole("button", { name: "Save review decision" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Reload current state" }),
      ).toBeNull();
      expect(document.body.textContent).not.toContain("private wire details");
      const first = sent(mock).init;
      fireEvent.click(
        screen.getByRole("button", { name: "Retry same decision" }),
      );
      await screen.findByText("Original review receipt replayed.");
      expect(sent(mock, 1).init.body).toBe(first.body);
      expect(sent(mock, 1).init.headers).toEqual(first.headers);
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "id",
    "project",
    "version",
    "lifecycle",
    "digest",
    "content",
    "envelope",
    "replayed",
  ] as const)(
    "keeps malformed or mismatched %s receipts uncertain",
    async (change) => {
      const result = receipt();
      let value: unknown = result;
      if (change === "id") result.record.id = id(60);
      if (change === "project") result.record.projectId = id(61);
      if (change === "version") result.record.version++;
      if (change === "lifecycle") result.record.lifecycle = "rejected";
      if (change === "digest") result.record.contentDigest = "c".repeat(64);
      if (change === "content")
        result.record.content.statement = "private substituted assertion";
      if (change === "envelope") value = { ...result, owner: true };
      if (change === "replayed") value = { ...result, replayed: "true" };
      const mock = server({ post: async () => json(value) });
      render(<FoundationMemoryReview {...props} />);
      await ready();
      select();
      save();
      await uncertain();
      expect(screen.queryByText("Review receipt confirmed")).toBeNull();
      expect(document.body.textContent).not.toContain(
        "private substituted assertion",
      );
      expect(posts(mock)).toHaveLength(1);
    },
  );
});

describe("scope changes, cancellation and current-state reads", () => {
  it("aborts and ignores an old read when project/assertion changes", async () => {
    const slow = deferred<Response>();
    const second = detail(id(70), id(71));
    second.memory.content.statement = "Second project assertion";
    const mock = server({
      read: async (path) =>
        path.includes(memoryId) ? slow.promise : json(second),
    });
    const view = render(<FoundationMemoryReview {...props} />);
    view.rerender(
      <FoundationMemoryReview enabled projectId={id(71)} memoryId={id(70)} />,
    );
    expect(screen.queryByLabelText("Assertion statement")).toBeNull();
    await ready();
    expect(mock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => slow.resolve(json(detail())));
    expect(screen.getByLabelText("Assertion statement").textContent).toBe(
      "Second project assertion",
    );
  });

  it("keeps returning A non-actionable until its new read completes after A/B/A", async () => {
    const pending = deferred<Response>();
    const b = detail(id(73), id(74));
    let aReads = 0;
    const mock = server({
      read: async (path) =>
        !path.includes(memoryId)
          ? json(b)
          : ++aReads === 1
            ? json(detail())
            : pending.promise,
    });
    const view = render(<FoundationMemoryReview {...props} />);
    await ready();
    view.rerender(
      <FoundationMemoryReview enabled memoryId={id(73)} projectId={id(74)} />,
    );
    await ready();
    view.rerender(<FoundationMemoryReview {...props} />);
    expect(screen.queryByLabelText("Review reason")).toBeNull();
    expect(screen.getByText("Loading assertion review...")).toBeTruthy();
    await act(async () => pending.resolve(json(detail())));
    await ready();
    expect(posts(mock)).toHaveLength(0);
  });

  it("retains an uncertain attempt across prop switch and does not use a fresh GET as its receipt", async () => {
    const d = detail();
    const b = detail(id(75), id(76));
    b.memory.content.statement = "Another project text";
    let writes = 0;
    let aReads = 0;
    const mock = server({
      read: async (path) => {
        if (!path.includes(memoryId)) return json(b);
        aReads++;
        return json(
          aReads === 1
            ? d
            : { ...d, memory: { ...d.memory, lifecycle: "accepted" } },
        );
      },
      post: async () =>
        ++writes === 1 ? json({}, 503) : json(receipt(d, "accepted", true)),
    });
    const view = render(<FoundationMemoryReview {...props} />);
    await ready();
    select();
    save();
    await uncertain();
    const first = sent(mock).init;
    view.rerender(
      <FoundationMemoryReview enabled memoryId={id(75)} projectId={id(76)} />,
    );
    expect(screen.queryByLabelText("Assertion statement")).toBeNull();
    await ready();
    expect(
      screen.getByText(
        "An earlier review is unresolved. Return to its assertion to retry before starting another review.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Review reason") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    expect(document.body.textContent).not.toContain(reason);
    view.rerender(<FoundationMemoryReview {...props} />);
    await ready();
    await uncertain();
    expect(screen.queryByText("Review receipt confirmed")).toBeNull();
    expect(
      (screen.getByLabelText("Review reason") as HTMLTextAreaElement).value,
    ).toBe(reason);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same decision" }),
    );
    await screen.findByText("Original review receipt replayed.");
    expect(sent(mock, 1).init.body).toBe(first.body);
    expect(sent(mock, 1).init.headers).toEqual(first.headers);
  });

  it("aborts an old POST and ignores late success after switching away and returning", async () => {
    const pending = deferred<Response>();
    let writes = 0;
    const b = detail(id(77), id(78));
    const mock = server({
      read: async (path) => json(path.includes(memoryId) ? detail() : b),
      post: async () =>
        ++writes === 1
          ? pending.promise
          : json(receipt(detail(), "accepted", true)),
    });
    const view = render(<FoundationMemoryReview {...props} />);
    await ready();
    select();
    save();
    const first = sent(mock).init;
    view.rerender(
      <FoundationMemoryReview enabled memoryId={id(77)} projectId={id(78)} />,
    );
    await ready();
    expect(first.signal?.aborted).toBe(true);
    view.rerender(<FoundationMemoryReview {...props} />);
    await ready();
    await uncertain();
    await act(async () => pending.resolve(json(receipt())));
    expect(screen.queryByText("Review receipt confirmed")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same decision" }),
    );
    await screen.findByText("Original review receipt replayed.");
    expect(sent(mock, 1).init.body).toBe(first.body);
  });

  it.each(["read", "post"] as const)(
    "aborts %s on unmount and ignores late data",
    async (phase) => {
      const pending = deferred<Response>();
      const mock = server({
        read: async () => (phase === "read" ? pending.promise : json(detail())),
        post: async () => pending.promise,
      });
      const view = render(<FoundationMemoryReview {...props} />);
      if (phase === "post") {
        await ready();
        select();
        save();
      }
      const init = phase === "read" ? mock.mock.calls[0]?.[1] : sent(mock).init;
      view.unmount();
      expect(init?.signal?.aborted).toBe(true);
      await act(async () =>
        pending.resolve(json(phase === "post" ? receipt() : detail())),
      );
      expect(screen.queryByText("Review receipt confirmed")).toBeNull();
    },
  );

  it("retains exact uncertain input through disable and reauthentication", async () => {
    let writes = 0;
    const mock = server({
      post: async () =>
        ++writes === 1
          ? json({}, 401)
          : json(receipt(detail(), "accepted", true)),
    });
    const view = render(<FoundationMemoryReview {...props} />);
    await ready();
    select();
    save();
    await uncertain();
    view.rerender(<FoundationMemoryReview {...props} enabled={false} />);
    expect(
      screen.queryByRole("button", { name: "Retry same decision" }),
    ).toBeNull();
    view.rerender(<FoundationMemoryReview {...props} />);
    await ready();
    await uncertain();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same decision" }),
    );
    await screen.findByText("Original review receipt replayed.");
    expect(sent(mock, 1).init.body).toBe(sent(mock).init.body);
  });
});
