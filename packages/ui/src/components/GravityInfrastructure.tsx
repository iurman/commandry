"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InfrastructureOverview } from "@commandry/contracts";
import type {
  Anchor,
  ObservatoryRenderer,
  RendererSettings,
} from "../gravity/renderer";
import {
  gravityDefaults,
  InfrastructureLayout,
  readGravityPreferences,
  RecordedInfrastructureActivity,
} from "../gravity/infrastructure";
import type { GravityPreferences } from "../gravity/infrastructure";
import type { CameraMode } from "../gravity/model";
import { infrastructureTelemetryLabels } from "./InfrastructureMap";
import "../gravity/infrastructure.css";

const storageKey = "commandry.infrastructure.gravity.v1";
export default function GravityInfrastructure({
  snapshot,
  selectedId,
  onSelect,
  onProject,
  paused = false,
  delayed = false,
  compact = false,
  dark = false,
}: {
  snapshot: InfrastructureOverview;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProject: (id: string) => void;
  paused?: boolean;
  delayed?: boolean;
  compact?: boolean;
  dark?: boolean;
}) {
  const [preferences, setPreferences] =
    useState<GravityPreferences>(gravityDefaults);
  const [loaded, setLoaded] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [systemDark, setSystemDark] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [camera, setCamera] = useState<CameraMode>("composed");
  const [focus, setFocus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const lensFrame = useRef<HTMLDivElement>(null);
  const [layout] = useState(() => new InfrastructureLayout());
  const [activity] = useState(() => new RecordedInfrastructureActivity());
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ObservatoryRenderer | null>(null);
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const latestAnchors = useRef(new Map<string, Anchor>());
  const callbacks = useRef({ onSelect });
  useEffect(() => {
    callbacks.current = { onSelect };
  }, [onSelect]);
  const motion = !reduced && !motionPaused;
  const theme =
    preferences.theme === "system"
      ? systemDark || dark
        ? "midnight"
        : "porcelain"
      : preferences.theme;
  const projection = useMemo(
    () => layout.project(snapshot.items, preferences, portrait),
    [snapshot.items, preferences, portrait, layout],
  );
  const settings = useMemo<RendererSettings>(
    () => ({
      theme,
      palette: projection.palette,
      motion,
      cameraMode: camera,
      ambient: preferences.ambient,
      selected: selectedId,
      focus,
      activity: {
        source: activity,
        running: !paused && !delayed,
        follow: false,
        trace: null,
      },
    }),
    [
      theme,
      projection.palette,
      motion,
      camera,
      preferences.ambient,
      selectedId,
      focus,
      activity,
      paused,
      delayed,
    ],
  );
  const current = useRef({ wells: projection.wells, settings });
  useEffect(() => {
    current.current = { wells: projection.wells, settings };
  }, [projection.wells, settings]);
  useEffect(() => {
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let active = true;
    const media = () => {
      setSystemDark(dark.matches);
      setReduced(reduce.matches);
    };
    dark.addEventListener("change", media);
    reduce.addEventListener("change", media);
    void Promise.resolve().then(() => {
      if (!active) return;
      media();
      try {
        const saved = readGravityPreferences(localStorage.getItem(storageKey));
        setPreferences(saved);
        setCamera(reduce.matches ? "composed" : saved.camera);
      } catch {
        /* Presentation still works without storage. */
      }
      setLoaded(true);
    });
    return () => {
      active = false;
      dark.removeEventListener("change", media);
      reduce.removeEventListener("change", media);
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, ...preferences }),
      );
    } catch {
      /* This visit retains the chosen presentation. */
    }
  }, [preferences, loaded]);
  useEffect(() => {
    activity.synchronize(snapshot, motion && !paused && !delayed);
    renderer.current?.refreshActivity();
  }, [activity, snapshot, motion, paused, delayed]);
  useEffect(() => {
    if (!container.current || !loaded) return;
    let disposed = false;
    let instance: ObservatoryRenderer | null = null;
    void import("../gravity/renderer")
      .then(({ ObservatoryRenderer }) => {
        if (disposed || !container.current) return;
        try {
          instance = new ObservatoryRenderer(
            container.current,
            current.current.settings,
            {
              anchors(next) {
                latestAnchors.current = new Map(
                  next.map((anchor) => [anchor.id, anchor]),
                );
                for (const anchor of next) {
                  const element = elements.current.get(anchor.id);
                  if (element) place(element, anchor);
                }
                setAnchors((previous) =>
                  previous.length === next.length &&
                  previous.every(
                    (anchor, index) =>
                      anchor.id === next[index]?.id &&
                      anchor.label === next[index]?.label,
                  )
                    ? previous
                    : next,
                );
              },
              stats() {},
              select(id) {
                if (id.startsWith("sector:")) return;
                callbacks.current.onSelect(id);
              },
              interrupted() {
                setCamera("manual");
              },
              unavailable(message) {
                setError(message);
              },
              viewport: setPortrait,
              lens(amount) {
                const frame = lensFrame.current;
                if (!frame || !container.current) return;
                frame.style.opacity = String(amount);
                frame.style.transform = `translate(-50%, -50%) scale(${amount})`;
                frame.style.width = `${Math.min(container.current.clientHeight * 0.72, container.current.clientWidth * 0.62)}px`;
              },
              activity() {},
              visibility(visible) {
                activity.setVisible(visible);
              },
            },
          );
          renderer.current = instance;
          instance.update(current.current.wells, current.current.settings);
          setReady(true);
        } catch {
          instance?.dispose();
          renderer.current = null;
          setError(
            "The 3D renderer is unavailable on this device. Select resources below, or use Topology or List.",
          );
        }
      })
      .catch(() => {
        if (!disposed)
          setError(
            "The 3D renderer could not load. Use Topology or List, or reload to retry.",
          );
      });
    return () => {
      disposed = true;
      instance?.dispose();
      renderer.current = null;
    };
  }, [loaded, activity]);
  useEffect(() => {
    try {
      renderer.current?.update(projection.wells, settings);
    } catch {
      void Promise.resolve().then(() =>
        setError(
          "The scene could not display this snapshot. All resource selections and the List view remain available.",
        ),
      );
      renderer.current?.dispose();
      renderer.current = null;
    }
  }, [projection.wells, settings]);
  function change(patch: Partial<GravityPreferences>) {
    setPreferences((previous) => ({ ...previous, ...patch }));
  }
  function choose(id: string) {
    setCamera("composed");
    onSelect(id);
  }
  const selected = snapshot.items.find((item) => item.id === selectedId);
  const selectedGroup = projection.wells.find(
    (well) => well.id === selectedId,
  )?.sector;
  return (
    <div className="cmd-gravity" data-theme={theme}>
      <div className="cmd-gravity-controls">
        <label>
          Arrange by
          <select
            aria-label="Gravity grouping"
            value={preferences.grouping}
            onChange={(event) =>
              change({
                grouping: event.target.value as GravityPreferences["grouping"],
              })
            }
          >
            <option value="hosts">Hosts and nested resources</option>
            <option value="projects">Projects</option>
            <option value="custom">Custom sectors</option>
          </select>
        </label>
        <label>
          Well size
          <select
            aria-label="Gravity well size"
            value={preferences.size}
            onChange={(event) =>
              change({ size: event.target.value as GravityPreferences["size"] })
            }
          >
            <option value="children">Child resource count</option>
            <option value="uniform">Uniform</option>
          </select>
        </label>
        <label>
          Camera
          <select
            aria-label="Gravity camera"
            value={camera}
            onChange={(event) => {
              const next = event.target.value as GravityPreferences["camera"];
              setCamera(next);
              change({ camera: next });
              setFocus(false);
            }}
          >
            <option value="composed">Composed overview</option>
            <option value="orbit" disabled={!motion}>
              Slow orbit
            </option>
            <option value="tour" disabled={!motion}>
              Guided tour
            </option>
            {camera === "manual" && (
              <option value="manual">Manual orbit</option>
            )}
          </select>
        </label>
        <button
          type="button"
          aria-pressed={focus}
          disabled={!ready || !!error || !selectedId}
          onClick={() => {
            setFocus((value) => !value);
            setCamera("composed");
          }}
        >
          {focus ? "Close focus lens" : "Open focus lens"}
        </button>
        <button
          type="button"
          aria-pressed={motionPaused}
          onClick={() => setMotionPaused((value) => !value)}
        >
          {motionPaused ? "Resume scene motion" : "Pause scene motion"}
        </button>
        <details className="cmd-gravity-settings">
          <summary>Appearance</summary>
          <div>
            <label>
              Surface
              <select
                aria-label="Gravity surface"
                value={preferences.theme}
                onChange={(event) =>
                  change({
                    theme: event.target.value as GravityPreferences["theme"],
                  })
                }
              >
                <option value="system">System theme</option>
                <option value="porcelain">Porcelain</option>
                <option value="midnight">Midnight</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.ambient}
                onChange={(event) => change({ ambient: event.target.checked })}
              />{" "}
              Ambient field
            </label>
            {(
              [
                ["reporting", "Observation pulse"],
                ["attention", "Source needs attention"],
              ] as const
            ).map(([id, label]) => (
              <label key={id}>
                {label}
                <input
                  type="color"
                  aria-label={label}
                  value={projection.palette[id]}
                  onChange={(event) =>
                    change({
                      colors: {
                        ...preferences.colors,
                        [id]: event.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            {selectedGroup && (
              <label>
                Selected sector color
                <input
                  type="color"
                  aria-label="Selected sector color"
                  value={projection.palette[selectedGroup]}
                  onChange={(event) =>
                    change({
                      colors: {
                        ...preferences.colors,
                        [selectedGroup]: event.target.value,
                      },
                    })
                  }
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                setPreferences(gravityDefaults);
                setCamera("composed");
                setMotionPaused(false);
                setFocus(false);
              }}
            >
              Reset appearance
            </button>
          </div>
        </details>
      </div>
      <p className="cmd-gravity-note">
        {snapshot.items.length} resources in this scene.{" "}
        {preferences.grouping === "projects"
          ? "Resources with multiple projects use their first project for layout; the inspector shows every membership. "
          : ""}
        Colors identify layout sectors. Source freshness is separate from
        service health.
      </p>
      <div
        className="cmd-gravity-stage"
        aria-label="Gravity infrastructure landscape"
      >
        <div className="cmd-gravity-caption" data-gravity-label-inset>
          <span>
            {paused
              ? "Updates paused"
              : delayed
                ? "Delayed snapshot"
                : "Recorded infrastructure"}
          </span>
          <strong>{selected?.name ?? "Select a resource"}</strong>
          <span>
            {selected
              ? `${infrastructureTelemetryLabels[selected.telemetry]} / Service health: unknown`
              : "Real resources and source observations"}
          </span>
        </div>
        <div className="cmd-gravity-canvas" ref={container} />
        <div className="cmd-gravity-anchors" aria-hidden={!!error}>
          {anchors.map((anchor) => (
            <button
              key={anchor.id}
              type="button"
              className={`cmd-gravity-anchor ${anchor.kind === "project" ? "cmd-gravity-sector" : ""}`}
              ref={(element) => {
                if (!element) {
                  elements.current.delete(anchor.id);
                  return;
                }
                elements.current.set(anchor.id, element);
                place(element, latestAnchors.current.get(anchor.id) ?? anchor);
                renderer.current?.measureAnchor(
                  anchor.id,
                  element.offsetWidth,
                  element.offsetHeight,
                );
              }}
              aria-label={
                anchor.kind === "project"
                  ? `Focus project sector ${anchor.label}`
                  : `Inspect ${anchor.label}`
              }
              onClick={() => {
                if (anchor.kind === "project") {
                  const groupId = anchor.id.slice("sector:".length);
                  if (!groupId.startsWith("custom:") && groupId !== "unlinked")
                    onProject(groupId);
                } else choose(anchor.id.replace(/^lens-/, ""));
              }}
            >
              <strong>{anchor.label}</strong>
              {anchor.kind !== "project" && (
                <small>
                  {
                    infrastructureTelemetryLabels[
                      snapshot.items.find(
                        (item) => item.id === anchor.id.replace(/^lens-/, ""),
                      )?.telemetry ?? "unknown"
                    ]
                  }
                </small>
              )}
            </button>
          ))}
        </div>
        {!error && (
          <div ref={lensFrame} className="cmd-gravity-lens" aria-hidden="true">
            <span>{selected?.name}</span>
          </div>
        )}
        {!ready && !error && (
          <p className="cmd-gravity-loading" role="status">
            Loading Gravity renderer...
          </p>
        )}
        {error && (
          <p className="cmd-gravity-loading" role="status">
            {error}
          </p>
        )}
        <div className="cmd-gravity-legend">
          <span>Observation pulses mark newly received events.</span>
          <span>Relationships alone never imply traffic.</span>
        </div>
      </div>
      <details className="cmd-gravity-resource-picker" open={!compact}>
        <summary>Resources in this scene ({snapshot.items.length})</summary>
        <div
          className="cmd-gravity-resource-buttons"
          role="group"
          aria-label="Select a Gravity resource"
        >
          {snapshot.items.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-label={`Select ${item.name}, ${item.kind}, ${infrastructureTelemetryLabels[item.telemetry]}`}
              aria-pressed={selectedId === item.id}
              onClick={() => choose(item.id)}
            >
              {item.name}
              <small>
                {item.kind} / {infrastructureTelemetryLabels[item.telemetry]}
              </small>
            </button>
          ))}
        </div>
      </details>
      {preferences.grouping === "custom" && selected && (
        <label className="cmd-gravity-custom">
          Layout sector for {selected.name}
          <input
            aria-label="Custom layout sector"
            maxLength={60}
            value={preferences.assignments[selected.id] ?? ""}
            placeholder="Use project sector"
            onChange={(event) =>
              change({
                assignments: {
                  ...preferences.assignments,
                  [selected.id]: event.target.value,
                },
              })
            }
          />
          <small>
            Saved on this device. Project membership and containment stay in the
            inventory.
          </small>
        </label>
      )}
    </div>
  );
}
function place(element: HTMLButtonElement, anchor: Anchor) {
  element.style.transform = `translate3d(${anchor.x}px,${anchor.y}px,0) translate(-50%,-100%)`;
  element.style.opacity = String(anchor.opacity);
  element.style.visibility = anchor.opacity < 0.002 ? "hidden" : "visible";
  element.tabIndex = anchor.opacity < 0.002 ? -1 : 0;
}
