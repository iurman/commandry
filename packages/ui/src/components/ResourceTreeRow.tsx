import { StatusBadge } from "./StatusBadge";

export interface ResourceTreeRowView {
  id: string;
  kind: string;
  name: string;
  state: string | null;
  lastObservedAt: string | null;
}

export function ResourceTreeRow({
  resource,
  expanded,
  onToggle,
}: {
  resource: ResourceTreeRowView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const observed = Boolean(resource.lastObservedAt);
  return (
    <div className="cmd-resource-tree-row">
      <button
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} children of ${resource.name}`}
        className="cmd-resource-tree-toggle"
        onClick={onToggle}
        type="button"
      >
        {expanded ? "−" : "+"}
      </button>
      <div className="cmd-resource-tree-identity">
        <a href={`/resources/${encodeURIComponent(resource.id)}`}>
          {resource.name}
        </a>
        <span>{resource.kind}</span>
      </div>
      <StatusBadge
        dimension="health"
        label={observed ? (resource.state ?? "Unknown") : "Unknown"}
        tone="neutral"
      />
    </div>
  );
}
