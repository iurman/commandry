// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InfrastructureOverview } from "@commandry/contracts";
const mock = vi.hoisted(() => ({
  fail: false,
  update: vi.fn(),
  dispose: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../gravity/renderer", () => ({
  ObservatoryRenderer: class {
    constructor() {
      if (mock.fail) throw Error("GPU unavailable");
    }
    update = mock.update;
    dispose = mock.dispose;
    refreshActivity = mock.refresh;
    measureAnchor = vi.fn();
  },
}));
import GravityInfrastructure from "./GravityInfrastructure";
const snapshot: InfrastructureOverview = {
  readAt: new Date().toISOString(),
  total: 2,
  nextCursor: null,
  edges: [],
  events: [],
  items: [
    {
      id: "host",
      name: "Actual server",
      kind: "host",
      parentResourceId: null,
      childCount: 12,
      projects: [],
      sources: [],
      metrics: [],
      telemetry: "reporting",
      health: "unknown",
    },
    {
      id: "service",
      name: "Actual service",
      kind: "service",
      parentResourceId: "host",
      projects: [],
      sources: [],
      metrics: [],
      telemetry: "unknown",
      health: "unknown",
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.fail = false;
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
it("keeps real selection, unknown health and appearance independent of domain data and disposes the shared renderer", async () => {
  const select = vi.fn();
  const view = render(
    <GravityInfrastructure
      snapshot={snapshot}
      selectedId="host"
      onSelect={select}
      onProject={vi.fn()}
    />,
  );
  await waitFor(() => expect(mock.update).toHaveBeenCalled());
  expect(screen.getByText("Reporting / Service health: unknown")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: /Select Actual service, service/ }),
  );
  expect(select).toHaveBeenCalledWith("service");
  fireEvent.change(screen.getByLabelText("Gravity grouping"), {
    target: { value: "custom" },
  });
  fireEvent.change(screen.getByLabelText("Custom layout sector"), {
    target: { value: "Home lab" },
  });
  expect(
    JSON.parse(localStorage.getItem("commandry.infrastructure.gravity.v1")!)
      .assignments.host,
  ).toBe("Home lab");
  const source = mock.update.mock.lastCall![1].activity.source;
  expect(source.snapshot().transfers).toEqual([]);
  await act(async () => {
    view.unmount();
  });
  expect(mock.dispose).toHaveBeenCalledOnce();
});
it("retains every resource selection when WebGL is unavailable", async () => {
  mock.fail = true;
  const select = vi.fn();
  render(
    <GravityInfrastructure
      snapshot={snapshot}
      selectedId="host"
      onSelect={select}
      onProject={vi.fn()}
    />,
  );
  await screen.findByText(/3D renderer is unavailable/);
  expect(
    screen.getByRole("button", { name: /Select Actual server, host/ }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: /Select Actual service, service/ }),
  );
  expect(select).toHaveBeenCalledWith("service");
  expect(
    (
      screen.getByRole("button", {
        name: "Open focus lens",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it("uses Midnight for TV style while retaining explicit surface overrides", async () => {
  const view = render(
    <GravityInfrastructure
      snapshot={snapshot}
      selectedId="host"
      onSelect={vi.fn()}
      onProject={vi.fn()}
      dark
    />,
  );
  await waitFor(() => expect(mock.update).toHaveBeenCalled());
  expect(
    view.container.querySelector(".cmd-gravity")?.getAttribute("data-theme"),
  ).toBe("midnight");
  fireEvent.click(screen.getByRole("button", { name: /^Appearance$/ }));
  fireEvent.change(screen.getByLabelText("Gravity surface"), {
    target: { value: "porcelain" },
  });
  expect(
    view.container.querySelector(".cmd-gravity")?.getAttribute("data-theme"),
  ).toBe("porcelain");
});
