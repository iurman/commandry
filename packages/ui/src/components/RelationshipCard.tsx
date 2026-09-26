import { RecordCard } from "./RecordCard";
import { StatusBadge } from "./StatusBadge";

export interface RelationshipResource {
  id: string;
  kind: string;
  name: string;
  subtype: string | null;
  state: string | null;
  externalUrl: string | null;
  lastObservedAt: string | null;
}

export interface RelationshipCardProps {
  id: string;
  type: string;
  inverseType: string;
  resource: RelationshipResource;
}

function readableType(type: string) {
  return type.replaceAll("_", " ");
}

/** Shows both directions of a typed project/resource edge and the resource's canonical ID. */
export function RelationshipCard({
  id,
  type,
  inverseType,
  resource,
}: RelationshipCardProps) {
  const observed = Boolean(resource.lastObservedAt);
  const meaning =
    type === "supports"
      ? [
          "Resource supports project",
          `Project ${readableType(inverseType)} resource`,
        ]
      : [
          "Project relates to resource",
          `Resource ${readableType(inverseType)} project`,
        ];
  return (
    <li className="cmd-relationship-card" data-relationship-id={id}>
      <div className="cmd-relation-meaning">
        <span>{meaning[0]}</span>
        <span>{meaning[1]}</span>
      </div>
      <RecordCard
        aside={
          <StatusBadge
            dimension="health"
            label={observed && resource.state ? resource.state : "Unknown"}
            tone="neutral"
          />
        }
        description={resource.subtype}
        id={resource.id}
        kind={resource.kind}
        name={resource.name}
      >
        <div className="cmd-resource-meta">
          <span>
            {observed
              ? `Last observed ${new Date(resource.lastObservedAt!).toLocaleString()}`
              : "Manual record. No operational observation."}
          </span>
          {resource.externalUrl &&
            /^https?:\/\//i.test(resource.externalUrl) && (
              <a href={resource.externalUrl} rel="noreferrer" target="_blank">
                Open source
              </a>
            )}
        </div>
      </RecordCard>
    </li>
  );
}
