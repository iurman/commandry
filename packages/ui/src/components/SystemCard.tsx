export interface SystemCardView {
  id: string;
  name: string;
  summary: string | null;
  lifecycle: "active" | "archived";
  version: number;
  domain?: { id: string; name: string } | null | undefined;
}

export function SystemCard({ system }: { system: SystemCardView }) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Operated context / Local system</p>
          <h3>
            <a href={`/systems/${system.id}`}>{system.name}</a>
          </h3>
        </div>
        <span className="cmd-count">{system.lifecycle}</span>
      </div>
      <p>{system.summary || "No system summary recorded."}</p>
      <p className="cmd-record-identity">
        {system.domain
          ? `Domain: ${system.domain.name}. `
          : "No owning domain. "}
        Record v{system.version}. Operational health is unknown until observed.
      </p>
    </article>
  );
}
