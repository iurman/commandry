import { useEffect, useMemo, useRef, useState } from "react";
import {
  arrivalHost,
  fixtureHosts,
  initialPalette,
  projectWells,
  sectors,
} from "./model";
import type {
  CameraMode,
  SizeBasis,
  Palette,
  SectorId,
  SurfaceTheme,
  ViewMode,
} from "./model";
import { ObservatoryRenderer } from "./renderer";
import type { Anchor, RenderStats } from "./renderer";
import { ActivitySimulation, resourceHealth, scenarios } from "./activity";
import {
  ActivityPanel,
  clockLabel,
  initialActivityControls,
} from "./ActivityPanel";
import type { ActivityControls } from "./ActivityPanel";
import { ActivityCaption } from "./ActivityCaption";
import "./observatory.css";

function Icon({
  name,
}: {
  name:
    | "orbit"
    | "focus"
    | "settings"
    | "plus"
    | "play"
    | "pause"
    | "close"
    | "top"
    | "arrow";
}) {
  const paths = {
    orbit: (
      <>
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)" />
        <ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(-35 12 12)" />
        <circle cx="12" cy="12" r="1.4" />
      </>
    ),
    focus: (
      <>
        <circle cx="12" cy="12" r="6" />
        <path d="M8 2H2v6m14-6h6v6M2 16v6h6m14-6v6h-6" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    play: <path d="m8 4 12 8-12 8z" />,
    pause: <path d="M8 4v16M16 4v16" />,
    close: <path d="m5 5 14 14M5 19 19 5" />,
    top: (
      <>
        <path d="m12 3 9 9-9 9-9-9z" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const emptyStats: RenderStats = { fps: 0, calls: 0, triangles: 0, frameMs: 0 };
const defaults: Record<string, SectorId> = {
  electra: "commandry",
  pleiades: "work",
  maia: "home",
  titan: "work",
  atlas: "commandry",
};

function positionAnchor(element: HTMLButtonElement, anchor: Anchor) {
  element.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0) translate(-50%, -100%)`;
  element.style.setProperty("--anchor-opacity", String(anchor.opacity));
  const visibility = anchor.opacity < 0.002 ? "hidden" : "visible";
  if (element.style.visibility !== visibility)
    element.style.visibility = visibility;
  if (element.inert !== !anchor.visible) element.inert = !anchor.visible;
  const hidden = String(!anchor.visible);
  if (element.getAttribute("aria-hidden") !== hidden)
    element.setAttribute("aria-hidden", hidden);
}

export function GravityObservatory() {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ObservatoryRenderer | null>(null);
  const anchorLayer = useRef<HTMLDivElement>(null);
  const anchorElements = useRef(new Map<string, HTMLButtonElement>());
  const latestAnchors = useRef(new Map<string, Anchor>());
  const anchorSignature = useRef("");
  const lensFrame = useRef<HTMLDivElement>(null);
  const lensProgress = useRef(0);
  const [mode, setMode] = useState<ViewMode>("hosts");
  const [theme, setTheme] = useState<SurfaceTheme>("porcelain");
  const [palette, setPalette] = useState<Palette>(initialPalette);
  const [assignments, setAssignments] = useState(defaults);
  const [hosts, setHosts] = useState(fixtureHosts);
  const [selected, setSelected] = useState<string | null>("electra");
  const [focus, setFocus] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("composed");
  const [sizeBasis, setSizeBasis] = useState<SizeBasis>("services");
  const [ambient, setAmbient] = useState(true);
  const [portrait, setPortrait] = useState(false);
  const [sceneVisible, setSceneVisible] = useState(true);
  const [motion, setMotion] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState("");
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [activity, setActivity] = useState(() =>
    new ActivitySimulation(fixtureHosts).snapshot(),
  );
  const [activityControls, setActivityControls] = useState(
    initialActivityControls,
  );
  const [events, setEvents] = useState([
    "Study ready. Select a well to explore.",
  ]);
  const [saved, setSaved] = useState(false);
  const wells = useMemo(
    () => projectWells(hosts, mode, assignments, sizeBasis, portrait),
    [hosts, mode, assignments, sizeBasis, portrait],
  );
  const settings = useMemo(
    () => ({
      theme,
      palette,
      motion,
      cameraMode,
      ambient,
      selected,
      focus,
      simulation: { ...activityControls, hosts },
    }),
    [
      theme,
      palette,
      motion,
      cameraMode,
      ambient,
      selected,
      focus,
      activityControls,
      hosts,
    ],
  );
  const callbacks = useRef({
    select: (id: string) => setSelected(id),
    interrupted: () => setCameraMode("manual"),
  });

  useEffect(() => {
    if (!container.current) return;
    let instance: ObservatoryRenderer;
    try {
      instance = new ObservatoryRenderer(container.current, settings, {
        anchors: (next) => {
          latestAnchors.current = new Map(
            next.map((anchor) => [anchor.id, anchor]),
          );
          for (const anchor of next) {
            const element = anchorElements.current.get(anchor.id);
            if (element) positionAnchor(element, anchor);
          }
          // React owns content; the renderer places it in the same frame as WebGL.
          const signature = JSON.stringify(
            next.map(({ id, label, kind, attention, sector }) => ({
              id,
              label,
              kind,
              attention,
              sector,
            })),
          );
          if (signature !== anchorSignature.current) {
            anchorSignature.current = signature;
            setAnchors(next);
          }
        },
        stats: setStats,
        activity: setActivity,
        select: (id) => callbacks.current.select(id),
        interrupted: () => callbacks.current.interrupted(),
        unavailable: setError,
        viewport: setPortrait,
        visibility: setSceneVisible,
        lens: (amount) => {
          lensProgress.current = amount;
          anchorLayer.current?.style.setProperty(
            "--lens-amount",
            String(amount),
          );
          lensFrame.current?.style.setProperty("--lens-amount", String(amount));
        },
      });
      renderer.current = instance;
    } catch {
      queueMicrotask(() =>
        setError(
          "WebGL 2 is unavailable in this browser. You can still explore the synthetic inventory below.",
        ),
      );
      return;
    }
    return () => {
      instance.dispose();
      renderer.current = null;
    };
    // The renderer owns its lifetime; changing inputs are supplied by update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderer.current?.update(wells, settings);
  }, [wells, settings]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      if (query.matches) {
        setMotion(false);
        setCameraMode("manual");
      }
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  const host = hosts.find(
    (h) => h.id === selected || selected?.startsWith(`${h.id}/`),
  );
  const selectedWell = wells.find((w) => w.id === selected);
  const selectedSector = sectors.find((s) => s.id === selectedWell?.sector);
  const serviceCount = hosts.reduce((sum, h) => sum + h.services.length, 0);
  const healthSummary = Object.values(activity.health).reduce(
    (counts, sample) => ({
      ...counts,
      [sample.state]: counts[sample.state] + 1,
    }),
    { healthy: 0, unknown: 0, degraded: 0, unhealthy: 0 },
  );
  const selectedHealth = resourceHealth(activity, selected ?? "");
  const addEvent = (message: string) =>
    setEvents((previous) => [message, ...previous].slice(0, 5));

  function selectResource(id: string) {
    setSelected(id);
    if (cameraMode === "tour") setCameraMode("manual");
  }

  function spawn() {
    if (hosts.some((h) => h.id === arrivalHost.id)) return;
    setHosts([...hosts, arrivalHost]);
    addEvent("Atlas discovered. A new well is settling into the field.");
  }
  function sendEvent() {
    const destination = host ?? hosts[0]!;
    renderer.current?.emit(
      `${destination.id}/${destination.services[1] ?? destination.services[0]}`,
    );
    addEvent(`Simulated job dispatched to ${destination.name}.`);
  }
  function saveView() {
    try {
      window.localStorage.setItem(
        "commandry.gravity-study.v1",
        JSON.stringify({
          mode,
          theme,
          palette,
          assignments,
          sizeBasis,
          ambient,
          cameraMode,
          activity: activityControls,
        }),
      );
      setSaved(true);
      addEvent("View grouping and appearance saved on this device.");
    } catch {
      addEvent(
        "Browser storage is unavailable. This view remains open for this session.",
      );
    }
  }
  function restoreView() {
    try {
      const raw = window.localStorage.getItem("commandry.gravity-study.v1");
      if (!raw) {
        addEvent("No saved study view on this device yet.");
        return;
      }
      const data = JSON.parse(raw) as {
        mode: ViewMode;
        theme: SurfaceTheme;
        palette: Palette;
        assignments: Record<string, SectorId>;
        sizeBasis?: SizeBasis;
        ambient?: boolean;
        cameraMode?: CameraMode;
        activity?: ActivityControls;
      };
      if (
        !["hosts", "projects", "custom"].includes(data.mode) ||
        !["porcelain", "midnight"].includes(data.theme)
      )
        throw new Error("Invalid view");
      data.palette.unhealthy ??= initialPalette.unhealthy;
      if (
        !Object.keys(initialPalette).every((key) =>
          /^#[0-9a-f]{6}$/i.test(data.palette[key as keyof Palette]),
        ) ||
        !Object.values(data.assignments).every((s) =>
          sectors.some((sector) => sector.id === s),
        )
      )
        throw new Error("Invalid view");
      setMode(data.mode);
      setTheme(data.theme);
      setPalette(data.palette);
      setAssignments(data.assignments);
      if (data.activity)
        setActivityControls({
          ...initialActivityControls,
          scenario:
            data.activity.scenario in scenarios
              ? data.activity.scenario
              : "steady",
          speed: [0.5, 1, 2, 4].includes(data.activity.speed)
            ? data.activity.speed
            : 1,
          follow: data.activity.follow === true,
        });
      setSizeBasis(
        data.sizeBasis &&
          ["services", "capacity", "uniform"].includes(data.sizeBasis)
          ? data.sizeBasis
          : "services",
      );
      setAmbient(data.ambient !== false);
      setCameraMode(
        data.cameraMode &&
          ["composed", "orbit", "tour", "manual"].includes(data.cameraMode)
          ? data.cameraMode
          : "composed",
      );
      addEvent("Saved study view restored.");
    } catch {
      addEvent(
        "Saved view could not be read. Current settings were preserved.",
      );
    }
  }

  return (
    <main
      className="gravity-study"
      data-theme={theme}
      data-mode={mode}
      data-focused={focus}
      data-motion={motion}
      data-camera={cameraMode}
      data-size={sizeBasis}
      style={
        {
          "--gravity-commandry": palette.commandry,
          "--gravity-work": palette.work,
          "--gravity-home": palette.home,
          "--gravity-warning": palette.attention,
          "--gravity-reporting": palette.reporting,
          "--gravity-unhealthy": palette.unhealthy,
        } as React.CSSProperties
      }
    >
      <header className="gravity-header">
        <div className="gravity-wordmark">
          <Icon name="orbit" />
          <span>
            COMMANDRY <span className="gravity-muted">/ OBSERVATORY</span>
          </span>
        </div>
        <div className="gravity-counts">
          <span>
            <b>{hosts.length.toString().padStart(2, "0")}</b> hosts
          </span>
          <span>
            <b>{serviceCount}</b> services
          </span>
          <span className="gravity-warning">
            <b>{healthSummary.degraded + healthSummary.unhealthy}</b> need
            attention
          </span>
        </div>
        <button
          className="gravity-icon-button"
          aria-label="Observatory settings"
          aria-expanded={drawer}
          onClick={() => setDrawer(!drawer)}
        >
          <Icon name="settings" />
        </button>
      </header>
      <div className="gravity-toolbar">
        <div>
          <p className="gravity-eyebrow">A DIFFERENT PERSPECTIVE</p>
          <h1>
            Gravity Observatory<span>.</span>
          </h1>
        </div>
        <div
          className="gravity-view-picker"
          role="group"
          aria-label="Group landscape by"
        >
          {(["hosts", "projects", "custom"] as const).map((view) => (
            <button
              key={view}
              aria-pressed={mode === view}
              onClick={() => {
                setMode(view);
                setFocus(false);
                setCameraMode("composed");
                addEvent(`Landscape arranged by ${view}.`);
              }}
            >
              {view === "custom"
                ? "Custom view"
                : view[0]!.toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="gravity-spawn"
          disabled={hosts.length > fixtureHosts.length}
          onClick={spawn}
        >
          <Icon name="plus" />
          {hosts.length > fixtureHosts.length
            ? "Atlas discovered"
            : "Spawn a host"}
        </button>
      </div>
      <div className="gravity-body">
        <section className="gravity-stage" aria-label="Gravity landscape">
          <div className="gravity-stage-heading">
            <span>
              {mode === "hosts"
                ? "INFRASTRUCTURE FIELD"
                : mode === "projects"
                  ? "PROJECT LANDSCAPE"
                  : "YOUR ARRANGEMENT"}
            </span>
            <span>
              Size:{" "}
              {sizeBasis === "capacity"
                ? "RAM capacity"
                : sizeBasis === "services"
                  ? "service count"
                  : "uniform"}{" "}
              <span className="gravity-divider">/</span>{" "}
              {mode === "hosts"
                ? "Host wells + service satellites"
                : "Sector basins + nested hosts"}
            </span>
          </div>
          <div ref={container} className="gravity-canvas" />
          <div
            className="gravity-activity-bar"
            aria-label="Simulated activity overview"
          >
            <select
              aria-label="Scene scenario"
              disabled={!!error}
              value={activityControls.scenario}
              onChange={(event) =>
                setActivityControls((previous) => ({
                  ...previous,
                  scenario: event.target.value as ActivityControls["scenario"],
                  trace: null,
                }))
              }
            >
              {Object.entries(scenarios).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              aria-label={
                activityControls.running ? "Pause activity" : "Resume activity"
              }
              disabled={!!error}
              onClick={() =>
                setActivityControls((previous) => ({
                  ...previous,
                  running: !previous.running,
                }))
              }
            >
              {activityControls.running ? "Pause" : "Run"}
            </button>
            <span>
              <i
                data-running={
                  activityControls.running && motion && sceneVisible && !error
                }
              />{" "}
              SIMULATION / {clockLabel(activity.time)} /{" "}
              {error
                ? "UNAVAILABLE"
                : activityControls.running && motion && sceneVisible
                  ? "RUNNING"
                  : "PAUSED"}
            </span>
            <span>
              {activity.transfers.length} transfers <b>/</b>{" "}
              {healthSummary.healthy} healthy <b>/</b> {healthSummary.unknown}{" "}
              unknown
            </span>
            {activityControls.trace && (
              <button
                onClick={() =>
                  setActivityControls((previous) => ({
                    ...previous,
                    trace: null,
                  }))
                }
              >
                Clear {activityControls.trace}
              </button>
            )}
            {!error && (
              <ActivityCaption
                snapshot={activity}
                trace={activityControls.trace}
                inspect={(id, destination) => {
                  setActivityControls((previous) => ({
                    ...previous,
                    trace: id,
                  }));
                  selectResource(destination);
                }}
              />
            )}
          </div>
          <div
            ref={anchorLayer}
            className="gravity-anchors"
            aria-hidden={!!error}
          >
            {anchors.map((anchor) =>
              anchor.id.startsWith("label-") ? (
                <span
                  key={anchor.id}
                  className={`gravity-sector-label gravity-sector-${anchor.sector}`}
                  style={{ left: anchor.x, top: anchor.y }}
                >
                  {anchor.label}
                </span>
              ) : (
                <button
                  key={anchor.id}
                  className={`gravity-anchor gravity-anchor-${anchor.kind} ${["degraded", "unhealthy"].includes(resourceHealth(activity, anchor.id).state) ? "is-attention" : ""} ${selected === anchor.id ? "is-selected" : ""} ${!anchor.id.startsWith("lens-") ? "is-background" : ""}`}
                  data-health={resourceHealth(activity, anchor.id).state}
                  ref={(element) => {
                    if (!element) {
                      anchorElements.current.delete(anchor.id);
                      return;
                    }
                    anchorElements.current.set(anchor.id, element);
                    positionAnchor(
                      element,
                      latestAnchors.current.get(anchor.id) ?? anchor,
                    );
                    renderer.current?.measureAnchor(
                      anchor.id,
                      element.offsetWidth,
                      element.offsetHeight,
                    );
                  }}
                  onClick={() => selectResource(anchor.id.replace("lens-", ""))}
                  aria-label={`Select ${anchor.label}`}
                >
                  <span>{anchor.label}</span>
                  {anchor.kind === "host" && (
                    <small>
                      {resourceHealth(activity, anchor.id).state === "unknown"
                        ? sectors.find((sector) => sector.id === anchor.sector)
                            ?.label
                        : resourceHealth(activity, anchor.id).state}
                    </small>
                  )}
                </button>
              ),
            )}
          </div>
          {selectedWell && !error && (
            <div
              className="gravity-lens-frame"
              aria-hidden={!focus}
              ref={(element) => {
                lensFrame.current = element;
                element?.style.setProperty(
                  "--lens-amount",
                  String(lensProgress.current),
                );
              }}
            >
              <div className="gravity-lens-caption">
                <span>FOCUS LENS / {selectedWell.kind.toUpperCase()}</span>
                <strong>{selectedWell.label}</strong>
              </div>
              <div className="gravity-lens-metrics">
                {host ? (
                  <>
                    Memory <b>{host.memory}%</b>
                    <span>/</span> Disk <b>{host.disk}%</b>
                  </>
                ) : (
                  "One landscape. A closer look."
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="gravity-unavailable" role="status">
              <h2>Terrain unavailable</h2>
              <p>{error}</p>
            </div>
          )}
          <div className="gravity-compass" aria-hidden="true">
            <svg width="65" height="65" viewBox="0 0 65 65">
              <path
                d="M32 9v47M9 32h47m-32-8 16 16m0-16L24 40"
                stroke="currentColor"
                strokeWidth="0.7"
              />
              <text x="29" y="7">
                N
              </text>
              <circle cx="32" cy="32" r="3" fill="currentColor" />
            </svg>
            <span>ORBIT TO EXPLORE</span>
          </div>
          <div
            className="gravity-camera-controls"
            role="group"
            aria-label="Camera controls"
          >
            {(["composed", "orbit", "tour"] as const).map((camera) => (
              <button
                key={camera}
                aria-label={
                  camera === "composed"
                    ? "Composed overview"
                    : camera === "orbit"
                      ? "Slow orbit"
                      : "Guided tour"
                }
                aria-pressed={cameraMode === camera}
                disabled={camera !== "composed" && !motion}
                onClick={() => {
                  setCameraMode(camera);
                  setFocus(false);
                  if (camera === "composed")
                    renderer.current?.preset("overview");
                }}
              >
                <Icon
                  name={
                    camera === "composed"
                      ? "focus"
                      : camera === "orbit"
                        ? "orbit"
                        : "play"
                  }
                />
                <span>
                  {camera === "composed"
                    ? "Composed"
                    : camera === "orbit"
                      ? "Slow orbit"
                      : "Guided tour"}
                </span>
              </button>
            ))}
            <span className="gravity-control-separator" />
            {(["top", "angle"] as const).map((preset) => (
              <button
                key={preset}
                aria-label={preset === "top" ? "Top" : "Angle"}
                onClick={() => {
                  setCameraMode("manual");
                  renderer.current?.preset(preset);
                }}
              >
                <Icon name={preset === "top" ? "top" : "orbit"} />
                <span>{preset === "top" ? "Top" : "Angle"}</span>
              </button>
            ))}
          </div>
          <div className="gravity-stage-legend">
            <span>
              <i className="gravity-sector-commandry" />
              Commandry
            </span>
            <span>
              <i className="gravity-sector-work" />
              Work
            </span>
            <span>
              <i className="gravity-sector-home" />
              Home Lab
            </span>
          </div>
          <p className="gravity-gesture-hint">
            Drag to orbit <span>/</span> Scroll to zoom <span>/</span> Shift +
            drag to pan
          </p>
        </section>
        <aside
          className="gravity-inspector"
          aria-label={drawer ? "Observatory settings" : "Resource inspector"}
        >
          {drawer ? (
            <>
              <div className="gravity-panel-heading">
                <p className="gravity-eyebrow">MAKE IT YOURS</p>
                <button
                  className="gravity-icon-button"
                  aria-label="Close settings"
                  onClick={() => setDrawer(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              <h2>Observatory settings</h2>
              <fieldset className="gravity-setting">
                <legend>Well size</legend>
                <select
                  className="gravity-size-select"
                  aria-label="Well size"
                  value={sizeBasis}
                  onChange={(e) => setSizeBasis(e.target.value as SizeBasis)}
                >
                  <option value="services">Service count</option>
                  <option value="capacity">RAM capacity</option>
                  <option value="uniform">Uniform</option>
                </select>
                <p className="gravity-help">
                  Service count reserves room for satellites. RAM uses total
                  capacity, not current utilization. Shapes distinguish the
                  synthetic compute, storage and general profiles.
                </p>
              </fieldset>
              <fieldset className="gravity-setting">
                <legend>Atmosphere</legend>
                <label className="gravity-ambient-toggle">
                  <input
                    type="checkbox"
                    checked={ambient}
                    onChange={(e) => setAmbient(e.target.checked)}
                  />
                  Ambient field
                </label>
                <p className="gravity-help">
                  Subtle floor waves, light sweeps and star shimmer. Decorative
                  motion, independent of simulated events. Pause motion freezes
                  all three camera modes and atmosphere.
                </p>
              </fieldset>
              <fieldset className="gravity-setting">
                <legend>Surface</legend>
                <div className="gravity-theme-picker">
                  {(["porcelain", "midnight"] as const).map((surface) => (
                    <button
                      key={surface}
                      aria-pressed={theme === surface}
                      onClick={() => setTheme(surface)}
                    >
                      <span
                        className={`gravity-material gravity-material-${surface}`}
                      />
                      {surface === "porcelain" ? "Porcelain" : "Midnight"}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="gravity-setting">
                <legend>Sector colors</legend>
                {sectors.map((sector) => (
                  <label className="gravity-color-row" key={sector.id}>
                    <span>{sector.label}</span>
                    <input
                      type="color"
                      aria-label={`${sector.label} sector color`}
                      value={palette[sector.id]}
                      onInput={(e) =>
                        setPalette({
                          ...palette,
                          [sector.id]: e.currentTarget.value,
                        })
                      }
                      onChange={(e) =>
                        setPalette({ ...palette, [sector.id]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </fieldset>
              <fieldset className="gravity-setting">
                <legend>Signal colors</legend>
                {(["reporting", "attention", "unhealthy"] as const).map(
                  (state) => (
                    <label className="gravity-color-row" key={state}>
                      <span>
                        {state === "reporting"
                          ? "Healthy check"
                          : state === "unhealthy"
                            ? "Unavailable"
                            : "Degraded"}
                      </span>
                      <input
                        type="color"
                        aria-label={`${state} color`}
                        value={palette[state]}
                        onInput={(e) =>
                          setPalette({
                            ...palette,
                            [state]: e.currentTarget.value,
                          })
                        }
                        onChange={(e) =>
                          setPalette({ ...palette, [state]: e.target.value })
                        }
                      />
                    </label>
                  ),
                )}
                <p className="gravity-help">
                  Rim patterns and labels preserve meaning alongside color.
                  Health changes only after a simulated check completes.
                </p>
              </fieldset>
              {mode === "custom" && (
                <fieldset className="gravity-setting">
                  <legend>Arrange hosts into sectors</legend>
                  {hosts.map((resource) => (
                    <label className="gravity-assignment" key={resource.id}>
                      <span>{resource.name}</span>
                      <select
                        aria-label={`${resource.name} sector`}
                        value={assignments[resource.id] ?? resource.sector}
                        onChange={(e) =>
                          setAssignments({
                            ...assignments,
                            [resource.id]: e.target.value as SectorId,
                          })
                        }
                      >
                        {sectors.map((sector) => (
                          <option key={sector.id} value={sector.id}>
                            {sector.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <p className="gravity-help">
                    Presentation only. Resource identities and project
                    memberships stay intact.
                  </p>
                </fieldset>
              )}
              <div className="gravity-save-row">
                <button className="gravity-primary" onClick={saveView}>
                  {saved ? "Save changes" : "Save view"}
                </button>
                <button onClick={restoreView}>Restore</button>
              </div>
            </>
          ) : (
            <>
              <div className="gravity-panel-heading">
                <p className="gravity-eyebrow">
                  OBSERVATION /{" "}
                  {host
                    ? (hosts.indexOf(host) + 1).toString().padStart(2, "0")
                    : "SECTOR"}
                </p>
                <span className="gravity-source-tag">SYNTHETIC</span>
              </div>
              <h2>{selectedWell?.label ?? "Select a well"}</h2>
              <p className="gravity-resource-kind">
                {selectedWell?.kind === "project"
                  ? "Project basin"
                  : selectedWell?.kind === "service"
                    ? `Service / ${host?.name}`
                    : "Compute host"}{" "}
                <span>/</span> {selectedSector?.label ?? "Overview"}
              </p>
              {host && (
                <p className="gravity-sizing-note">
                  {host.services.length} services <span>/</span> {host.ramGiB}{" "}
                  GiB RAM <span>/</span> {host.profile} profile
                </p>
              )}
              {host && (
                <>
                  <div
                    className="gravity-health"
                    data-health={selectedHealth.state}
                  >
                    <span>
                      {selectedHealth.state === "unhealthy"
                        ? "!"
                        : selectedHealth.state === "degraded"
                          ? "~"
                          : selectedHealth.state === "unknown"
                            ? "?"
                            : "+"}
                    </span>
                    <div>
                      <strong>Simulated health: {selectedHealth.state}</strong>
                      <small>
                        {selectedHealth.reason}
                        {selectedHealth.state !== "unknown"
                          ? ` / ${selectedHealth.latencyMs === null ? "timeout" : `${selectedHealth.latencyMs} ms`} / checked ${Math.floor(activity.time - selectedHealth.checkedAt)}s ago`
                          : ""}
                      </small>
                    </div>
                  </div>
                  <div className="gravity-metrics">
                    {(["memory", "disk"] as const).map((metric) => (
                      <div key={metric}>
                        <label>
                          {metric === "memory" ? "Memory" : "Disk"}
                          <b>
                            {host[metric]}
                            <small>%</small>
                          </b>
                        </label>
                        <div className="gravity-meter">
                          <i style={{ width: `${host[metric]}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="gravity-load">
                      <span>1-minute load</span>
                      <b>{host.load.toFixed(1)}</b>
                    </div>
                  </div>
                </>
              )}
              <button
                className="gravity-primary gravity-focus-button"
                disabled={!selectedWell || !!error}
                aria-pressed={focus}
                onClick={() => {
                  setFocus(!focus);
                  setCameraMode("manual");
                }}
              >
                <Icon name="focus" />
                {focus ? "Return to overview" : "Open focus lens"}
                <Icon name="arrow" />
              </button>
              {host && (
                <section className="gravity-services">
                  <div className="gravity-section-heading">
                    <h3>Service satellites</h3>
                    <span>
                      {host.services.length.toString().padStart(2, "0")}
                    </span>
                  </div>
                  {host.services.map((service, index) => (
                    <button
                      key={service}
                      onClick={() => {
                        selectResource(`${host.id}/${service}`);
                        setFocus(false);
                      }}
                    >
                      <span className="gravity-service-index">
                        0{index + 1}
                      </span>
                      <span>{service}</span>
                      <span
                        className="gravity-service-state"
                        data-health={
                          resourceHealth(activity, `${host.id}/${service}`)
                            .state
                        }
                      >
                        {resourceHealth(
                          activity,
                          `${host.id}/${service}`,
                        ).state.replace(/^./, (letter) => letter.toUpperCase())}
                      </span>
                      <Icon name="arrow" />
                    </button>
                  ))}
                </section>
              )}
              {!host && selectedWell && (
                <p className="gravity-help">
                  This basin groups{" "}
                  {
                    hosts.filter(
                      (h) =>
                        (mode === "custom"
                          ? (assignments[h.id] ?? h.sector)
                          : h.sector) === selectedWell.sector,
                    ).length
                  }{" "}
                  hosts. Choose a host below to inspect its service satellites.
                </p>
              )}
              <section className="gravity-inventory">
                <div className="gravity-section-heading">
                  <h3>All hosts</h3>
                  <span>{hosts.length.toString().padStart(2, "0")}</span>
                </div>
                <div>
                  {hosts.map((resource) => (
                    <button
                      key={resource.id}
                      aria-label={`Inspect ${resource.name}`}
                      aria-pressed={host?.id === resource.id}
                      onClick={() => selectResource(resource.id)}
                    >
                      <span
                        className={
                          ["degraded", "unhealthy"].includes(
                            resourceHealth(activity, resource.id).state,
                          )
                            ? "gravity-warning"
                            : "gravity-reporting"
                        }
                      >
                        {["degraded", "unhealthy"].includes(
                          resourceHealth(activity, resource.id).state,
                        )
                          ? "!"
                          : resourceHealth(activity, resource.id).state ===
                              "unknown"
                            ? "?"
                            : "+"}
                      </span>
                      {resource.name}
                    </button>
                  ))}
                </div>
              </section>
              <ActivityPanel
                snapshot={activity}
                controls={activityControls}
                visible={sceneVisible}
                motion={motion}
                disabled={!!error}
                change={(patch) =>
                  setActivityControls((previous) => ({ ...previous, ...patch }))
                }
                step={() => renderer.current?.stepActivity()}
                reset={() => renderer.current?.resetActivity()}
                dispatch={sendEvent}
                trace={(id, destination) => {
                  setActivityControls((previous) => ({
                    ...previous,
                    trace: id,
                  }));
                  selectResource(destination);
                }}
              />
              <section className="gravity-events">
                <div className="gravity-section-heading">
                  <h3>Study events</h3>
                </div>
                <ol aria-live="polite">
                  {events.map((event, index) => (
                    <li key={`${event}-${index}`}>
                      <span>{index === 0 ? "NOW" : `0${index}`}</span>
                      {event}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </aside>
      </div>
      <footer className="gravity-footer">
        <span className="gravity-study-label">
          <i />
          RENDERING STUDY <span>/</span> Synthetic data
        </span>
        <span
          className="gravity-performance"
          title="Sampled animation cadence, not GPU timing. Pause the simulation and disable Ambient field for on-demand rendering in a composed view."
        >
          {stats.fps
            ? `${stats.frameMs} ms frame interval`
            : "On-demand rendering"}{" "}
          <span>/</span> {stats.calls} draw calls
        </span>
        <button
          aria-pressed={!motion}
          onClick={() => {
            setMotion(!motion);
          }}
        >
          <Icon name={motion ? "pause" : "play"} />
          {motion ? "Pause motion" : "Resume motion"}
        </button>
        <button
          onClick={() => {
            setTheme(theme === "porcelain" ? "midnight" : "porcelain");
          }}
        >
          {theme === "porcelain" ? "Midnight" : "Porcelain"}
        </button>
      </footer>
    </main>
  );
}
