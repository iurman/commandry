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
}));
vi.mock("./gravity/renderer", () => ({
  ObservatoryRenderer: class {
    constructor() {
      if (mock.fail) throw new Error("No WebGL");
    }
    update = mock.update;
    dispose = mock.dispose;
    emit = mock.emit;
    preset = mock.preset;
  },
}));
import { GravityObservatory } from "./gravity/GravityObservatory";

beforeEach(() => {
  vi.clearAllMocks();
  mock.fail = false;
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
