type Field = "name" | "summary" | "type" | "lifecycle";

export type ProjectChangeCardEvent = {
  id: string;
  version: number;
  actor: string;
  createdAt: string;
  changedFields: Field[];
  previous: Record<Field, string | null>;
  current: Record<Field, string | null>;
};

function label(field: Field) {
  return field.charAt(0).toUpperCase() + field.slice(1);
}

export function ProjectChangeCard({
  event,
  href,
}: {
  event: ProjectChangeCardEvent;
  href: string;
}) {
  return (
    <article className="cmd-project-change-card">
      <div className="cmd-project-change-heading">
        <strong>Version {event.version}</strong>
        <time dateTime={event.createdAt}>{event.createdAt}</time>
      </div>
      <p>
        Changed {event.changedFields.map(label).join(", ")} by {event.actor}.
      </p>
      <details>
        <summary>Review exact changes</summary>
        <dl>
          {event.changedFields.map((field) => (
            <div key={field}>
              <dt>{label(field)}</dt>
              <dd>
                <span>Before: {event.previous[field] || "Empty"}</span>
                <span>After: {event.current[field] || "Empty"}</span>
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <a href={href}>Exact audit record</a>
    </article>
  );
}
