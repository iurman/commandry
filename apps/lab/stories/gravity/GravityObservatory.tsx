import { useEffect, useMemo, useRef, useState } from "react";
import {
  arrivalHost,
  fixtureHosts,
  initialPalette,
  projectWells,
  sectors,
} from "./model";
import type { Palette, SectorId, SurfaceTheme, ViewMode } from "./model";
import { ObservatoryRenderer } from "./renderer";
import type { Anchor, RenderStats } from "./renderer";
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

export function GravityObservatory() {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ObservatoryRenderer | null>(null);
  const [mode, setMode] = useState<ViewMode>("hosts");
  const [theme, setTheme] = useState<SurfaceTheme>("porcelain");
  const [palette, setPalette] = useState<Palette>(initialPalette);
  const [assignments, setAssignments] = useState(defaults);
  const [hosts, setHosts] = useState(fixtureHosts);
  const [selected, setSelected] = useState<string | null>("electra");
  const [focus, setFocus] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const [motion, setMotion] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState("");
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [events, setEvents] = useState([
    "Study ready. Select a well to explore.",
  ]);
  const [saved, setSaved] = useState(false);
  const wells = useMemo(
    () => projectWells(hosts, mode, assignments),
    [hosts, mode, assignments],
  );
  const settings = useMemo(
    () => ({ theme, palette, motion, orbit, selected, focus }),
    [theme, palette, motion, orbit, selected, focus],
  );
  const callbacks = useRef({
    select: (id: string) => setSelected(id),
    interrupted: () => setOrbit(false),
  });

  useEffect(() => {
    if (!container.current) return;
    let instance: ObservatoryRenderer;
    try {
      instance = new ObservatoryRenderer(container.current, settings, {
        anchors: setAnchors,
        stats: setStats,
        select: (id) => callbacks.current.select(id),
        interrupted: () => callbacks.current.interrupted(),
        unavailable: setError,
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
        setOrbit(false);
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
  const addEvent = (message: string) =>
    setEvents((previous) => [message, ...previous].slice(0, 5));

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
    addEvent(`Simulated job delivered to ${destination.name}.`);
  }
  function saveView() {
    try {
      window.localStorage.setItem(
        "commandry.gravity-study.v1",
        JSON.stringify({ mode, theme, palette, assignments }),
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
      };
      if (
        !["hosts", "projects", "custom"].includes(data.mode) ||
        !["porcelain", "midnight"].includes(data.theme)
      )
        throw new Error("Invalid view");
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
      style={
        {
          "--gravity-commandry": palette.commandry,
          "--gravity-work": palette.work,
          "--gravity-home": palette.home,
          "--gravity-warning": palette.attention,
          "--gravity-reporting": palette.reporting,
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
            <b>01</b> needs attention
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
              Depth: structural <span className="gravity-divider">/</span>{" "}
              {mode === "hosts"
                ? "Host wells + service satellites"
                : "Sector basins + nested hosts"}
            </span>
          </div>
          <div ref={container} className="gravity-canvas" />
          <div className="gravity-anchors" aria-hidden={!!error}>
            {anchors
              .filter(
                (anchor) =>
                  anchor.visible && (anchor.kind !== "project" || !focus),
              )
              .map((anchor) =>
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
                    className={`gravity-anchor gravity-anchor-${anchor.kind} ${anchor.attention ? "is-attention" : ""} ${selected === anchor.id ? "is-selected" : ""} ${focus && !anchor.id.startsWith("lens-") ? "is-background" : ""}`}
                    style={{ left: anchor.x, top: anchor.y }}
                    onClick={() => setSelected(anchor.id.replace("lens-", ""))}
                    aria-label={`Select ${anchor.label}`}
                  >
                    <span>{anchor.label}</span>
                    {anchor.kind === "host" && (
                      <small>
                        {anchor.attention
                          ? "! Needs attention"
                          : "Source reporting"}
                      </small>
                    )}
                  </button>
                ),
              )}
          </div>
          {focus && selectedWell && !error && (
            <div className="gravity-lens-frame">
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
            <button
              aria-label="Overview"
              onClick={() => {
                setOrbit(false);
                renderer.current?.preset("overview");
              }}
            >
              <Icon name="focus" />
              <span>Overview</span>
            </button>
            <button
              aria-label="Top"
              onClick={() => {
                setOrbit(false);
                renderer.current?.preset("top");
              }}
            >
              <Icon name="top" />
              <span>Top</span>
            </button>
            <button
              aria-label="Angle"
              onClick={() => {
                setOrbit(false);
                renderer.current?.preset("angle");
              }}
            >
              <Icon name="orbit" />
              <span>Angle</span>
            </button>
            <button
              aria-label="Auto orbit"
              aria-pressed={orbit}
              disabled={!motion}
              onClick={() => setOrbit(!orbit)}
            >
              <Icon name="orbit" />
              <span>Auto orbit</span>
            </button>
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
                {(["reporting", "attention"] as const).map((state) => (
                  <label className="gravity-color-row" key={state}>
                    <span>
                      {state === "reporting"
                        ? "Source reporting"
                        : "Needs attention"}
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
                ))}
                <p className="gravity-help">
                  Rim patterns and labels preserve meaning alongside color.
                  Service health is unknown.
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
                <>
                  <div
                    className={`gravity-health ${host.attention ? "is-attention" : ""}`}
                  >
                    <span>{host.attention ? "!" : "+"}</span>
                    <div>
                      <strong>
                        {host.attention
                          ? "Memory needs attention"
                          : "Source is reporting"}
                      </strong>
                      <small>
                        {host.attention
                          ? "Synthetic threshold: above 80%"
                          : "Availability remains unknown"}
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
                onClick={() => setFocus(!focus)}
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
                        setSelected(`${host.id}/${service}`);
                        setFocus(false);
                      }}
                    >
                      <span className="gravity-service-index">
                        0{index + 1}
                      </span>
                      <span>{service}</span>
                      <span className="gravity-service-state">Unknown</span>
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
                      onClick={() => setSelected(resource.id)}
                    >
                      <span
                        className={
                          resource.attention
                            ? "gravity-warning"
                            : "gravity-reporting"
                        }
                      >
                        {resource.attention ? "!" : "+"}
                      </span>
                      {resource.name}
                    </button>
                  ))}
                </div>
              </section>
              <section className="gravity-events">
                <div className="gravity-section-heading">
                  <h3>Study events</h3>
                  <button onClick={sendEvent} disabled={!motion || !!error}>
                    Send event <Icon name="arrow" />
                  </button>
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
          title="Frame intervals measured while drawing; idle frames are not rendered."
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
            if (motion) setOrbit(false);
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
