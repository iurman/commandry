import { useId, type CSSProperties } from "react";

export interface InfrastructureMapResource {
  id: string;
  name: string;
  kind: string;
  telemetry: string;
  projects: { id: string; name: string }[];
}
export interface InfrastructureMapEdge {
  id: string;
  from: string;
  to: string;
  type: "contains" | "depends_on";
}
export const infrastructureTelemetryLabels: Record<string, string> = {
  reporting: "Reporting",
  stale: "Stale source",
  unknown: "No observation",
  disabled: "Source disabled",
  future: "Clock ahead",
  error: "Source error",
};

function ResourceIcon({ kind }: { kind: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {isInfrastructureHost(kind) ? (
        <>
          <rect x="4" y="3" width="16" height="7" rx="2" />
          <rect x="4" y="14" width="16" height="7" rx="2" />
          <path d="M7 6h1m3 0h6M7 17h1m3 0h6" />
        </>
      ) : (
        <>
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <path d="M9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4" />
        </>
      )}
    </svg>
  );
}
export function isInfrastructureHost(kind: string) {
  return [
    "host",
    "server",
    "physical-server",
    "virtual-machine",
    "hypervisor",
    "cluster",
    "vm",
    "lxc",
    "docker-host",
  ].includes(kind);
}

// The viewport is deliberately paged. Nodes keep their positions when telemetry
// changes; only a scope/page change alters the deterministic alphabetical layout.
export function InfrastructureMap({
  resources,
  edges,
  selectedId,
  onSelect,
  onProject,
  compact = false,
  arrivingResourceIds = [],
}: {
  arrivingResourceIds?: string[];
  compact?: boolean;
  resources: InfrastructureMapResource[];
  edges: InfrastructureMapEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProject: (id: string) => void;
}) {
  const marker = useId().replaceAll(":", "");
  const projects = [
    ...new Map(
      resources.flatMap((item) => item.projects).map((item) => [item.id, item]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const ordered = [...resources].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const columns = [
    projects,
    ordered.filter((item) => isInfrastructureHost(item.kind)),
    ordered.filter((item) => !isInfrastructureHost(item.kind)),
  ];
  const rowHeight = compact ? 84 : 112;
  const height = Math.max(
    400,
    ...columns.map((items) => items.length * rowHeight + (compact ? 54 : 66)),
  );
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((items, column) =>
    items.forEach((item, index) =>
      positions.set(item.id, {
        x: 30 + column * 310,
        y: (compact ? 54 : 66) + index * rowHeight,
      }),
    ),
  );
  const routes = [
    ...resources.flatMap((item) =>
      item.projects.map((project) => ({
        id: `${project.id}:${item.id}`,
        from: project.id,
        to: item.id,
        type: "project",
      })),
    ),
    ...edges,
  ];
  const outside = edges.filter(
    (edge) => !positions.has(edge.from) || !positions.has(edge.to),
  ).length;
  return (
    <div className="cmd-network-map-wrap">
      <div
        className="cmd-network-map-scroll"
        role="region"
        aria-label="Infrastructure relationship map, scroll to explore"
        tabIndex={0}
      >
        <div
          className="cmd-network-map"
          style={{ height, "--cmd-map-height": `${height}px` } as CSSProperties}
        >
          <div className="cmd-network-lanes" aria-hidden="true">
            <span>01 / Projects</span>
            <span>02 / Hosts and compute</span>
            <span>03 / Services and resources</span>
          </div>
          <svg
            viewBox={`0 0 930 ${height}`}
            className="cmd-network-edges"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={marker}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0 0 L7 3.5 L0 7" fill="currentColor" />
              </marker>
            </defs>
            {routes.map((edge) => {
              const from = positions.get(edge.from),
                to = positions.get(edge.to);
              if (!from || !to) return null;
              const sameLane = from.x === to.x;
              const startX = sameLane
                ? from.x + 260
                : from.x + (from.x < to.x ? 260 : 0);
              const endX = sameLane
                ? to.x + 260
                : to.x + (from.x < to.x ? 0 : 260);
              const control = sameLane ? startX + 32 : (startX + endX) / 2;
              return (
                <path
                  key={edge.id}
                  d={`M${startX} ${from.y + 43} C${control} ${from.y + 43},${control} ${to.y + 43},${endX} ${to.y + 43}`}
                  className={`cmd-network-edge cmd-network-edge-${edge.type}`}
                  data-selected={
                    edge.from === selectedId || edge.to === selectedId
                  }
                  markerEnd={
                    edge.type === "depends_on" ? `url(#${marker})` : undefined
                  }
                />
              );
            })}
          </svg>
          {projects.map((project) => {
            const position = positions.get(project.id)!;
            return (
              <button
                key={project.id}
                className="cmd-network-node cmd-network-project"
                style={{ left: `${position.x / 9.3}%`, top: position.y }}
                onClick={() => onProject(project.id)}
                type="button"
                aria-label={`Focus project ${project.name}`}
              >
                <span className="cmd-network-node-kind">Project</span>
                <strong>{project.name}</strong>
                <span>
                  {
                    resources.filter((item) =>
                      item.projects.some((linked) => linked.id === project.id),
                    ).length
                  }{" "}
                  resources in view
                </span>
              </button>
            );
          })}
          {!projects.length && (
            <p className="cmd-network-unlinked">
              No project links in this view.
              <br />
              Resources remain inspectable.
            </p>
          )}
          {ordered.map((item) => {
            const position = positions.get(item.id)!;
            return (
              <button
                key={item.id}
                className="cmd-network-node"
                style={{ left: `${position.x / 9.3}%`, top: position.y }}
                data-arriving={arrivingResourceIds.includes(item.id)}
                data-telemetry={item.telemetry}
                aria-pressed={selectedId === item.id}
                aria-label={`Inspect ${item.name}, ${infrastructureTelemetryLabels[item.telemetry] ?? item.telemetry}`}
                onClick={() => onSelect(item.id)}
                type="button"
              >
                <span className="cmd-network-node-top">
                  <ResourceIcon kind={item.kind} />
                  <span className="cmd-network-node-kind">
                    {item.kind.replaceAll("-", " ")}
                  </span>
                </span>
                <strong title={item.name}>{item.name}</strong>
                <span className="cmd-network-status">
                  {infrastructureTelemetryLabels[item.telemetry] ??
                    item.telemetry}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="cmd-network-legend">
        <span>Solid: contains</span>
        <span>Dashed arrow: depends on</span>
        <span>Dotted: project context</span>
        {outside > 0 && (
          <span>
            {outside} relationships continue outside this page. Inspect a
            resource for details.
          </span>
        )}
      </p>
    </div>
  );
}
