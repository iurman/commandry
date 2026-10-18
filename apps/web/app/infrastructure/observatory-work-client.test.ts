// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
} from "react";
import InfrastructureOverviewScreen from "./InfrastructureOverviewScreen";
import { projectObservatory } from "@commandry/domain";
import {
  scaleObservatoryFixture,
  mixedObservatoryFixture,
  observatoryFixtureInput,
  observatoryFixtureResource,
} from "@commandry/test-support";
import type {
  RendererHooks,
  RendererSettings,
} from "@commandry/ui/gravity/renderer";
import type { Well } from "@commandry/ui/gravity/model";
import { OperationalRecordedActivity } from "@commandry/ui/gravity/operational-layout";
import type { InfrastructureOverview } from "@commandry/contracts";
import type {
  FoundationProjectWorkCursor,
  FoundationProjectWorkPage,
  FoundationProjectWorkRecord,
} from "@commandry/contracts";
import {
  loadObservatoryWorkPage,
  loadCompleteObservatoryWorkProjects,
} from "./observatory-work-client";
import type { ProjectRecord, PageResponse } from "../projects/api";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
const projectId = id(1),
  otherProjectId = id(2);
const work = (project = projectId): FoundationProjectWorkRecord => ({
  id: id(100),
  projectId: project,
  sourceCaptureId: id(200),
  generatedFromWorkItemId: null,
  title: "Literal <script>source</script>",
  description: "Original Work\ntext",
  workType: "initiative",
  assigneeKind: "agent",
  assigneeAgentId: id(300),
  assigneeLabel: "Assigned only",
  status: "done",
  priority: "high",
  dueOn: "2026-11-02",
  contextLink: null,
  createdAt: "2026-10-01T12:00:00.123Z",
  updatedAt: "2026-10-16T11:00:00.456Z",
});
const page = (project = projectId): FoundationProjectWorkPage => ({
  schemaVersion: 1,
  requestedProjectId: project,
  consistency: "live",
  selectedAt: "2026-10-16T12:00:00Z",
  items: [{ work: work(project), contentDigest: "a".repeat(64) }],
  nextCursor: null,
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("complete canonical project catalogue for Work", () => {
  const project = (n: number): ProjectRecord => ({
    id: id(n),
    name: "Canonical project " + n,
    summary: null,
    type: "project",
    lifecycle: "active",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-16T00:00:00Z",
  });
  it("keeps all 193 canonical projects through continuation without using resource population", async () => {
    const items = Array.from({ length: 193 }, (_, n) => project(n + 1000));
    const load = vi.fn(async (cursor: string | null) =>
      cursor === null
        ? { items: items.slice(0, 100), nextCursor: "second-page" }
        : { items: items.slice(100), nextCursor: null },
    );
    expect(await loadCompleteObservatoryWorkProjects(load)).toEqual(items);
    expect(load.mock.calls).toEqual([[null], ["second-page"]]);
  });
  it("rejects duplicate canonical project identities, including different UUID spelling", async () => {
    const load = vi.fn(async (cursor: string | null) =>
      cursor === null
        ? { items: [project(1000)], nextCursor: "next" }
        : {
            items: [{ ...project(1000), id: project(1000).id.toUpperCase() }],
            nextCursor: null,
          },
    );
    await expect(loadCompleteObservatoryWorkProjects(load)).rejects.toThrow();
  });
  it("rejects continuation cycles before accepting a catalogue", async () => {
    let call = 0;
    const load = vi.fn(async () => ({
      items: [project(1000 + ++call)],
      nextCursor: call === 2 ? "two" : "one",
    }));
    await expect(loadCompleteObservatoryWorkProjects(load)).rejects.toThrow(
      "Canonical project catalogue unavailable",
    );
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("rejects a failed continuation without returning the already loaded projects", async () => {
    const load = vi.fn(async (cursor: string | null) => {
      if (cursor !== null) throw new Error("Catalogue denied");
      return { items: [project(1000)], nextCursor: "next" };
    });
    await expect(loadCompleteObservatoryWorkProjects(load)).rejects.toThrow(
      "Catalogue denied",
    );
    expect(load).toHaveBeenCalledTimes(2);
  });
  it.each([
    { items: [], nextCursor: "not-exhausted" },
    { items: [project(1000)], nextCursor: "" },
    { items: [project(1000)], nextCursor: undefined },
    {
      items: [{ ...project(1000), id: "not-a-canonical-id" }],
      nextCursor: null,
    },
  ])("rejects malformed/incomplete catalogue data (%j)", async (value) => {
    await expect(
      loadCompleteObservatoryWorkProjects(
        async () => value as PageResponse<ProjectRecord>,
      ),
    ).rejects.toThrow();
  });
  it("accepts an actual exhausted empty catalogue", async () => {
    expect(
      await loadCompleteObservatoryWorkProjects(async () => ({
        items: [],
        nextCursor: null,
      })),
    ).toEqual([]);
  });
});

describe("same-origin canonical owner Work browser loader", () => {
  it("posts an explicit null first cursor and limit 100 to the fixed owner endpoint without extra authority", async () => {
    const result = page(),
      fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(result));
    vi.stubGlobal("fetch", fetch);
    expect(await loadObservatoryWorkPage(projectId, null)).toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/v1/infrastructure/observatory/work/page");
    expect(init).toMatchObject({
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId,
      limit: 100,
      cursor: null,
    });
  });
  it("passes the exact released continuation and returns parsed canonical data without changing Work or dates", async () => {
    const cursor = { projectId, afterId: id(99) },
      result = page();
    result.nextCursor = { projectId, afterId: result.items[0]!.work.id };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(result),
    );
    vi.stubGlobal("fetch", fetch);
    const received = await loadObservatoryWorkPage(projectId, cursor);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      projectId,
      limit: 100,
      cursor,
    });
    expect(received).toEqual(result);
    expect(received.items[0]!.work).toEqual(work());
    expect(received.nextCursor).toEqual(result.nextCursor);
  });
  it.each([
    undefined,
    "opaque-cursor",
    [],
    { projectId: otherProjectId, afterId: id(99) },
    { projectId, afterId: "invalid" },
    { projectId, afterId: id(99), privateAuthority: "PRIVATE" },
  ])(
    "rejects malformed or foreign input continuation before any request (%j)",
    async (cursor) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      vi.stubGlobal("fetch", fetch);
      await expect(
        loadObservatoryWorkPage(
          projectId,
          cursor as FoundationProjectWorkCursor,
        ),
      ).rejects.toThrow("Canonical Work unavailable");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed project identity before any request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    await expect(
      loadObservatoryWorkPage("https://arbitrary.invalid/PRIVATE", null),
    ).rejects.toThrow("Canonical Work unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500])(
    "rejects HTTP %s without returning a partial empty population or private body",
    async (status) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ private: "PRIVATE_PROVIDER_BODY" }, { status }),
      );
      vi.stubGlobal("fetch", fetch);
      await expect(loadObservatoryWorkPage(projectId, null)).rejects.toThrow(
        /^Canonical Work unavailable$/,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    "version",
    "consistency",
    "extra field",
    "foreign page",
    "foreign row",
    "foreign continuation",
    "wrong continuation boundary",
    "invalid status",
    "missing nullable field",
    "missing digest",
    "invalid selectedAt",
  ])("rejects malformed released page: %s", async (mode) => {
    const result = page();
    if (mode === "version") Object.assign(result, { schemaVersion: 2 });
    if (mode === "consistency")
      Object.assign(result, { consistency: "snapshot" });
    if (mode === "extra field")
      Object.assign(result, { private: "PRIVATE_PROVIDER_BODY" });
    if (mode === "foreign page") Object.assign(result, page(otherProjectId));
    if (mode === "foreign row")
      result.items[0]!.work.projectId = otherProjectId;
    if (mode === "foreign continuation")
      result.nextCursor = { projectId: otherProjectId, afterId: id(100) };
    if (mode === "wrong continuation boundary")
      result.nextCursor = { projectId, afterId: id(999) };
    if (mode === "invalid status")
      Object.assign(result.items[0]!.work, { status: "running" });
    if (mode === "missing nullable field")
      Reflect.deleteProperty(result.items[0]!.work, "dueOn");
    if (mode === "missing digest")
      Reflect.deleteProperty(result.items[0]!, "contentDigest");
    if (mode === "invalid selectedAt") result.selectedAt = "not-a-time";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => Response.json(result)),
    );
    await expect(loadObservatoryWorkPage(projectId, null)).rejects.toThrow(
      /^Canonical Work unavailable$/,
    );
  });
  it("rejects invalid JSON, redirected responses and transport errors with one safe error and no fallback request", async () => {
    for (const response of [
      new Response("PRIVATE invalid JSON"),
      Object.defineProperty(Response.json(page()), "redirected", {
        value: true,
      }),
    ]) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response);
      vi.stubGlobal("fetch", fetch);
      await expect(loadObservatoryWorkPage(projectId, null)).rejects.toThrow(
        /^Canonical Work unavailable$/,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("PRIVATE transport failure");
    });
    vi.stubGlobal("fetch", fetch);
    await expect(loadObservatoryWorkPage(projectId, null)).rejects.toThrow(
      /^Canonical Work unavailable$/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/dynamic", async () => {
  const { OperationalObservatory } =
    await import("@commandry/ui/operational-observatory");
  return { default: () => OperationalObservatory };
});
vi.mock("@commandry/ui", async () => {
  const { createElement } = await import("react");
  return {
    AppShell: ({ children }: PropsWithChildren) =>
      createElement("div", null, children),
    Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
      createElement("button", props, children),
    InfrastructureMap: () =>
      createElement("div", null, "Resource topology canvas"),
    infrastructureTelemetryLabels: {},
    isInfrastructureHost: () => false,
  };
});
const coordinatorRenderer = vi.hoisted(() => ({
  enabled: false,
  hooks: null as RendererHooks | null,
  settings: null as RendererSettings | null,
  update: vi.fn(),
  focus: vi.fn<
    (
      id: string | null,
      options: { immediate?: boolean; restore?: boolean; refit?: boolean },
    ) => boolean
  >(() => true),
  created: vi.fn(),
}));
vi.mock("@commandry/ui/gravity/renderer", () => ({
  ObservatoryRenderer: class {
    constructor(
      _container: HTMLElement,
      _settings: RendererSettings,
      private hooks: RendererHooks,
    ) {
      if (!coordinatorRenderer.enabled)
        throw new Error("Synthetic unsupported WebGL");
      coordinatorRenderer.hooks = hooks;
      coordinatorRenderer.created();
    }
    update(wells: Well[], settings: RendererSettings) {
      coordinatorRenderer.settings = settings;
      coordinatorRenderer.update(wells, settings);
      this.hooks.anchors(
        wells.map((well, index) => ({
          ...well,
          x: 100 + index * 10,
          y: 140,
          visible: true,
          opacity: 1,
        })),
      );
    }
    focusSubject = coordinatorRenderer.focus;
    refreshActivity() {}
    measureAnchor() {}
    preset() {}
    dispose() {}
  },
}));
beforeEach(() => {
  coordinatorRenderer.enabled = false;
  coordinatorRenderer.hooks = null;
  coordinatorRenderer.settings = null;
  coordinatorRenderer.update.mockClear();
  coordinatorRenderer.focus.mockClear();
  coordinatorRenderer.created.mockClear();
  localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

describe("canonical Work through the infrastructure parent", () => {
  function canonicalWorkPage(
    projectId: string,
    cursor: FoundationProjectWorkCursor | null,
  ): FoundationProjectWorkPage {
    const firstId = "00000000-0000-4000-8000-000000009000";
    const id =
      cursor === null ? firstId : "00000000-0000-4000-8000-000000009001";
    return {
      schemaVersion: 1,
      requestedProjectId: projectId,
      consistency: "live",
      selectedAt: "2026-10-16T12:00:00Z",
      items: [
        {
          work: {
            id,
            projectId,
            sourceCaptureId: "00000000-0000-4000-8000-000000009002",
            generatedFromWorkItemId: null,
            title:
              "Canonical integration Work " +
              (cursor === null ? "first" : "last"),
            description: "Canonical assignment is not execution",
            workType: cursor === null ? "task" : "initiative",
            assigneeKind: "agent",
            assigneeAgentId: "00000000-0000-4000-8000-000000009003",
            assigneeLabel: "Assigned agent",
            status: cursor === null ? "open" : "done",
            priority: null,
            dueOn: null,
            contextLink: null,
            createdAt: "2026-10-01T12:00:00Z",
            updatedAt: "2026-10-15T12:00:00Z",
          },
          contentDigest: "a".repeat(64),
        },
      ],
      nextCursor: cursor === null ? { projectId, afterId: firstId } : null,
    };
  }
  it.each(["selected project", "global inventory"])(
    "loads complete canonical Work through the actual parent with zero infrastructure in the %s",
    async (context) => {
      const projectId = "00000000-0000-4000-8000-000000008001";
      const otherId = "00000000-0000-4000-8000-000000008002";
      const scene = projectObservatory(scaleObservatoryFixture(0));
      const snapshot: InfrastructureOverview = {
        readAt: scene.readCompletedAt,
        total: 0,
        nextCursor: null,
        items: [],
        edges: [],
        events: [],
      };
      let finishCatalogue!: (response: Response) => void;
      const catalogueContinuation = new Promise<Response>((resolve) => {
        finishCatalogue = resolve;
      });
      const workRequests: {
        projectId: string;
        cursor: FoundationProjectWorkCursor | null;
      }[] = [];
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), {
          headers: { "content-type": "application/json" },
        });
      const fetch = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.startsWith("/api/v1/projects?")) {
            return url.includes("cursor=")
              ? catalogueContinuation
              : json({
                  items: [
                    { id: projectId, name: "Project without infrastructure" },
                  ],
                  nextCursor: "projects-2",
                });
          }
          if (url.startsWith("/api/v1/infrastructure/overview?"))
            return json(snapshot);
          if (url === "/api/v1/infrastructure/observatory/scene")
            return json({ scene });
          if (url === "/api/v1/infrastructure/observatory/work/page") {
            const query = JSON.parse(String(init?.body)) as {
              projectId: string;
              cursor: FoundationProjectWorkCursor | null;
            };
            workRequests.push(query);
            return json(
              query.projectId === projectId
                ? canonicalWorkPage(query.projectId, query.cursor)
                : {
                    schemaVersion: 1,
                    requestedProjectId: query.projectId,
                    consistency: "live",
                    selectedAt: "2026-10-16T12:00:00Z",
                    items: [],
                    nextCursor: null,
                  },
            );
          }
          throw new Error(`Unexpected synthetic request ${url}`);
        },
      );
      vi.stubGlobal("fetch", fetch);
      render(
        createElement(InfrastructureOverviewScreen, {
          initialProjectId: context === "selected project" ? projectId : "",
        }),
      );
      expect(
        await screen.findByText("No authorized resources in this view."),
      ).toBeTruthy();
      expect(
        screen.getByText("Canonical Work unavailable in this view."),
      ).toBeTruthy();
      expect(workRequests).toHaveLength(0);
      expect(screen.queryByText("0 Work items")).toBeNull();
      finishCatalogue(
        json({
          items: [
            { id: otherId, name: "Another project without infrastructure" },
          ],
          nextCursor: null,
        }),
      );
      expect(await screen.findByText("2 Work items")).toBeTruthy();
      expect(screen.getByText("Canonical integration Work last")).toBeTruthy();
      expect(
        workRequests.filter((query) => query.projectId === projectId),
      ).toHaveLength(2);
      expect(
        [...new Set(workRequests.map((query) => query.projectId))].sort(),
      ).toEqual(
        context === "selected project" ? [projectId] : [projectId, otherId],
      );
      expect(screen.getAllByText("Canonical project Work")).toHaveLength(1);
      const requestCount = workRequests.length;
      for (const name of ["Topology", "List"]) {
        fireEvent.click(screen.getByRole("button", { name }));
        expect(
          await screen.findByText(
            context === "selected project"
              ? "No matching resources"
              : "Your infrastructure starts here",
          ),
        ).toBeTruthy();
        expect(screen.queryByText("Canonical project Work")).toBeNull();
        expect(screen.queryByText("Resource topology canvas")).toBeNull();
        expect(workRequests).toHaveLength(requestCount);
      }
    },
  );
});

// A zero reveal budget starts aggregated, exercising collapsed -> expanded refits.
async function loadSelectionCoordinator(revealBudget?: number) {
  coordinatorRenderer.enabled = true;
  const input = {
      ...mixedObservatoryFixture(),
      ...(revealBudget === undefined ? {} : { revealBudget }),
    },
    initialScene = projectObservatory(input),
    hosts = initialScene.representations.filter(
      (node) =>
        node.kind === "host" &&
        initialScene.visibleRepresentationIds.includes(node.id),
    ),
    first = hosts[0]!;
  const snapshot: InfrastructureOverview = {
    readAt: initialScene.readCompletedAt,
    total: input.resources.length,
    nextCursor: null,
    items: input.resources.map((resource) => ({
      ...resource,
      health: "unknown",
      projects: resource.projects.map((project) => ({ ...project })),
      metrics: resource.metrics.map((metric) => ({ ...metric })),
      telemetry:
        resource.id === first.resourceId ? "stale" : resource.telemetry,
      sources: resource.sources.map((source) => ({
        ...source,
        name: "Synthetic source",
        kind: "linux-host",
      })),
    })),
    edges: [],
    events: [],
  };
  let sceneReads = 0;
  const sceneRevisions: string[] = [];
  const evidenceRequests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      const url = String(path);
      if (url.startsWith("/api/v1/projects?"))
        return Response.json({ items: [], nextCursor: null });
      if (url.startsWith("/api/v1/infrastructure/overview?"))
        return Response.json(snapshot);
      if (url === "/api/v1/infrastructure/observatory/scene") {
        sceneReads++;
        const scene = projectObservatory({
          ...input,
          ...JSON.parse(String(init?.body)),
          now: new Date(
            Date.parse(input.now) + sceneReads * 1000,
          ).toISOString(),
        });
        sceneRevisions.push(scene.projectionRevision);
        return Response.json({ scene });
      }
      if (url === "/api/v1/infrastructure/observatory/operational") {
        const query = JSON.parse(String(init?.body));
        evidenceRequests.push(query);
        return Response.json({
          schemaVersion: 1,
          scopeDigest: initialScene.scopeDigest,
          projectionRevision: initialScene.projectionRevision,
          completeness: "complete",
          resourceId: query.resourceId,
          facet: query.facet,
          access: "unsupported",
          items: [],
        });
      }
      return Response.json({}, { status: 404 });
    }),
  );
  const view = render(createElement(InfrastructureOverviewScreen));
  await waitFor(() => expect(coordinatorRenderer.hooks).not.toBeNull());
  return {
    view,
    hosts,
    evidenceRequests,
    sceneRevisions,
    reads: () => sceneReads,
  };
}
it("opts in only PR evidence through the actual owner coordinator and preserves the request on refresh", async () => {
  const { hosts, evidenceRequests, reads } = await loadSelectionCoordinator();
  const first = hosts[0]!;
  fireEvent.click(screen.getByRole("button", { name: first.label + ":" }));
  await waitFor(() => expect(evidenceRequests).toHaveLength(1));
  const base = {
    grouping: "operational",
    environment: null,
    expandedRepresentationIds: [],
    reveal: "members",
    search: "",
    sectors: [],
    viewRevision: "1",
    resourceId: first.resourceId,
  };
  expect(evidenceRequests[0]).toEqual({ ...base, facet: "availability" });
  fireEvent.change(screen.getByRole("combobox", { name: "Evidence facet" }), {
    target: { value: "pull_requests" },
  });
  await waitFor(() => expect(evidenceRequests).toHaveLength(2));
  expect(evidenceRequests[1]).toEqual({
    ...base,
    facet: "pull_requests",
    includePullRequestChecks: true,
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Evidence facet" }), {
    target: { value: "security" },
  });
  await waitFor(() => expect(evidenceRequests).toHaveLength(3));
  expect(evidenceRequests[2]).toEqual({ ...base, facet: "security" });
  fireEvent.change(screen.getByRole("combobox", { name: "Evidence facet" }), {
    target: { value: "pull_requests" },
  });
  await waitFor(() => expect(evidenceRequests).toHaveLength(4));
  const previousReads = reads();
  fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
  await waitFor(() => expect(reads()).toBeGreaterThan(previousReads));
  await waitFor(() => expect(evidenceRequests).toHaveLength(5));
  expect(evidenceRequests[4]).toEqual(evidenceRequests[1]);
  expect(coordinatorRenderer.settings?.selected).toBe(first.id);
});
describe("explicit selection intent through the actual infrastructure coordinator", () => {
  it("honors repeated outer same-ID clicks after automatic tour features and keeps refresh from creating an intent", async () => {
    const { hosts, reads } = await loadSelectionCoordinator(),
      first = hosts[0]!,
      second = hosts[1]!;
    const outer = screen.getByRole("button", { name: first.label + ":" });
    fireEvent.click(outer);
    await waitFor(() =>
      expect(coordinatorRenderer.settings?.selected).toBe(first.id),
    );
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    act(() => coordinatorRenderer.hooks?.featured?.(second.id));
    expect(coordinatorRenderer.settings).toMatchObject({
      cameraMode: "tour",
      selected: second.id,
    });
    const inspector = screen.getByRole("complementary", {
        name: "Observatory inspector",
      }),
      calls = coordinatorRenderer.focus.mock.calls.length;
    fireEvent.click(outer);
    await waitFor(() =>
      expect(coordinatorRenderer.settings).toMatchObject({
        cameraMode: "manual",
        selected: first.id,
      }),
    );
    expect(coordinatorRenderer.focus).toHaveBeenCalledTimes(calls + 1);
    expect(coordinatorRenderer.focus.mock.lastCall?.[0]).toBe(first.id);
    expect(
      within(inspector).getByRole("heading", { name: first.label }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    act(() => coordinatorRenderer.hooks?.featured?.(second.id));
    const after = coordinatorRenderer.focus.mock.calls.length,
      beforeReads = reads();
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    await waitFor(() => expect(reads()).toBeGreaterThan(beforeReads));
    await act(async () => {});
    expect(coordinatorRenderer.settings).toMatchObject({
      cameraMode: "tour",
      selected: second.id,
    });
    expect(coordinatorRenderer.focus).toHaveBeenCalledTimes(after);
    expect(coordinatorRenderer.created).toHaveBeenCalledTimes(1);
    fireEvent.click(outer);
    await waitFor(() =>
      expect(coordinatorRenderer.settings).toMatchObject({
        cameraMode: "manual",
        selected: first.id,
      }),
    );
    expect(coordinatorRenderer.focus).toHaveBeenCalledTimes(after + 1);
  });
});

it("acknowledges local Observatory selection without replaying it as a new outer intent or extra direct refit", async () => {
  const { hosts } = await loadSelectionCoordinator(0),
    first = hosts[0]!;
  fireEvent.click(
    screen.getByRole("button", {
      name:
        "Inspect " +
        first.label +
        ", Host, " +
        first.memberCount +
        " unique resources",
    }),
  );
  await waitFor(() =>
    expect(
      coordinatorRenderer.focus.mock.calls.some(
        ([id, options]) => id === first.id && options.refit,
      ),
    ).toBe(true),
  );
  const requests = coordinatorRenderer.focus.mock.calls.filter(
    ([id]) => id === first.id,
  );
  expect(requests.filter(([, options]) => !options.refit)).toHaveLength(1);
  expect(requests.filter(([, options]) => options.refit)).toHaveLength(1);
  expect(coordinatorRenderer.settings).toMatchObject({
    cameraMode: "manual",
    selected: first.id,
  });
  const calls = coordinatorRenderer.focus.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
  act(() => coordinatorRenderer.hooks?.featured?.(hosts[1]!.id));
  expect(coordinatorRenderer.settings?.cameraMode).toBe("tour");
  expect(coordinatorRenderer.focus).toHaveBeenCalledTimes(calls);
});

async function routineActivityCoordinator() {
  coordinatorRenderer.enabled = true;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const input = observatoryFixtureInput([
      observatoryFixtureResource(97001, "host"),
    ]),
    scene = projectObservatory(input),
    resource = input.resources[0]!,
    host = scene.representations.find(
      (node) => node.resourceId === resource.id,
    )!;
  const event = (
    index: number,
    age = 1000,
  ): InfrastructureOverview["events"][number] => ({
    id: id(98000 + index),
    resourceId: resource.id,
    summary: "Recorded source event " + index,
    occurredAt: new Date(Date.now() - age).toISOString(),
    sourceLabel: "Actual synthetic source",
    evidenceHref: "/api/v1/source-envelopes/" + id(99000 + index),
  });
  let latestScene = scene,
    deferOverview = false;
  const overviewGates: (() => void)[] = [];
  const baseline = event(1);
  let events = [baseline],
    sceneMode: "ready" | "defer" | "fail" = "ready",
    overviewFailed = false,
    removed = false,
    sceneReads = 0,
    overviewReads = 0;
  const gates: {
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      const url = String(path);
      if (url.startsWith("/api/v1/projects?"))
        return Response.json({ items: [], nextCursor: null });
      if (url.startsWith("/api/v1/infrastructure/overview?")) {
        overviewReads++;
        if (overviewFailed) throw Error("Synthetic unavailable overview");
        const payload = {
          readAt: new Date().toISOString(),
          total: removed ? 0 : 1,
          nextCursor: null,
          items: removed
            ? []
            : [
                {
                  ...resource,
                  projects: [],
                  metrics: [],
                  sources: [],
                  health: "unknown",
                },
              ],
          edges: [],
          events: removed ? [] : events,
        };
        if (deferOverview)
          return new Promise<Response>((resolve) =>
            overviewGates.push(() => resolve(Response.json(payload))),
          );
        return Response.json(payload);
      }
      if (url === "/api/v1/infrastructure/observatory/scene") {
        sceneReads++;
        latestScene = projectObservatory({
          ...input,
          ...JSON.parse(String(init?.body)),
        });
        if (sceneMode === "fail")
          throw Error("Synthetic unavailable projection");
        if (sceneMode === "defer")
          return new Promise<Response>((resolve, reject) =>
            gates.push({ resolve, reject }),
          );
        return Response.json({
          scene: removed
            ? projectObservatory({
                ...scaleObservatoryFixture(0),
                scopeDigest: "removed-authorized-population",
              })
            : projectObservatory({
                ...input,
                ...JSON.parse(String(init?.body)),
              }),
        });
      }
      return Response.json({}, { status: 404 });
    }),
  );
  const visible = new Set(scene.visibleRepresentationIds);
  let subject = host;
  while (!visible.has(subject.id) && subject.parentRepresentationId)
    subject = scene.representations.find(
      (node) => node.id === subject.parentRepresentationId,
    )!;
  const view = render(createElement(InfrastructureOverviewScreen));
  await waitFor(() =>
    expect(coordinatorRenderer.settings?.activity.running).toBe(true),
  );
  expect(coordinatorRenderer.settings?.motion).toBe(true);
  const activity = coordinatorRenderer.settings!.activity.source;
  expect(activity).toBeInstanceOf(OperationalRecordedActivity);
  expect(activity.snapshot().events).toEqual([]);
  const tick = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
  };
  const complete = async () => {
    await act(async () => {
      for (const gate of gates.splice(0))
        gate.resolve(Response.json({ scene: latestScene }));
    });
  };
  return {
    view,
    host,
    visibleId: subject.id,
    event,
    baseline,
    activity,
    tick,
    complete,
    gates,
    holdOverview: (hold: boolean) => {
      deferOverview = hold;
    },
    completeOverview: async () => {
      await act(async () => {
        for (const resolve of overviewGates.splice(0)) resolve();
      });
    },
    reads: () => ({ scene: sceneReads, overview: overviewReads }),
    setEvents: (next: InfrastructureOverview["events"]) => {
      events = next;
    },
    sceneMode: (next: typeof sceneMode) => {
      sceneMode = next;
    },
    overviewFailure: (next: boolean) => {
      overviewFailed = next;
    },
    remove: () => {
      removed = true;
    },
  };
}
describe("routine scene refresh and actual recorded activity", () => {
  it("pulses one genuinely new event while the natural same-scope scene refresh remains unresolved, without replaying duplicates or old events", async () => {
    const f = await routineActivityCoordinator(),
      fresh = f.event(2),
      baseline = f.baseline;
    f.sceneMode("defer");
    f.setEvents([fresh, baseline]);
    await f.tick();
    expect(f.gates).toHaveLength(1);
    expect(f.reads()).toEqual({ scene: 2, overview: 2 });
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
    expect(coordinatorRenderer.settings?.activity.running).toBe(true);
    expect(screen.queryByText(/Delayed recorded view/)).toBeNull();
    expect(f.activity.snapshot().events[0]).toMatchObject({
      id: fresh.id,
      correlationId: fresh.id,
      from: f.visibleId,
      to: f.visibleId,
      kind: "observation",
      effect: "arrival",
    });
    expect(f.activity.snapshot().transfers).toEqual([]);
    await f.complete();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
    f.activity.advance?.(1.5);
    expect(f.activity.snapshot().events).toEqual([]);
    f.sceneMode("ready");
    f.setEvents([baseline, f.event(3, 61000), fresh, f.event(4, -60000)]);
    await f.tick();
    expect(f.activity.snapshot().events).toEqual([]);
    const later = f.event(5);
    f.setEvents([fresh, later, baseline]);
    await f.tick();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      later.id,
    ]);
  });
  it.each(["scene", "overview"] as const)(
    "keeps actual %s failure delayed and does not replay its recorded backlog after recovery",
    async (kind) => {
      const f = await routineActivityCoordinator(),
        backlog = f.event(6);
      f.setEvents([backlog]);
      if (kind === "scene") f.sceneMode("fail");
      else f.overviewFailure(true);
      await f.tick();
      expect(coordinatorRenderer.settings?.activity.running).toBe(false);
      expect(f.activity.snapshot().events).toEqual([]);
      expect(screen.getByText(/Delayed recorded view/)).toBeTruthy();
      f.sceneMode("ready");
      f.overviewFailure(false);
      await f.tick();
      expect(coordinatorRenderer.settings?.activity.running).toBe(true);
      expect(f.activity.snapshot().events).toEqual([]);
      const fresh = f.event(7);
      f.setEvents([fresh, backlog]);
      await f.tick();
      expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
        fresh.id,
      ]);
    },
  );
  it("does not replay deliberate pause/restart backlog and clears the old population on scope removal", async () => {
    const f = await routineActivityCoordinator();
    fireEvent.click(screen.getByRole("button", { name: "Pause updates" }));
    expect(coordinatorRenderer.settings?.activity.running).toBe(false);
    const before = f.reads(),
      backlog = f.event(8);
    f.setEvents([backlog]);
    await f.tick();
    expect(f.reads()).toEqual(before);
    expect(f.activity.snapshot().events).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Resume updates" }));
    await waitFor(() => expect(f.reads().overview).toBe(before.overview + 1));
    await act(async () => {});
    expect(f.activity.snapshot().events).toEqual([]);
    const fresh = f.event(9);
    f.setEvents([backlog, fresh]);
    await f.tick();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
    f.remove();
    await f.tick();
    await screen.findByText("No authorized resources in this view.");
    expect(screen.queryByText(f.host.label)).toBeNull();
    expect(coordinatorRenderer.update.mock.lastCall?.[0]).toHaveLength(0);
    expect(
      coordinatorRenderer.settings?.activity.source.snapshot().events,
    ).toEqual([]);
  });
});

it("keeps restart baseline suppressed when the projection finishes before the independently delayed overview", async () => {
  const f = await routineActivityCoordinator();
  fireEvent.click(screen.getByRole("button", { name: "Pause updates" }));
  f.holdOverview(true);
  const backlog = f.event(10);
  f.setEvents([backlog]);
  fireEvent.click(screen.getByRole("button", { name: "Resume updates" }));
  await act(async () => {});
  expect(coordinatorRenderer.settings?.activity.running).toBe(false);
  expect(f.activity.snapshot().events).toEqual([]);
  await f.completeOverview();
  expect(coordinatorRenderer.settings?.activity.running).toBe(true);
  expect(f.activity.snapshot().events).toEqual([]);
  f.holdOverview(false);
  const fresh = f.event(11);
  f.setEvents([backlog, fresh]);
  await f.tick();
  expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
    fresh.id,
  ]);
});
it("keeps a deliberate query revision pending static while accepting later genuine events after its new baseline", async () => {
  const f = await routineActivityCoordinator();
  f.sceneMode("defer");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Observatory grouping" }),
    { target: { value: "hosts" } },
  );
  await act(async () => {});
  expect(f.gates).toHaveLength(1);
  expect(coordinatorRenderer.settings?.activity.running).toBe(false);
  const backlog = f.event(12);
  f.setEvents([backlog]);
  await f.tick();
  expect(f.activity.snapshot().events).toEqual([]);
  await f.complete();
  expect(coordinatorRenderer.settings?.activity.running).toBe(true);
  expect(f.activity.snapshot().events).toEqual([]);
  f.sceneMode("ready");
  const fresh = f.event(13);
  f.setEvents([fresh, backlog]);
  await f.tick();
  expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
    fresh.id,
  ]);
});
it("preserves reading, reduced-motion and offscreen baseline rules during ordinary scene refresh", async () => {
  const f = await routineActivityCoordinator();
  fireEvent.focus(screen.getByRole("searchbox"));
  f.setEvents([f.event(14)]);
  await f.tick();
  expect(coordinatorRenderer.settings?.motion).toBe(false);
  expect(f.activity.snapshot().events).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
  expect(f.activity.snapshot().events).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Appearance and views" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Reduced motion" }));
  f.setEvents([f.event(15)]);
  await f.tick();
  expect(coordinatorRenderer.settings?.motion).toBe(false);
  expect(f.activity.snapshot().events).toEqual([]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Reduced motion" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
  act(() => coordinatorRenderer.hooks?.visibility(false));
  f.setEvents([f.event(16)]);
  await f.tick();
  expect(f.activity.snapshot().events).toEqual([]);
  act(() => coordinatorRenderer.hooks?.visibility(true));
  await f.tick();
  expect(f.activity.snapshot().events).toEqual([]);
  const fresh = f.event(17);
  f.setEvents([fresh]);
  await f.tick();
  expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
    fresh.id,
  ]);
});

it.each(["scene", "overview"] as const)(
  "keeps a failed %s resume suppressed until a successful first fresh read without replaying pause backlog",
  async (kind) => {
    const f = await routineActivityCoordinator();
    fireEvent.click(screen.getByRole("button", { name: "Pause updates" }));
    const backlog = f.event(18);
    f.setEvents([backlog]);
    if (kind === "scene") f.sceneMode("fail");
    else f.overviewFailure(true);
    fireEvent.click(screen.getByRole("button", { name: "Resume updates" }));
    await screen.findByRole("alert");
    expect(coordinatorRenderer.settings?.activity.running).toBe(false);
    expect(f.activity.snapshot().events).toEqual([]);
    f.sceneMode("ready");
    f.overviewFailure(false);
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    await waitFor(() =>
      expect(coordinatorRenderer.settings?.activity.running).toBe(true),
    );
    expect(f.activity.snapshot().events).toEqual([]);
    const fresh = f.event(19);
    f.setEvents([backlog, fresh]);
    await f.tick();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
  },
);

describe("independent review completion-order controls", () => {
  it("silently baselines pause backlog when the overview finishes before a deferred resumed scene", async () => {
    const f = await routineActivityCoordinator();
    fireEvent.click(screen.getByRole("button", { name: "Pause updates" }));
    const backlog = f.event(31);
    f.setEvents([backlog]);
    f.sceneMode("defer");
    fireEvent.click(screen.getByRole("button", { name: "Resume updates" }));
    await act(async () => {});
    expect(f.gates).toHaveLength(1);
    expect(f.activity.snapshot().events).toEqual([]);
    await f.complete();
    expect(f.activity.snapshot().events).toEqual([]);
    f.sceneMode("ready");
    const fresh = f.event(32);
    f.setEvents([backlog, fresh]);
    await f.tick();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
  });

  it("silently baselines hidden-document backlog when the scene returns before the overview", async () => {
    const f = await routineActivityCoordinator();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => coordinatorRenderer.hooks?.visibility(false));
    const reads = f.reads();
    const backlog = f.event(33);
    f.setEvents([backlog]);
    await f.tick();
    expect(f.reads()).toEqual(reads);
    expect(f.activity.snapshot().events).toEqual([]);
    f.holdOverview(true);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => coordinatorRenderer.hooks?.visibility(true));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(f.reads()).toEqual({
      scene: reads.scene + 1,
      overview: reads.overview + 1,
    });
    expect(f.activity.snapshot().events).toEqual([]);
    await f.completeOverview();
    expect(f.activity.snapshot().events).toEqual([]);
    f.holdOverview(false);
    const fresh = f.event(34);
    f.setEvents([backlog, fresh]);
    await f.tick();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
  });

  it("silently baselines scene-failure backlog when recovery scene returns before the overview", async () => {
    const f = await routineActivityCoordinator();
    f.sceneMode("fail");
    await f.tick();
    expect(coordinatorRenderer.settings?.activity.running).toBe(false);
    const backlog = f.event(35);
    f.setEvents([backlog]);
    f.sceneMode("ready");
    f.holdOverview(true);
    await f.tick();
    expect(f.activity.snapshot().events).toEqual([]);
    await f.completeOverview();
    expect(f.activity.snapshot().events).toEqual([]);
    f.holdOverview(false);
    const fresh = f.event(36);
    f.setEvents([backlog, fresh]);
    await f.tick();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
  });
});

it("retains the hidden-return baseline when an overview started before hiding completes after the scene", async () => {
  const f = await routineActivityCoordinator();
  const beforeHidden = f.event(37);
  f.setEvents([beforeHidden]);
  f.holdOverview(true);
  await f.tick();
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => {
    coordinatorRenderer.hooks?.visibility(false);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const reads = f.reads();
  const backlog = f.event(38);
  f.setEvents([backlog]);
  await f.tick();
  expect(f.reads()).toEqual(reads);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  await act(async () => {
    coordinatorRenderer.hooks?.visibility(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(f.reads()).toEqual({
    scene: reads.scene + 1,
    overview: reads.overview,
  });
  await f.completeOverview();
  expect(coordinatorRenderer.settings?.activity.running).toBe(false);
  expect(f.activity.snapshot().events).toEqual([]);
  f.holdOverview(false);
  await f.tick();
  expect(coordinatorRenderer.settings?.activity.running).toBe(true);
  expect(f.activity.snapshot().events).toEqual([]);
  const fresh = f.event(39);
  f.setEvents([backlog, fresh]);
  await f.tick();
  expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
    fresh.id,
  ]);
});

it.each(["hidden", "scene failure"] as const)(
  "silently baselines %s backlog when the recovery overview completes before the deferred scene",
  async (kind) => {
    const f = await routineActivityCoordinator();
    if (kind === "hidden") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      act(() => {
        coordinatorRenderer.hooks?.visibility(false);
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } else {
      f.sceneMode("fail");
      await f.tick();
      expect(coordinatorRenderer.settings?.activity.running).toBe(false);
    }
    const backlog = f.event(40);
    f.setEvents([backlog]);
    f.sceneMode("defer");
    if (kind === "hidden") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(false);
      await act(async () => {
        coordinatorRenderer.hooks?.visibility(true);
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } else await f.tick();
    expect(f.gates).toHaveLength(1);
    expect(f.activity.snapshot().events).toEqual([]);
    await f.complete();
    expect(coordinatorRenderer.settings?.activity.running).toBe(true);
    expect(f.activity.snapshot().events).toEqual([]);
    f.sceneMode("ready");
    const fresh = f.event(41);
    f.setEvents([backlog, fresh]);
    await f.tick();
    expect(f.activity.snapshot().events.map((event) => event.id)).toEqual([
      fresh.id,
    ]);
  },
);

it("independent parent manual refresh recovers after transient evidence error", async () => {
  const { hosts, evidenceRequests, sceneRevisions } =
    await loadSelectionCoordinator();
  const baseFetch = vi.mocked(fetch).getMockImplementation()!;
  let failPr = true,
    recovered = false;
  const prRequests: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === "/api/v1/infrastructure/observatory/operational") {
      const query = JSON.parse(String(init?.body));
      if (query.facet === "pull_requests") {
        prRequests.push(query);
        if (failPr) {
          failPr = false;
          return Response.json({}, { status: 503 });
        }
        const response = await baseFetch(path, init);
        recovered = true;
        return response;
      }
    }
    return baseFetch(path, init);
  });
  fireEvent.click(screen.getByRole("button", { name: hosts[0]!.label + ":" }));
  await waitFor(() => expect(evidenceRequests).toHaveLength(1));
  fireEvent.change(screen.getByRole("combobox", { name: "Evidence facet" }), {
    target: { value: "pull_requests" },
  });
  await screen.findByRole("button", { name: "Retry evidence" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
  await waitFor(() => expect(recovered).toBe(true));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(prRequests).toHaveLength(2);
  expect(prRequests[1]).toEqual(prRequests[0]);
  expect(sceneRevisions.length).toBeGreaterThan(1);
  expect(new Set(sceneRevisions).size).toBe(1);
  console.log(
    "INDEPENDENT_RECOVERY",
    JSON.stringify({
      sceneRevisionCount: sceneRevisions.length,
      sameSceneRevision: new Set(sceneRevisions).size === 1,
      successfulRefresh: recovered,
      sameRequest:
        JSON.stringify(prRequests[0]) === JSON.stringify(prRequests[1]),
      retryStillVisible: !!screen.queryByRole("button", {
        name: "Retry evidence",
      }),
    }),
  );
  expect(screen.queryByRole("button", { name: "Retry evidence" })).toBeNull();
});
