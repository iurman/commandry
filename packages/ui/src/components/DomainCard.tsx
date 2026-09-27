export interface DomainCardView {
  id: string;
  name: string;
  description: string | null;
  lifecycle: "active" | "archived";
  version: number;
}

export function DomainCard({ domain }: { domain: DomainCardView }) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Portfolio / Local domain</p>
          <h3>
            <a href={`/domains/${domain.id}`}>{domain.name}</a>
          </h3>
        </div>
        <span className="cmd-count">{domain.lifecycle}</span>
      </div>
      <p>{domain.description || "No description recorded."}</p>
      <p className="cmd-record-identity">
        Domain record v{domain.version}. Project membership is a separate typed
        relationship.
      </p>
    </article>
  );
}
