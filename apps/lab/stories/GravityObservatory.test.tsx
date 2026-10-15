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
  arrivalHost,
  fixtureHosts,
  projectWells,
  surfaceHeight,
} from "./gravity/model";

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
      surfaceHeight(atlas.x, atlas.z, before) - 2,
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
    expect(screen.getAllByText("Unknown")).toHaveLength(4);
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
      (screen.getByRole("button", { name: "Auto orbit" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(mock.preset).toHaveBeenCalledWith("top");
  });
});
