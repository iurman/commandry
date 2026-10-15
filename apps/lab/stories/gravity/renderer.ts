import { ObservatoryRenderer as SharedRenderer } from "@commandry/ui/gravity/renderer";
import type {
  RendererSettings,
  RendererHooks,
} from "@commandry/ui/gravity/renderer";
import type { Well, Host } from "./model";
import { ActivitySimulation, resourceHealth } from "./activity";
import type { ActivitySnapshot, Scenario } from "./activity";
export type { Anchor, RenderStats } from "@commandry/ui/gravity/renderer";

type Settings = Omit<RendererSettings, "activity"> & {
  simulation: {
    hosts: Host[];
    scenario: Scenario;
    running: boolean;
    speed: number;
    follow: boolean;
    trace: string | null;
  };
};
type Hooks = Omit<RendererHooks, "activity"> & {
  activity: (snapshot: ActivitySnapshot) => void;
};
type State = { engine: ActivitySimulation; controls: Settings["simulation"] };
function activity(state: State): RendererSettings["activity"] {
  let snapshot = state.engine.snapshot(state.controls.trace);
  return {
    running: state.controls.running,
    follow: state.controls.follow,
    trace: state.controls.trace,
    source: {
      snapshot: () => (snapshot = state.engine.snapshot(state.controls.trace)),
      advance: (seconds) =>
        state.engine.advance(seconds * state.controls.speed),
      attention: (id) => {
        const health = resourceHealth(snapshot, id).state;
        return health === "unhealthy" ? 1 : health === "degraded" ? 0.5 : 0;
      },
    },
  };
}
// The synthetic engine and its controls remain exclusively in the local lab.
export class ObservatoryRenderer {
  private shared: SharedRenderer;
  private lab: State;
  measureAnchor(id: string, width: number, height: number) {
    this.shared.measureAnchor(id, width, height);
  }
  preset(preset: "overview" | "top" | "angle") {
    this.shared.preset(preset);
  }
  dispose() {
    this.shared.dispose();
  }
  constructor(container: HTMLElement, settings: Settings, hooks: Hooks) {
    const state = {
      engine: new ActivitySimulation(
        settings.simulation.hosts,
        settings.simulation.scenario,
      ),
      controls: settings.simulation,
    };
    this.shared = new SharedRenderer(
      container,
      { ...settings, activity: activity(state) },
      {
        ...hooks,
        activity: () =>
          hooks.activity(state.engine.snapshot(state.controls.trace)),
      },
    );
    this.lab = state;
  }
  update(wells: Well[], settings: Settings) {
    if (settings.simulation.scenario !== this.lab.controls.scenario)
      this.lab.engine = new ActivitySimulation(
        settings.simulation.hosts,
        settings.simulation.scenario,
      );
    else if (settings.simulation.hosts !== this.lab.controls.hosts)
      this.lab.engine.setHosts(settings.simulation.hosts);
    this.lab.controls = settings.simulation;
    this.shared.update(wells, { ...settings, activity: activity(this.lab) });
  }
  emit(id: string) {
    this.lab.engine.sendJob(id.split("/")[0]);
    this.shared.refreshActivity();
  }
  resetActivity() {
    this.lab.engine = new ActivitySimulation(
      this.lab.controls.hosts,
      this.lab.controls.scenario,
    );
    this.shared.refreshActivity();
  }
  stepActivity() {
    this.lab.engine.advance(5);
    this.shared.refreshActivity();
  }
}
