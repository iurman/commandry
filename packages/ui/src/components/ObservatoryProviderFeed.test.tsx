// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ObservatoryProviderFeed } from "./ObservatoryProviderFeed";
import type { ObservatoryProviderFeedQuery } from "@commandry/contracts";
afterEach(cleanup);
const at = "2026-10-16T12:00:00Z";
const feed = {
  state: "unavailable",
  lastSuccessAt: at,
  lastAttemptAt: at,
  lastError: "PROVIDER_TIMEOUT",
  revision: 7,
  snapshot: {
    provider: "cloudflare",
    endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
    readAt: at,
    reportedAt: "2026-10-15T12:00:00Z",
    complete: true,
    components: [
      { id: "workers", name: "Workers", status: "operational", groupId: null },
    ],
    notices: [],
  },
};
const items = Array.from({ length: 137 }, (_, n) => {
  const id = `notice-${n}`;
  return {
    id,
    providerId: "cloudflare",
    record: {
      id,
      kind: n === 136 ? "maintenance" : "incident",
      title:
        n === 136
          ? "<script>literal final maintenance</script>"
          : `Notice ${n}`,
      status: "investigating",
      severity: "major",
      componentIds: ["workers"],
      createdAt: at,
      updatedAt: "2026-10-14T12:00:00Z",
      resolvedAt: null,
      scheduledFor: null,
      scheduledUntil: null,
      evidenceHref: `https://www.cloudflarestatus.com/incidents/${id}`,
      updates: [
        {
          id: "update",
          status: "investigating",
          body: "<b>untrusted update</b>",
          occurredAt: at,
        },
      ],
    },
    sourceUpdatedAt: "2026-10-14T12:00:00Z",
    active: true,
    reconciledAt: null,
    lastSeenAt: at,
  };
});
const page = (
  list: typeof items,
  next: string | null = null,
  scope = "scope",
) => ({
  schemaVersion: 1,
  scopeDigest: scope,
  projectionRevision: "revision",
  population: "recorded_provider_notices",
  feed,
  items: list,
  nextCursor: next ? { afterId: next, revision: 7, scopeDigest: scope } : null,
});
it("reads all 137 notices, exposes the final item and every update literally, and separates source failure and notice times", async () => {
  const load = vi.fn(async (cursor: ObservatoryProviderFeedQuery["cursor"]) =>
    cursor ? page(items.slice(100)) : page(items.slice(0, 100), items[99]!.id),
  );
  const mounted = render(
    <ObservatoryProviderFeed scopeKey="scope" loadPage={load} />,
  );
  await screen.findByText(/137 of 137 recorded notices/);
  expect(load).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/Feed unavailable/).textContent).toContain(
    "PROVIDER_TIMEOUT",
  );
  expect(screen.getByText(/Structured response read/).textContent).toContain(
    feed.snapshot.reportedAt,
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "literal final" },
  });
  expect(screen.getByText(/1 of 137 recorded notices/)).toBeTruthy();
  expect(
    screen.getByText("<script>literal final maintenance</script>"),
  ).toBeTruthy();
  expect(screen.getByText("<b>untrusted update</b>")).toBeTruthy();
  expect(mounted.container.querySelector("script")).toBeNull();
  expect(screen.getByText(/Created .* updated/).textContent).toContain(
    "2026-10-14T12:00:00Z",
  );
  expect(
    screen
      .getByRole("link", { name: "Official notice notice-136", hidden: true })
      .getAttribute("href"),
  ).toBe("https://www.cloudflarestatus.com/incidents/notice-136");
  expect(screen.getByText(/Workers: workers/)).toBeTruthy();
});
it.each(["failure", "duplicate", "scope", "revision", "credential", "link"])(
  "withholds incomplete %s populations",
  async (mode) => {
    let calls = 0;
    const load = vi.fn(async () => {
      calls++;
      if (calls === 1 && mode === "failure")
        return page(items.slice(0, 100), items[99]!.id);
      if (mode === "failure") throw new Error("private error");
      if (mode === "duplicate") return page([items[0]!, items[0]!]);
      if (mode === "scope") return page([items[0]!], null, "foreign");
      if (mode === "revision")
        return {
          ...page([items[0]!], items[0]!.id),
          nextCursor: {
            afterId: items[0]!.id,
            revision: 8,
            scopeDigest: "scope",
          },
        };
      if (mode === "credential")
        return { ...page([]), token: "private credential" };
      return page([
        {
          ...items[0]!,
          record: {
            ...items[0]!.record,
            evidenceHref: "https://foreign.example",
          },
        },
      ]);
    });
    render(<ObservatoryProviderFeed scopeKey="scope" loadPage={load} />);
    await screen.findByRole("alert");
    expect(screen.queryByText("Notice 0")).toBeNull();
    expect(screen.queryByText(/private error|private credential/)).toBeNull();
  },
);
it("cancels late scope and paused reads without disclosing prior notices", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  const load = vi.fn(async () => pending);
  const next = vi.fn(async () => page([], null, "next"));
  const view = render(
    <ObservatoryProviderFeed scopeKey="scope" loadPage={load} />,
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  view.rerender(
    <ObservatoryProviderFeed scopeKey="next" loadPage={next} paused />,
  );
  await act(async () => {
    resolve(page([items[0]!]));
  });
  expect(screen.queryByText("Notice 0")).toBeNull();
  expect(next).not.toHaveBeenCalled();
  expect(screen.getByText(/reads paused/)).toBeTruthy();
  view.rerender(<ObservatoryProviderFeed scopeKey="next" loadPage={next} />);
  await screen.findByText(/0 of 0 recorded notices/);
  expect(screen.getByText(/source state does not establish/)).toBeTruthy();
});
