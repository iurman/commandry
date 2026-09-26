export interface BriefEvidenceLink {
  kind: string;
  id: string;
  href: string;
  recordedAt: string;
  occurredAt: string | null;
  sourceLabel: string;
  isSynthetic: boolean;
}

export interface BriefFactView {
  id: string;
  kind: string;
  title: string;
  detail: string;
  evidence: BriefEvidenceLink[];
  sourceLabel: string;
  isSynthetic: boolean;
}

export interface BriefSectionView {
  items: BriefFactView[];
  nextCursor: string | null;
  fullListHref: string;
  emptyState: string | null;
}

export interface ProjectBriefView {
  project: { id: string; name: string; summary: string | null };
  generatedAt: string;
  asOf: string;
  method: string;
  state: { text: string; evidence: BriefEvidenceLink[] };
  sections: {
    work: BriefSectionView;
    knowledge: BriefSectionView;
    resources: BriefSectionView;
    activity: BriefSectionView;
    attention: BriefSectionView;
  };
  missing: {
    decisions: { status: "not_recorded"; message: string };
    questions: { status: "not_recorded"; message: string };
    blockers: { status: "not_recorded"; message: string };
    acceptanceCriteria: { status: "not_recorded"; message: string };
  };
  nextActions: {
    items: {
      kind: "inference";
      ruleId: string;
      text: string;
      evidence: BriefEvidenceLink[];
    }[];
    scope: "preview_only";
    explanation: string;
  };
}

export interface ProjectBriefProps {
  brief: ProjectBriefView;
  sectionHrefs: Record<keyof ProjectBriefView["sections"], string>;
}

function EvidenceLinks({ links }: { links: BriefEvidenceLink[] }) {
  return (
    <ul className="cmd-brief-evidence" aria-label="Evidence sources">
      {links.map((source) => (
        <li key={`${source.kind}:${source.id}`}>
          <a href={source.href}>Source: {source.kind.replaceAll("_", " ")}</a>
          <span>
            {source.isSynthetic ? "Synthetic · " : ""}
            {source.sourceLabel}
          </span>
          <time dateTime={source.recordedAt}>Recorded {source.recordedAt}</time>
          {source.occurredAt && (
            <time dateTime={source.occurredAt}>
              Occurred {source.occurredAt}
            </time>
          )}
        </li>
      ))}
    </ul>
  );
}

const sectionNames = [
  ["work", "Open work", "work"],
  ["knowledge", "Knowledge", "knowledge"],
  ["resources", "Resources", "resources"],
  ["activity", "Recent change", "activity"],
  ["attention", "Attention", "attention"],
] as const;

export function ProjectBrief({ brief, sectionHrefs }: ProjectBriefProps) {
  return (
    <article className="cmd-brief" aria-labelledby="project-brief-heading">
      <header className="cmd-brief-header">
        <div>
          <p className="cmd-eyebrow">Evidence-linked / On-demand projection</p>
          <h2 id="project-brief-heading">Project brief</h2>
          <p>{brief.project.summary || "No project summary was recorded."}</p>
        </div>
        <dl className="cmd-brief-times">
          <div>
            <dt>Generated</dt>
            <dd>
              <time dateTime={brief.generatedAt}>{brief.generatedAt}</time>
            </dd>
          </div>
          <div>
            <dt>As of</dt>
            <dd>
              <time dateTime={brief.asOf}>{brief.asOf}</time>
            </dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{brief.method}</dd>
          </div>
        </dl>
      </header>

      <section
        className="cmd-brief-state"
        aria-labelledby="brief-state-heading"
      >
        <p className="cmd-eyebrow">Saved project state</p>
        <h3 id="brief-state-heading">State</h3>
        <p>{brief.state.text}</p>
        <EvidenceLinks links={brief.state.evidence} />
      </section>

      <div className="cmd-brief-grid">
        {sectionNames.map(([key, label, fullListLabel]) => {
          const section = brief.sections[key];
          return (
            <section
              className="cmd-brief-section"
              key={key}
              aria-labelledby={`brief-${key}-heading`}
            >
              <div className="cmd-section-heading">
                <h3 id={`brief-${key}-heading`}>{label}</h3>
                <span className="cmd-count">{section.items.length} shown</span>
              </div>
              {section.items.length === 0 ? (
                <p className="cmd-brief-empty">
                  {section.emptyState || `No ${label.toLowerCase()} recorded.`}
                </p>
              ) : (
                <ul className="cmd-brief-facts">
                  {section.items.map((fact) => (
                    <li key={fact.id}>
                      <div className="cmd-brief-fact-heading">
                        <strong>{fact.title}</strong>
                        <span>
                          {fact.isSynthetic ? "Synthetic · " : ""}
                          {fact.sourceLabel}
                        </span>
                      </div>
                      <p>{fact.detail}</p>
                      <EvidenceLinks links={fact.evidence} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="cmd-brief-section-links">
                <a href={sectionHrefs[key]}>View all {fullListLabel}</a>
                <a href={section.fullListHref}>Open source list</a>
                {section.nextCursor && (
                  <span>More records available in the full list.</span>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="cmd-brief-lower">
        <section
          className="cmd-brief-section"
          aria-labelledby="brief-actions-heading"
        >
          <p className="cmd-eyebrow">Rule-based preview</p>
          <h3 id="brief-actions-heading">Possible next actions</h3>
          <p>{brief.nextActions.explanation}</p>
          {brief.nextActions.items.length === 0 ? (
            <p className="cmd-brief-empty">
              No next action can be inferred from recorded open work.
            </p>
          ) : (
            <ul className="cmd-brief-facts">
              {brief.nextActions.items.map((action, index) => (
                <li key={`${action.ruleId}:${index}`}>
                  <strong>{action.text}</strong>
                  <p>
                    Inference from rule {action.ruleId}. Review the source
                    before acting.
                  </p>
                  <EvidenceLinks links={action.evidence} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          className="cmd-brief-section"
          aria-labelledby="brief-gaps-heading"
        >
          <p className="cmd-eyebrow">Explicit gaps</p>
          <h3 id="brief-gaps-heading">Not recorded</h3>
          <dl className="cmd-brief-gaps">
            <div>
              <dt>Decisions</dt>
              <dd>{brief.missing.decisions.message}</dd>
            </div>
            <div>
              <dt>Questions</dt>
              <dd>{brief.missing.questions.message}</dd>
            </div>
            <div>
              <dt>Blockers</dt>
              <dd>{brief.missing.blockers.message}</dd>
            </div>
            <div>
              <dt>Acceptance criteria</dt>
              <dd>{brief.missing.acceptanceCriteria.message}</dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  );
}
