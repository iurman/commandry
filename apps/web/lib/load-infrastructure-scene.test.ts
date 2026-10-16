import { expect, test, vi } from "vitest";
import type { InfrastructureOverview } from "@commandry/contracts";
import { loadInfrastructureScene } from "./load-infrastructure-scene";

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const firstRead = "2026-10-16T20:00:00.000Z";
const lastRead = "2026-10-16T20:00:02.000Z";
const signal = () => new AbortController().signal;

function resource(value: number): InfrastructureOverview["items"][number] {
  return {
    id: id(value),
    name: `Resource ${value}`,
    kind: "host",
    parentResourceId: null,
    childCount: 0,
    projects: [{ id: id(5000), name: "Authorized project" }],
    sources: [
      {
        id: id(6000 + value),
        name: "Actual source",
        kind: "netdata",
        enabled: true,
        observedAt: firstRead,
        freshnessWindowMinutes: 5,
        error: null,
      },
    ],
    telemetry: "reporting",
    health: "unknown",
    metrics: [
      {
        name: "cpu",
        unit: "%",
        value: 17,
        sampledAt: firstRead,
        evidenceHref: `/api/v1/source-envelopes/${id(7000 + value)}`,
      },
    ],
  };
}

function page(
  items: InfrastructureOverview["items"],
  total = items.length,
  nextCursor: string | null = null,
  extra: Partial<InfrastructureOverview> = {},
): InfrastructureOverview {
  return {
    readAt: firstRead,
    total,
    items,
    nextCursor,
    edges: [],
    events: [],
    ...extra,
  };
}

function event(value: number, occurredAt = firstRead) {
  return {
    id: id(8000 + value),
    resourceId: id(1),
    summary: `Recorded event ${value}`,
    occurredAt,
    sourceLabel: "Actual source",
    evidenceHref: `/api/v1/source-envelopes/${id(9000 + value)}`,
  };
}

test("exhausts more than 100 resources without filtering nested or standalone records", async () => {
  const resources = Array.from({ length: 137 }, (_, index) =>
    resource(index + 1),
  );
  resources[0]!.parentResourceId = id(80);
  resources[79]!.parentResourceId = id(120);
  resources[79]!.childCount = 1;
  resources[119]!.childCount = 1;
  resources[136]!.projects = [];
  const contains = {
    id: "host-child",
    from: id(80),
    to: id(1),
    type: "contains" as const,
  };
  const depends = {
    id: "cross-page",
    from: id(120),
    to: id(80),
    type: "depends_on" as const,
  };
  const pages = [
    page(resources.slice(0, 50), 137, id(50), { edges: [contains] }),
    page(resources.slice(50, 100), 137, id(100), {
      readAt: "2026-10-16T20:00:01.000Z",
      edges: [contains, depends],
    }),
    page(resources.slice(100), 137, null, {
      readAt: lastRead,
      edges: [depends],
    }),
  ];
  const before = structuredClone(pages);
  const requestSignal = signal();
  const fetchPage = vi.fn(
    async (cursor: string | null, received: AbortSignal) => {
      expect(received).toBe(requestSignal);
      return pages[cursor === null ? 0 : cursor === id(50) ? 1 : 2]!;
    },
  );
  const progress = vi.fn();
  const result = await loadInfrastructureScene(
    fetchPage,
    requestSignal,
    progress,
  );
  expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([
    null,
    id(50),
    id(100),
  ]);
  expect(progress.mock.calls).toEqual([
    [{ loaded: 50, total: 137 }],
    [{ loaded: 100, total: 137 }],
    [{ loaded: 137, total: 137 }],
  ]);
  expect(result).toEqual({
    readAt: firstRead,
    total: 137,
    items: resources,
    nextCursor: null,
    edges: [contains, depends],
    events: [],
  });
  expect(pages).toEqual(before);
});

test("accepts a truthful empty authorized scope and differing live read times", async () => {
  expect(await loadInfrastructureScene(async () => page([]), signal())).toEqual(
    page([]),
  );
  const pages = [
    page([resource(1)], 2, id(1), { readAt: lastRead }),
    page([resource(2)], 2, null, { readAt: "2026-10-16T21:00:01.000+01:00" }),
  ];
  const result = await loadInfrastructureScene(
    async () => pages.shift()!,
    signal(),
  );
  expect(result.readAt).toBe("2026-10-16T21:00:01.000+01:00");
  expect(result.items.map((item) => item.metrics[0]!.sampledAt)).toEqual([
    firstRead,
    firstRead,
  ]);
  expect(result.items.every((item) => item.health === "unknown")).toBe(true);
});

test("deduplicates real events globally, orders by time and identity, and retains the latest eight", async () => {
  const old = event(20, "2026-10-16T19:00:00.000Z");
  const events = Array.from({ length: 10 }, (_, index) => event(index + 1));
  const latest = event(30, "2026-10-16T21:00:00.000+00:00");
  const pages = [
    page([resource(1)], 2, id(1), {
      events: [events[8]!, old, events[4]!, events[0]!, events[6]!],
    }),
    page([resource(2)], 2, null, {
      events: [
        events[0]!,
        events[9]!,
        events[7]!,
        events[5]!,
        latest,
        events[3]!,
        events[2]!,
        events[1]!,
      ],
    }),
  ];
  const before = structuredClone(pages);
  const savedPages = pages.slice();
  const result = await loadInfrastructureScene(
    async () => pages.shift()!,
    signal(),
  );
  expect(result.events).toEqual([latest, ...events.slice(0, 7)]);
  expect(new Set(result.events.map((item) => item.id)).size).toBe(8);
  expect(savedPages).toEqual(before);
});

test("owns parsed nested values and never mutates or retains mutable input fixtures", async () => {
  const first = page([resource(1)], 2, id(1), { events: [event(1)] });
  const second = page([resource(2)], 2);
  const fetchPage = vi.fn(async (cursor: string | null) => {
    if (cursor === null) return first;
    first.items[0]!.name = "Changed after the first read";
    first.items[0]!.sources[0]!.name = "Changed source";
    first.items[0]!.metrics[0]!.value = 99;
    first.events[0]!.summary = "Changed event";
    return second;
  });
  const result = await loadInfrastructureScene(fetchPage, signal());
  expect(result.items[0]!).toEqual(resource(1));
  expect(result.events).toEqual([event(1)]);
  result.items[1]!.projects[0]!.name = "Scene-only change";
  result.items[1]!.sources[0]!.name = "Scene-only source";
  result.items[1]!.metrics[0]!.value = 5;
  expect(second.items[0]!).toEqual(resource(2));
});

test("rejects a later fetch failure without returning a partial scene or retrying", async () => {
  const failure = new Error("Later page unavailable");
  const fetchPage = vi.fn(async (cursor: string | null) => {
    if (cursor === null) return page([resource(1)], 2, id(1));
    throw failure;
  });
  const progress = vi.fn();
  await expect(
    loadInfrastructureScene(fetchPage, signal(), progress),
  ).rejects.toBe(failure);
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(progress.mock.calls).toEqual([[{ loaded: 1, total: 2 }]]);
});

test("rejects before fetching when already aborted", async () => {
  const controller = new AbortController();
  const reason = new Error("Scope already cancelled");
  controller.abort(reason);
  const fetchPage = vi.fn(async () => page([]));
  const progress = vi.fn();
  await expect(
    loadInfrastructureScene(fetchPage, controller.signal, progress),
  ).rejects.toBe(reason);
  expect(fetchPage).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalled();
});

test("rejects cancellation during a pending request even when the callback ignores its signal", async () => {
  const controller = new AbortController();
  const reason = new Error("Scope cancelled during request");
  let resolvePage!: (value: InfrastructureOverview) => void;
  const fetchPage = vi.fn(
    () =>
      new Promise<InfrastructureOverview>((resolve) => {
        resolvePage = resolve;
      }),
  );
  const progress = vi.fn();
  const pending = loadInfrastructureScene(
    fetchPage,
    controller.signal,
    progress,
  );
  const rejected = expect(pending).rejects.toBe(reason);
  controller.abort(reason);
  resolvePage(page([resource(1)]));
  await rejected;
  expect(fetchPage).toHaveBeenCalledWith(null, controller.signal);
  expect(progress).not.toHaveBeenCalled();
});

test("preserves cancellation when an aborted request rejects with another error", async () => {
  const controller = new AbortController();
  const reason = new Error("Cancelled scope");
  const fetchPage = vi.fn(async () => {
    controller.abort(reason);
    throw new Error("Transport failure after cancellation");
  });
  await expect(
    loadInfrastructureScene(fetchPage, controller.signal),
  ).rejects.toBe(reason);
});

test.each([false, true])(
  "checks abort after requests and after progress (abort in progress: %s)",
  async (duringProgress) => {
    const controller = new AbortController();
    const reason = new Error("Scope changed before publication");
    const fetchPage = vi.fn(async () => {
      if (!duringProgress) controller.abort(reason);
      return page([resource(1)]);
    });
    const progress = vi.fn(() => controller.abort(reason));
    await expect(
      loadInfrastructureScene(fetchPage, controller.signal, progress),
    ).rejects.toBe(reason);
    expect(progress).toHaveBeenCalledTimes(duringProgress ? 1 : 0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  },
);

test("does not fetch the next page after cancellation from progress", async () => {
  const controller = new AbortController();
  const fetchPage = vi.fn(async () => page([resource(1)], 2, id(1)));
  await expect(
    loadInfrastructureScene(fetchPage, controller.signal, () =>
      controller.abort(),
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchPage).toHaveBeenCalledTimes(1);
});

test("injected scope closures and abort signals isolate overlapping project or search loads", async () => {
  const oldController = new AbortController();
  let finishOld!: (value: InfrastructureOverview) => void;
  const oldFetch = vi.fn(
    () =>
      new Promise<InfrastructureOverview>((resolve) => {
        finishOld = resolve;
      }),
  );
  const oldProgress = vi.fn();
  const oldLoad = loadInfrastructureScene(
    oldFetch,
    oldController.signal,
    oldProgress,
  );
  const oldRejected = expect(oldLoad).rejects.toMatchObject({
    name: "AbortError",
  });
  oldController.abort();
  const authorized = resource(2);
  authorized.projects = [{ id: id(5001), name: "New authorized project" }];
  const newSignal = signal();
  const newFetch = vi.fn(async () => page([authorized]));
  const result = await loadInfrastructureScene(newFetch, newSignal);
  finishOld(page([resource(1)]));
  await oldRejected;
  expect(result.items).toEqual([authorized]);
  expect(oldProgress).not.toHaveBeenCalled();
  expect(oldFetch).toHaveBeenCalledWith(null, oldController.signal);
  expect(newFetch).toHaveBeenCalledWith(null, newSignal);
});

test.each([1, 3])(
  "rejects total churn to %s on a later page",
  async (changedTotal) => {
    const pages = [
      page([resource(1)], 2, id(1)),
      page([resource(2)], changedTotal),
    ];
    await expect(
      loadInfrastructureScene(async () => pages.shift()!, signal()),
    ).rejects.toThrow("population changed");
  },
);

test.each([
  [page([resource(1)], 2)],
  [page([resource(1), resource(2)], 1)],
  [page([resource(1)], 1, id(1))],
  [page([], 1, id(1))],
  [page([resource(1)], 2, id(1)), page([], 2)],
])(
  "rejects incomplete, excess, or empty nonterminal populations",
  async (...pages) => {
    await expect(
      loadInfrastructureScene(async () => pages.shift()!, signal()),
    ).rejects.toThrow(/population|empty page/);
  },
);

test.each([false, true])(
  "rejects duplicate resource identities within or across pages (across: %s)",
  async (across) => {
    const pages = across
      ? [page([resource(1)], 2, id(1)), page([resource(1)], 2)]
      : [page([resource(1), resource(1)], 2)];
    await expect(
      loadInfrastructureScene(async () => pages.shift()!, signal()),
    ).rejects.toThrow("resource identity");
  },
);

test.each([
  [id(10), id(10)],
  [id(10), id(20), id(10)],
])(
  "rejects repeated, nonadvancing, or cyclic continuation without another request",
  async (...nextCursors) => {
    let index = 0;
    const fetchPage = vi.fn(async () =>
      page([resource(++index)], 10, nextCursors[index - 1]!),
    );
    await expect(loadInfrastructureScene(fetchPage, signal())).rejects.toThrow(
      "did not advance",
    );
    expect(fetchPage).toHaveBeenCalledTimes(nextCursors.length);
  },
);

test.each(["from", "to", "type"] as const)(
  "rejects conflicting relationship identity when %s changes",
  async (field) => {
    const edge = {
      id: "real-edge",
      from: id(1),
      to: id(2),
      type: "contains" as const,
    };
    const changed = {
      ...edge,
      [field]: field === "type" ? "depends_on" : id(3),
    };
    const pages = [
      page([resource(1)], 2, id(1), { edges: [edge] }),
      page([resource(2)], 2, null, { edges: [changed] }),
    ];
    await expect(
      loadInfrastructureScene(async () => pages.shift()!, signal()),
    ).rejects.toThrow("relationship identity");
  },
);

test.each([
  { readAt: "not a date" },
  { total: -1 },
  { nextCursor: "not a UUID" },
  { items: [{ ...resource(1), health: "healthy" }] },
  {
    items: [
      {
        ...resource(1),
        metrics: [
          {
            name: "cpu",
            unit: "%",
            value: 5,
            sampledAt: firstRead,
            evidenceHref: "/made-up",
          },
        ],
      },
    ],
  },
  {
    edges: [{ id: "invalid", from: "not a UUID", to: id(2), type: "contains" }],
  },
  { events: [{ ...event(1), evidenceHref: "/made-up" }] },
])(
  "validates every response against the canonical contract",
  async (invalid) => {
    const progress = vi.fn();
    const malformed = {
      ...page([resource(1)]),
      ...invalid,
    } as unknown as InfrastructureOverview;
    await expect(
      loadInfrastructureScene(async () => malformed, signal(), progress),
    ).rejects.toThrow();
    expect(progress).not.toHaveBeenCalled();
  },
);

test("rejects malformed later pages instead of returning accumulated resources", async () => {
  const pages = [
    page([resource(1)], 2, id(1)),
    { ...page([resource(2)], 2), events: null },
  ];
  const fetchPage = vi.fn(async () => pages.shift() as InfrastructureOverview);
  await expect(loadInfrastructureScene(fetchPage, signal())).rejects.toThrow();
  expect(fetchPage).toHaveBeenCalledTimes(2);
});
