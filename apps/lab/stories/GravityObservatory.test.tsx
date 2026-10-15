import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { Anchor } from "./gravity/renderer";
import {
  arrivalHost,
  fixtureHosts,
  projectWells,
  surfaceHeight,
} from "./gravity/model";
import {
  fittedPose,
  landscapeBounds,
  presentationPose,
} from "./gravity/presentation";

const mock = vi.hoisted(() => ({
  update: vi.fn(),
  dispose: vi.fn(),
  emit: vi.fn(),
  preset: vi.fn(),
  fail: false,
  hooks: null as null | {
    anchors: (anchors: Anchor[]) => void;
    lens: (amount: number) => void;
  },
}));
vi.mock("./gravity/renderer", () => ({
  ObservatoryRenderer: class {
    constructor(
      _container: HTMLElement,
      _settings: unknown,
      hooks: NonNullable<typeof mock.hooks>,
    ) {
      if (mock.fail) throw new Error("No WebGL");
      mock.hooks = hooks;
    }
    update = mock.update;
    dispose = mock.dispose;
    emit = mock.emit;
    preset = mock.preset;
    measureAnchor = vi.fn();
  },
}));
import { GravityObservatory } from "./gravity/GravityObservatory";
import { LabelLayout, labelHeight } from "./gravity/labels";

beforeEach(() => {
  vi.clearAllMocks();
  mock.fail = false;
  mock.hooks = null;
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});
afterEach(cleanup);

describe("gravity projection semantics", () => {
  it("preserves each resource once across projections and keeps custom grouping out of source data", () => {
    const before = JSON.stringify(fixtureHosts);
    const identity = projectWells(fixtureHosts, "hosts", {})
      .map((w) => w.id)
      .sort();
    for (const mode of ["projects", "custom"] as const) {
      const projection = projectWells(fixtureHosts, mode, { electra: "home" });
      const resources = projection.filter((w) => w.kind !== "project");
      expect(resources.map((w) => w.id).sort()).toEqual(identity);
      expect(new Set(resources.map((w) => w.id)).size).toBe(identity.length);
    }
    expect(
      projectWells(fixtureHosts, "custom", { electra: "home" }).find(
        (w) => w.id === "electra",
      )?.sector,
    ).toBe("home");
    expect(JSON.stringify(fixtureHosts)).toBe(before);
  });
  it("adds a host locally without moving existing host-view landmarks", () => {
    const before = projectWells(fixtureHosts, "hosts", {});
    const after = projectWells([...fixtureHosts, arrivalHost], "hosts", {});
    for (const well of before)
      expect(after.find((w) => w.id === well.id)).toEqual(well);
    expect(after.filter((w) => w.hostId === "atlas")).toHaveLength(3);
    const atlas = after.find((w) => w.id === "atlas")!;
    expect(surfaceHeight(atlas.x, atlas.z, after)).toBeLessThan(
      surfaceHeight(atlas.x, atlas.z, before) - 0.8,
    );
    expect(surfaceHeight(100, 100, after)).toBeCloseTo(
      surfaceHeight(100, 100, before),
      6,
    );
  });
});

describe("gravity study controls", () => {
  it("keeps label elements mounted through visibility changes and synchronizes the lens frame", () => {
    render(<GravityObservatory />);
    const anchor: Anchor = {
      id: "electra",
      label: "Electra",
      kind: "host",
      x: 300,
      y: 250,
      visible: true,
      opacity: 1,
      attention: false,
      sector: "commandry",
    };
    act(() => mock.hooks!.anchors([anchor]));
    const button = screen.getByRole("button", { name: "Select Electra" });
    act(() => {
      mock.hooks!.anchors([
        { ...anchor, x: 310, y: 255, opacity: 0.5, visible: false },
      ]);
      mock.hooks!.lens(0.5);
    });
    expect(button.isConnected).toBe(true);
    expect(button.getAttribute("aria-hidden")).toBe("true");
    expect(button.style.transform).toContain("310px, 255px");
    expect(
      document
        .querySelector<HTMLElement>(".gravity-lens-frame")!
        .style.getPropertyValue("--lens-amount"),
    ).toBe("0.5");
    act(() => mock.hooks!.anchors([anchor]));
    expect(screen.getByRole("button", { name: "Select Electra" })).toBe(button);
  });
  it("spawns once, exposes all inventory, and emits only a deliberately simulated event", () => {
    render(<GravityObservatory />);
    expect(mock.emit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Spawn a host" }));
    expect(screen.getByRole("button", { name: "Inspect Atlas" })).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Atlas discovered",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Send event" }));
    expect(mock.emit).toHaveBeenCalledWith("electra/Worker");
    expect(
      screen.getByText("Simulated job delivered to Electra."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(
      (screen.getByRole("button", { name: "Send event" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("changes projection, persists custom placement, and cleans up the renderer", () => {
    const { unmount } = render(<GravityObservatory />);
    fireEvent.click(screen.getByRole("button", { name: "Custom view" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Observatory settings" }),
    );
    fireEvent.input(screen.getByLabelText("Work sector color"), {
      target: { value: "#8a72d1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Electra sector" }), {
      target: { value: "home" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Electra sector" }), {
      target: { value: "work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      (
        screen.getByRole("combobox", {
          name: "Electra sector",
        }) as HTMLSelectElement
      ).value,
    ).toBe("home");
    expect(
      (screen.getByLabelText("Work sector color") as HTMLInputElement).value,
    ).toBe("#8a72d1");
    expect(
      mock.update.mock.lastCall?.[0].find(
        (w: { id: string }) => w.id === "electra",
      ).sector,
    ).toBe("home");
    unmount();
    expect(mock.dispose).toHaveBeenCalledOnce();
  });
  it("keeps inventory and unknown health available without WebGL", async () => {
    mock.fail = true;
    await act(async () => {
      render(<GravityObservatory />);
    });
    await waitFor(() =>
      expect(screen.getByText("Terrain unavailable")).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Inspect Titan" }));
    expect(screen.getByRole("heading", { name: "Titan" })).toBeTruthy();
    expect(screen.getAllByText("Unknown")).toHaveLength(3);
    expect(
      (
        screen.getByRole("button", {
          name: "Open focus lens",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("honors reduced motion while leaving camera presets available", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(<GravityObservatory />);
    expect(screen.getByRole("button", { name: "Resume motion" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Slow orbit" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(mock.preset).toHaveBeenCalledWith("top");
  });
});

describe("observatory presentation", () => {
  it("starts autoplay at the current camera bearing instead of returning to its original angle", () => {
    const wells = projectWells(fixtureHosts, "hosts", {});
    for (const bearing of [-2.8, -1, 1.7, 3.1]) {
      const pose = presentationPose(wells, 1.5, 0, false, bearing);
      expect(
        Math.atan2(
          pose.position.x - pose.target.x,
          pose.position.z - pose.target.z,
        ),
      ).toBeCloseTo(bearing);
    }
  });
  it("uses service count by default and supports capacity sizing without changing identity", () => {
    const services = projectWells(fixtureHosts, "hosts", {});
    const ram = projectWells(
      [...fixtureHosts, arrivalHost],
      "hosts",
      {},
      "capacity",
    );
    expect(
      services.find((well) => well.id === "pleiades")!.radius,
    ).toBeGreaterThan(services.find((well) => well.id === "titan")!.radius);
    const compute = services.find((well) => well.id === "pleiades")!;
    const storage = services.find((well) => well.id === "maia")!;
    expect(compute.radius ** 2 * compute.aspect).toBeGreaterThan(
      storage.radius ** 2 * storage.aspect,
    );
    expect(ram.find((well) => well.id === "atlas")!.radius).toBeGreaterThan(
      ram.find((well) => well.id === "electra")!.radius,
    );
    const hosts = services.filter((well) => well.kind === "host");
    expect(new Set(hosts.map((well) => well.aspect)).size).toBeGreaterThan(1);
    for (let i = 0; i < hosts.length; i++)
      for (let j = i + 1; j < hosts.length; j++) {
        const a = hosts[i]!,
          b = hosts[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
          (a.radius * Math.max(1, a.aspect) +
            b.radius * Math.max(1, b.aspect)) *
            1.75,
        );
      }
  });
  it("fits the complete landscape in portrait and wide views throughout orbit", () => {
    const wells = projectWells(
      [...fixtureHosts, arrivalHost],
      "hosts",
      {},
      "capacity",
    );
    const bounds = landscapeBounds(wells);
    for (const aspect of [0.5, 1, 2.3])
      for (const elevation of [0.28, 0.95])
        for (let azimuth = 0; azimuth < Math.PI * 2; azimuth += Math.PI / 4) {
          const pose = fittedPose(bounds, aspect, azimuth, elevation);
          const camera = new PerspectiveCamera(40, aspect, 0.1, 500);
          camera.position.set(
            pose.position.x,
            pose.position.y,
            pose.position.z,
          );
          camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
          camera.updateMatrixWorld();
          for (const x of [-bounds.half.x, bounds.half.x])
            for (const y of [-bounds.half.y, bounds.half.y])
              for (const z of [-bounds.half.z, bounds.half.z]) {
                const point = new Vector3(
                  bounds.center.x + x,
                  y,
                  bounds.center.z + z,
                ).project(camera);
                expect(Math.abs(point.x)).toBeLessThan(0.95);
                expect(Math.abs(point.y)).toBeLessThan(0.95);
              }
        }
  });
  it("visits every host and crosses tour handoffs without a camera jump", () => {
    const wells = projectWells(fixtureHosts, "hosts", {});
    const visited = new Set(
      fixtureHosts.map(
        (_, index) =>
          presentationPose(wells, 1.5, (index + 0.5) * 14, true).featured,
      ),
    );
    expect(visited).toEqual(new Set(fixtureHosts.map((host) => host.id)));
    const before = presentationPose(wells, 1.5, 14 - 0.0001, true);
    const after = presentationPose(wells, 1.5, 14 + 0.0001, true);
    expect(
      Math.hypot(
        before.position.x - after.position.x,
        before.position.y - after.position.y,
        before.position.z - after.position.z,
      ),
    ).toBeLessThan(0.01);
    expect(
      Math.hypot(
        before.target.x - after.target.x,
        before.target.z - after.target.z,
      ),
    ).toBeLessThan(0.01);
  });
  it("keeps ambient waves bounded and exposes deliberate controls for presentation", () => {
    const wells = projectWells(fixtureHosts, "hosts", {});
    for (const time of [0, 30, 300])
      expect(
        Math.abs(
          surfaceHeight(0, 0, wells, time, 1) -
            surfaceHeight(0, 0, wells, time, 0),
        ),
      ).toBeLessThanOrEqual(0.055);
    render(<GravityObservatory />);
    expect(mock.update.mock.lastCall?.[1].cameraMode).toBe("composed");
    fireEvent.click(screen.getByRole("button", { name: "Guided tour" }));
    expect(mock.update.mock.lastCall?.[1].cameraMode).toBe("tour");
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(mock.update.mock.lastCall?.[1].motion).toBe(false);
    expect(mock.update.mock.lastCall?.[1].cameraMode).toBe("tour");
    fireEvent.click(
      screen.getByRole("button", { name: "Observatory settings" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Well size" }), {
      target: { value: "capacity" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ambient field" }));
    expect(mock.update.mock.lastCall?.[1].ambient).toBe(false);
    expect(screen.getByRole("main").getAttribute("data-size")).toBe("capacity");
  });
});

describe("stable terrain labels", () => {
  const label = (id: string, x: number, y: number, visible = true) => ({
    id,
    x,
    y,
    visible,
    opacity: 0,
  });

  it("anchors above each structural crest independently of ambient waves and neighbouring wells", () => {
    const wells = projectWells(fixtureHosts, "hosts", {});
    for (const well of wells) {
      const height = labelHeight(well);
      for (const time of [0, 20, 200])
        expect(height).toBeGreaterThan(
          surfaceHeight(well.x, well.z, wells, time, 1),
        );
      expect(labelHeight({ ...well, depth: well.depth * 2 })).toBe(height);
    }
  });

  it("separates colliding labels without flipping lanes when their anchors cross", () => {
    const layout = new LabelLayout();
    layout.measure("a", 110, 42);
    layout.measure("b", 110, 42);
    let previous = layout.layout(
      [label("a", 300, 250), label("b", 300, 252)],
      800,
      600,
      1 / 120,
      true,
    );
    for (let frame = 1; frame <= 600; frame++) {
      const next = layout.layout(
        [
          label("a", 300, 250 + Math.sin(frame * 0.06)),
          label("b", 300, 250 - Math.sin(frame * 0.06)),
        ],
        800,
        600,
        1 / 120,
        true,
      );
      for (let i = 0; i < next.length; i++)
        expect(Math.abs(next[i]!.y - previous[i]!.y)).toBeLessThan(2.2);
      expect(next[0]!.y).toBeLessThan(next[1]!.y);
      previous = next;
    }
    expect(previous[1]!.y - previous[0]!.y).toBeGreaterThan(50);
  });

  it("uses measured label bounds and keeps settled labels still", () => {
    const layout = new LabelLayout();
    layout.measure("long", 180, 50);
    layout.measure("short", 70, 28);
    const input = [label("long", 370, 240), label("short", 400, 260)];
    let settled = input;
    for (let frame = 0; frame < 1000; frame++)
      settled = layout.layout(input, 800, 600, 1 / 60, true);
    const next = layout.layout(input, 800, 600, 1 / 60, true);
    expect(Math.abs(next[0]!.y - settled[0]!.y)).toBeLessThan(0.01);
    expect(next[1]!.y - 28 - next[0]!.y).toBeGreaterThanOrEqual(9.9);
    expect(layout.changing).toBe(false);
  });

  it("fades edge visibility smoothly and settles immediately with reduced motion", () => {
    const layout = new LabelLayout();
    const input = [label("a", 300, 250)];
    const first = layout.layout(input, 800, 600, 1 / 60, true)[0]!;
    const disappearing = layout.layout(
      [label("a", 300, 250, false)],
      800,
      600,
      1 / 60,
      true,
    )[0]!;
    expect(disappearing.opacity).toBeGreaterThan(0);
    expect(disappearing.opacity).toBeLessThan(first.opacity);
    const paused = layout.layout(
      [label("a", 300, 250, false)],
      800,
      600,
      1 / 60,
      false,
    )[0]!;
    expect(paused.opacity).toBe(0);
    expect(layout.changing).toBe(false);
  });
});
