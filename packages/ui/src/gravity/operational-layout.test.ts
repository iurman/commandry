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
import { createElement } from "react";
import type {
  InfrastructureOverview,
  FoundationProjectWorkCursor,
  FoundationProjectWorkPage,
} from "@commandry/contracts";
import type { Well } from "./model";
import type { RendererHooks, RendererSettings } from "./renderer";
import { OperationalObservatory } from "../components/OperationalObservatory";
import { projectObservatory } from "@commandry/test-support";
import {
  mixedObservatoryFixture,
  operationalObservatoryFixture,
  scaleObservatoryFixture,
  observatoryFixtureResource,
} from "@commandry/test-support";
import {
  mapOperationalEvents,
  observedTotalRam,
  operationalAttention,
  OperationalLayout,
  OperationalRecordedActivity,
} from "./operational-layout";
import {
  defaultObservatoryPreferences,
  observatoryGroupings,
} from "./observatory-preferences";

const options = defaultObservatoryPreferences();
const engine = vi.hoisted(() => ({
  fail: false,
  update: vi.fn(),
  dispose: vi.fn(),
  preset: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("./renderer", () => ({
  ObservatoryRenderer: class {
    constructor(
      _element: HTMLElement,
      _settings: RendererSettings,
      private hooks: RendererHooks,
    ) {
      if (engine.fail) throw Error("GPU unavailable");
    }
    update(wells: Well[], settings: RendererSettings) {
      engine.update(wells, settings);
      this.hooks.anchors(
        wells.map((well, index) => ({
          id: well.id,
          label: well.label,
          kind: well.kind,
          x: 100 + index * 10,
          y: 140,
          visible: true,
          opacity: 1,
          attention: well.attention,
          sector: well.sector,
        })),
      );
    }
    dispose = engine.dispose;
    preset = engine.preset;
    refreshActivity = engine.refresh;
    measureAnchor() {}
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  engine.fail = false;
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("operational landscape adapter", () => {
  it.each(observatoryGroupings)(
    "conserves all 91 canonical identities in %s without repository tour hosts",
    (grouping) => {
      const input = mixedObservatoryFixture(),
        scene = projectObservatory({ ...input, grouping });
      const result = new OperationalLayout().project(scene, options);
      expect(result.representedResourceIds).toEqual(
        input.resources.map((item) => item.id).sort(),
      );
      expect(result.wells.map((well) => well.id).sort()).toEqual(
        [...scene.visibleRepresentationIds].sort(),
      );
      expect(result.visibleSubjectForResource.size).toBe(91);
      for (const [resourceId, node] of result.canonical) {
        const subject = result.visibleSubjectForResource.get(resourceId)!;
        expect(result.members.get(subject)?.has(resourceId)).toBe(true);
        if (node.kind === "repository")
          expect(result.positions.get(node.id)?.kind).toBe("project");
      }
      expect(
        result.wells
          .filter((well) => well.kind === "host")
          .every((well) => result.byId.get(well.id)?.kind === "host"),
      ).toBe(true);
      expect(scene.summary.coverage.monitored).toBe(0);
      expect(result.wells.every((well) => !well.attention)).toBe(true);
    },
  );
  it("preserves unique totals under expansion and retains every active GPU representation", () => {
    const input = mixedObservatoryFixture(),
      collapsed = projectObservatory(input),
      layout = new OperationalLayout();
    const before = layout.project(collapsed, options);
    const expanded = projectObservatory({
      ...input,
      expandedRepresentationIds: collapsed.representations.map(
        (node) => node.id,
      ),
    });
    const after = layout.project(expanded, options);
    expect(after.representedResourceIds).toEqual(before.representedResourceIds);
    expect(after.wells).toHaveLength(expanded.visibleRepresentationIds.length);
    for (const well of before.wells)
      expect(after.positions.get(well.id)).toEqual(well);
    const repositories = [...after.canonical.values()].filter(
      (node) => node.kind === "repository",
    );
    expect(repositories).toHaveLength(60);
    expect(
      repositories.every(
        (node) =>
          after.visibleSubjectForResource.get(node.resourceId!) === node.id,
      ),
    ).toBe(true);
  });
  it("is deterministic under permutation and does not move landmarks on an ordinary observation refresh", () => {
    const input = mixedObservatoryFixture(),
      scene = projectObservatory(input),
      layout = new OperationalLayout();
    const first = layout.project(scene, options);
    const reversed = new OperationalLayout().project(
      {
        ...scene,
        representations: [...scene.representations].reverse(),
        visibleRepresentationIds: [...scene.visibleRepresentationIds].reverse(),
      },
      options,
    );
    expect(reversed.wells).toEqual(first.wells);
    const next = layout.project(
      projectObservatory({
        ...input,
        now: "2026-10-16T12:00:18.000Z",
        resources: input.resources.map((item) => ({
          ...item,
          telemetry: "stale" as const,
        })),
      }),
      options,
    );
    expect(next.wells).toEqual(first.wells);
    expect(
      layout.project(scene, { ...options, palette: "earth" }).wells,
    ).toEqual(first.wells);
  });
  it("inserts a root without repacking unrelated groups and preserves nested host meaning", () => {
    const input = mixedObservatoryFixture(),
      layout = new OperationalLayout(),
      before = layout.project(projectObservatory(input), options);
    const resources = [
      ...input.resources,
      observatoryFixtureResource(9980, "provider"),
    ];
    const after = layout.project(
      projectObservatory({
        ...input,
        resources,
        collection: { complete: true, resourceCount: 92 },
      }),
      options,
    );
    for (const [id, well] of before.positions)
      expect([after.positions.get(id)?.x, after.positions.get(id)?.z]).toEqual([
        well.x,
        well.z,
      ]);
    const nested = [...after.canonical.values()].find(
      (node) =>
        node.kind === "host" &&
        node.parentRepresentationId?.startsWith("resource:"),
    )!;
    expect(after.positions.get(nested.id)?.kind).toBe("host");
    expect(after.positions.get(nested.id)?.hostId).toBe(
      nested.parentRepresentationId,
    );
    expect(after.representedResourceIds).toHaveLength(92);
  });
  it("uses total byte RAM only, keeps unknown hosts useful and ignores utilization", () => {
    const input = mixedObservatoryFixture(),
      scene = projectObservatory(input);
    const host = input.resources.find((item) => item.kind === "host")!;
    expect(observedTotalRam(scene, host.id)).toBe(17179869184);
    const hostNode = scene.representations.find(
      (node) => node.resourceId === host.id && !node.referenceTo,
    )!;
    const layout = new OperationalLayout(),
      measured = layout.project(scene, { ...options, size: "total-ram" });
    const changed = structuredClone(scene);
    changed.capacityObservations = changed.capacityObservations.map((item) => ({
      ...item,
      name: "memory.used_percent",
      unit: "%",
      value: 99,
    }));
    expect(observedTotalRam(changed, host.id)).toBeNull();
    const unknown = layout.project(changed, { ...options, size: "total-ram" });
    expect(unknown.ramUnavailableIds).toContain(hostNode.id);
    expect(unknown.positions.get(hostNode.id)!.radius).toBeGreaterThan(0);
    expect([
      unknown.positions.get(hostNode.id)!.x,
      unknown.positions.get(hostNode.id)!.z,
    ]).toEqual([
      measured.positions.get(hostNode.id)!.x,
      measured.positions.get(hostNode.id)!.z,
    ]);
    const unchanged = layout.project(
      {
        ...scene,
        capacityObservations: [
          ...scene.capacityObservations,
          {
            resourceId: host.id,
            name: "memory.used_percent",
            unit: "%",
            value: 99,
            observedAt: scene.evaluatedAt,
            evidenceRef: "fixture:utilization",
          },
        ],
      },
      { ...options, size: "total-ram" },
    );
    expect(unchanged.positions.get(hostNode.id)?.radius).toBe(
      measured.positions.get(hostNode.id)?.radius,
    );
  });
  it("distinguishes required local impact from exposure, optional failure and missing observations", () => {
    const scene = projectObservatory(operationalObservatoryFixture());
    expect(operationalAttention(scene.summary)).toBe("impact");
    const summary = structuredClone(scene.summary);
    summary.availability.confirmedImpact = false;
    summary.security.counts.confirmed_incident = 0;
    summary.provider.counts.confirmed_local_impact = 0;
    summary.provider.counts.potential_exposure = 1;
    expect(operationalAttention(summary)).toBe("exposure");
    summary.provider.counts.potential_exposure = 0;
    expect(operationalAttention(summary)).toBe("neutral");
    expect(summary.availability.optional.failing).toBe(1);
  });
  it("handles the complete thousand-resource deep/adversarial fixture and more than 257 active representations", () => {
    const input = scaleObservatoryFixture(),
      collapsed = projectObservatory(input);
    const scene = projectObservatory({
      ...input,
      expandedRepresentationIds: collapsed.representations.map(
        (node) => node.id,
      ),
    });
    const result = new OperationalLayout().project(scene, options);
    expect(result.representedResourceIds).toHaveLength(1000);
    expect(result.wells.length).toBeGreaterThan(257);
    expect(result.wells).toHaveLength(scene.visibleRepresentationIds.length);
    expect(
      result.wells.every((well) =>
        Number.isFinite(well.x + well.z + well.radius),
      ),
    ).toBe(true);
    expect(result.positions.has(scene.visibleRepresentationIds.at(-1)!)).toBe(
      true,
    );
  });
  it("retains event IDs and evidence while mapping collapsed members and never invents dependency traffic", () => {
    const scene = projectObservatory(mixedObservatoryFixture()),
      result = new OperationalLayout().project(scene, options);
    const resourceId = scene.membershipIndex.resourceIds[0]!;
    const event = {
      id: "actual-event",
      resourceId,
      summary: "Recorded observation",
      occurredAt: scene.evaluatedAt,
      sourceLabel: "Recorded source",
      evidenceHref: "/api/v1/source-envelopes/observed",
    };
    const mapped = mapOperationalEvents(
      {
        events: [
          event,
          { ...event, id: "denied", resourceId: "not-authorized" },
        ],
      },
      result,
    );
    expect(mapped).toEqual([
      {
        ...event,
        resourceId: result.visibleSubjectForResource.get(resourceId),
        canonicalResourceId: resourceId,
      },
    ]);
    expect(mapOperationalEvents({ events: [] }, result)).toEqual([]);
  });
  it("keeps confirmed impact and provider exposure separate in actual renderer attention", () => {
    const scene = projectObservatory(operationalObservatoryFixture());
    const projection = new OperationalLayout().project(scene, options);
    const source = new OperationalRecordedActivity();
    source.setProjection(projection);
    for (const [id, node] of projection.byId)
      expect(source.attention(id)).toBe(
        operationalAttention(node.summary) === "impact"
          ? 1
          : operationalAttention(node.summary) === "exposure"
            ? 0.5
            : 0,
      );
    source.synchronize({ events: [] }, true);
    expect(source.snapshot().transfers).toEqual([]);
    expect(source.snapshot().events).toEqual([]);
  });
  it("accepts empty scenes and rejects an incomplete/foreign visible population", () => {
    const scene = projectObservatory(scaleObservatoryFixture(0));
    expect(new OperationalLayout().project(scene, options).wells).toEqual([]);
    const full = projectObservatory(mixedObservatoryFixture());
    expect(() =>
      new OperationalLayout().project(
        { ...full, visibleRepresentationIds: [] },
        options,
      ),
    ).toThrow(/incomplete/);
    expect(() =>
      new OperationalLayout().project(
        { ...full, visibleRepresentationIds: ["foreign"] },
        options,
      ),
    ).toThrow(/Unknown visible/);
    expect(() =>
      new OperationalLayout().project(
        { ...full, completeness: "partial" as "complete" },
        options,
      ),
    ).toThrow(/incomplete/);
  });
});

describe("operational component interactions with the real semantic scene", () => {
  function setup() {
    const input = mixedObservatoryFixture(),
      scene = projectObservatory(input);
    const host = scene.representations.find(
      (node) =>
        node.kind === "host" &&
        scene.visibleRepresentationIds.includes(node.id),
    )!;
    const snapshot: InfrastructureOverview = {
      readAt: scene.readCompletedAt,
      total: 91,
      nextCursor: null,
      items: [],
      edges: [],
      events: [],
    };
    const props = {
      scene,
      snapshot,
      selectedId: null as string | null,
      onSelect: vi.fn(),
      onProject: vi.fn(),
      onQueryChange: vi.fn(),
      onCameraFocus: vi.fn(),
    };
    return { input, scene, host, props };
  }
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
  it("keeps canonical Work explicitly unavailable without a client in a collapsed panel below recorded observations", async () => {
    const { props } = setup();
    render(createElement(OperationalObservatory, props));
    const panel = screen
      .getByText("Canonical project Work")
      .closest("details")!;
    expect(panel).not.toHaveAttribute("open");
    expect(panel.previousElementSibling).toHaveAttribute(
      "aria-label",
      "Recorded active work",
    );
    expect(
      within(panel).getByText("Canonical Work unavailable in this view."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Missing runtime coverage is not an idle-agent signal/),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("0 Work items")).not.toBeInTheDocument();
  });
  it("withholds Work reads and totals until a complete canonical project catalogue is supplied", async () => {
    const { props } = setup();
    const workClient = vi.fn(
      async (projectId: string, cursor: FoundationProjectWorkCursor | null) =>
        canonicalWorkPage(projectId, cursor),
    );
    const view = render(
      createElement(OperationalObservatory, { ...props, workClient }),
    );
    expect(
      screen.getByText("Canonical Work unavailable in this view."),
    ).toBeInTheDocument();
    expect(workClient).not.toHaveBeenCalled();
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds: [],
      }),
    );
    expect(
      await screen.findByText(
        "No authorized project context. Work totals unavailable.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("0 Work items")).not.toBeInTheDocument();
    expect(workClient).not.toHaveBeenCalled();
  });
  it("mounts the actual complete Work dock for every authorized canonical project despite absent resource representations and an empty snapshot page", async () => {
    const { props, scene } = setup();
    expect(props.snapshot.items).toHaveLength(0);
    const workProjectIds = [
      "00000000-0000-4000-8000-000000008001",
      "00000000-0000-4000-8000-000000008002",
    ];
    const target = workProjectIds[0]!;
    expect(
      scene.representations.some(
        (node) => node.resourceId === workProjectIds[1],
      ),
    ).toBe(false);
    const workClient = vi.fn(
      async (
        projectId: string,
        cursor: FoundationProjectWorkCursor | null,
      ): Promise<FoundationProjectWorkPage> =>
        projectId === target
          ? canonicalWorkPage(projectId, cursor)
          : {
              schemaVersion: 1,
              requestedProjectId: projectId,
              consistency: "live",
              selectedAt: "2026-10-16T12:00:00Z",
              items: [],
              nextCursor: null,
            },
    );
    render(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
      }),
    );
    expect(await screen.findByText("2 Work items")).toBeInTheDocument();
    expect(
      screen.getByText("Canonical integration Work first"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Canonical integration Work last"),
    ).toBeInTheDocument();
    expect(
      [
        ...new Set(workClient.mock.calls.map(([projectId]) => projectId)),
      ].sort(),
    ).toEqual([...workProjectIds].sort());
    expect(
      workClient.mock.calls.filter(([projectId]) => projectId === target),
    ).toHaveLength(2);
    const panel = screen
      .getByText("Canonical project Work")
      .closest("details")!;
    expect(panel).not.toHaveAttribute("open");
    expect(within(panel).getByText("Project Work").tagName).toBe("H2");
    expect(
      within(panel).getByText(
        "Actual runtime unavailable. Assignment is not an active run.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No qualifying active work observation/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^(running|queued)$/i)).not.toBeInTheDocument();
  });
  it("forwards selected canonical project context and pause through the actual dock without reading other projects", async () => {
    const { props } = setup();
    const workProjectIds = [
      "00000000-0000-4000-8000-000000008001",
      "00000000-0000-4000-8000-000000008002",
    ];
    const target = workProjectIds[1]!;
    const workClient = vi.fn(
      async (projectId: string, cursor: FoundationProjectWorkCursor | null) =>
        canonicalWorkPage(projectId, cursor),
    );
    const view = render(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
        scopeProjectId: target,
        paused: true,
        compact: true,
      }),
    );
    expect(
      await screen.findByText("Work loading paused. Totals unavailable."),
    ).toBeInTheDocument();
    expect(workClient).not.toHaveBeenCalled();
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
        scopeProjectId: target,
        paused: false,
        compact: true,
      }),
    );
    expect(await screen.findByText("2 Work items")).toBeInTheDocument();
    expect(workClient).toHaveBeenCalledTimes(2);
    expect(
      workClient.mock.calls.every(([projectId]) => projectId === target),
    ).toBe(true);
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
        scopeProjectId: target,
        paused: true,
        compact: true,
      }),
    );
    expect(screen.queryByText("2 Work items")).not.toBeInTheDocument();
    expect(
      screen.getByText("Work loading paused. Totals unavailable."),
    ).toBeInTheDocument();
  });
  it("inspects a group in one activation and does not refocus on unchanged data refresh", async () => {
    const { input, scene, host, props } = setup();
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${host.label}, Host, ${host.memberCount} unique resources`,
      }),
    );
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: host.label }),
    ).toBeTruthy();
    expect(props.onSelect).toHaveBeenLastCalledWith(host.resourceId);
    expect(props.onQueryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        expandedRepresentationIds: expect.arrayContaining([host.id]),
      }),
    );
    const calls = props.onCameraFocus.mock.calls.length;
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        scene: {
          ...scene,
          evaluatedAt: "2026-10-16T12:00:18.000Z",
          representations: [...scene.representations],
        },
      }),
    );
    await act(async () => {});
    expect(props.onCameraFocus).toHaveBeenCalledTimes(calls);
    expect(engine.update.mock.lastCall?.[1].focus).toBe(false);
    expect(engine.update.mock.lastCall?.[1].ambient).toBe(false);
    const expanded = projectObservatory({
      ...input,
      ...props.onQueryChange.mock.lastCall![0],
    });
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: expanded }),
    );
    await waitFor(() =>
      expect(props.onCameraFocus.mock.lastCall?.[2]).toMatchObject({
        refit: true,
        restore: false,
      }),
    );
  });
  it("restores pre-search canonical selection and query when search clears", async () => {
    const { input, scene, host, props } = setup();
    const view = render(
      createElement(OperationalObservatory, {
        ...props,
        selectedId: host.resourceId,
      }),
    );
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    const search = screen.getByRole("searchbox", {
      name: "Search complete Observatory inventory",
    });
    fireEvent.change(search, { target: { value: "Synthetic repository 1" } });
    const request = props.onQueryChange.mock.lastCall![0];
    const searched = projectObservatory({ ...input, ...request });
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        selectedId: host.resourceId,
        scene: searched,
      }),
    );
    const result = searched.searchResults[0]!;
    const node = searched.representations.find(
      (item) => item.id === result.representationId,
    )!;
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${node.label}, Repository, ${node.memberCount} unique resources`,
      }),
    );
    expect(props.onSelect).toHaveBeenLastCalledWith(result.resourceId);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(props.onSelect).toHaveBeenLastCalledWith(host.resourceId);
    expect(props.onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "", grouping: scene.grouping }),
    );
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: host.label }),
    ).toBeTruthy();
  });
  it("dismisses Appearance before unwinding focus and clears removed-scope names", async () => {
    const { props, host } = setup();
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${host.label}, Host, ${host.memberCount} unique resources`,
      }),
    );
    const trigger = screen.getByRole("button", {
      name: "Appearance and views",
    });
    fireEvent.click(trigger);
    const form = screen.getByRole("dialog", {
      name: "Observatory appearance and local views",
    });
    expect(form).not.toHaveAttribute("aria-modal");
    fireEvent.keyDown(form, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: host.label }),
    ).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: "Coverage and evidence" }),
    ).toBeTruthy();
    const next = projectObservatory({
      ...scaleObservatoryFixture(0),
      scopeDigest: "different-authorized-scope",
    });
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: next }),
    );
    await screen.findByText("No authorized resources in this view.");
    expect(screen.queryByText(host.label)).toBeNull();
  });
  it("keeps complete outline, search and honest unsupported work when WebGL fails", async () => {
    engine.fail = true;
    const { props, scene } = setup();
    render(createElement(OperationalObservatory, props));
    await screen.findByText(/Terrain is unavailable/);
    expect(screen.getByText(/Complete resource outline/).textContent).toContain(
      "91",
    );
    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(
      screen.getByText(/No qualifying active work observation/),
    ).toBeTruthy();
    expect(scene.summary.coverage.monitored).toBe(0);
    const group = scene.representations.find(
      (node) => node.kind === "collection" && node.memberCount === 60,
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: `Expand ${group.label}` }),
    );
    expect(props.onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expandedRepresentationIds: expect.arrayContaining([group.id]),
      }),
    );
  });
});
