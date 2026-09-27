export interface ResourceImpactCardView {
  resource: { id: string; name: string; kind: string };
  depth: number;
  path: Array<{ id: string; name: string }>;
  reason: string;
  projects: Array<{ id: string; name: string; resourceId: string }>;
}

export function ResourceImpactCard({
  impact,
}: {
  impact: ResourceImpactCardView;
}) {
  return (
    <article className="cmd-record-card">
      <p className="cmd-eyebrow">Potential impact / recorded dependency</p>
      <h3 className="cmd-record-title">
        <a href={`/resources/${impact.resource.id}`}>{impact.resource.name}</a>
      </h3>
      <p>{impact.reason}</p>
      <p>Recorded path, from required resource to dependent:</p>
      <ol className="cmd-impact-path">
        {impact.path.map((node) => (
          <li key={node.id}>
            <a href={`/resources/${node.id}`}>{node.name}</a>
          </li>
        ))}
      </ol>
      <p>Each later resource depends on the one before it.</p>
      {impact.projects.length > 0 ? (
        <p>
          Supporting project links:{" "}
          {impact.projects.map((project, index) => (
            <span key={project.id}>
              {index > 0 ? ", " : ""}
              <a href={`/projects/${project.id}`}>{project.name}</a>
            </span>
          ))}
          .
        </p>
      ) : (
        <p>No supporting project link is recorded for this resource.</p>
      )}
    </article>
  );
}
