import type { BriefEvidenceLink } from "./ProjectBrief";
import { knowledgeTypeLabel, type KnowledgeKind } from "./KnowledgeTypeBadge";

export interface ExecutionPacketView {
  id: string;
  schemaVersion: string;
  packetVersion: number;
  workItemId: string;
  projectId: string;
  sourceCaptureId: string;
  generatedAt: string;
  contentDigest: string;
  snapshot: {
    objective: {
      title: string;
      description: string;
      workType?: "task" | "initiative" | "subtask" | undefined;
      assignee?:
        | {
            kind: "local_user" | "agent";
            agentId: string | null;
            label: string;
            evidence: BriefEvidenceLink;
          }
        | undefined;
      status: string;
      evidence: BriefEvidenceLink[];
    };
    projectContext: {
      id: string;
      name: string;
      summary: string | null;
      type: string;
      lifecycle: string;
      evidence: BriefEvidenceLink;
    };
    selectedKnowledge: {
      id: string;
      title: string;
      kind?: KnowledgeKind | undefined;
      evidence: BriefEvidenceLink;
    }[];
    selectedResources: {
      id: string;
      linkId: string;
      linkType: string;
      evidence: BriefEvidenceLink;
    }[];
    acceptance?:
      | {
          criteria: string;
          version: number;
          evidence: BriefEvidenceLink;
          latestReview: {
            result: "met" | "not_met";
            note: string;
            documentTitle: string;
            evidence: BriefEvidenceLink[];
          } | null;
        }
      | null
      | undefined;
    missing: {
      acceptanceCriteria: {
        status: "not_recorded" | "recorded";
        message: string;
      };
      verificationExpectations: { status: "not_recorded"; message: string };
      taskConstraints: { status: "not_recorded"; message: string };
    };
    authorization: {
      capabilityGrants: string[];
      externalActions: "not_authorized";
      explanation: string;
    };
  };
}

export interface ExecutionPacketProps {
  packet: ExecutionPacketView;
}

function Source({ source }: { source: BriefEvidenceLink }) {
  return (
    <div className="cmd-packet-evidence">
      <a href={source.href}>View {source.kind.replaceAll("_", " ")} source</a>
      <span>
        {source.isSynthetic ? "Synthetic · " : ""}
        {source.sourceLabel}
      </span>
      <time dateTime={source.recordedAt}>Recorded {source.recordedAt}</time>
      {source.occurredAt && (
        <time dateTime={source.occurredAt}>Occurred {source.occurredAt}</time>
      )}
    </div>
  );
}

export function ExecutionPacket({ packet }: ExecutionPacketProps) {
  const { snapshot } = packet;
  return (
    <article className="cmd-packet" aria-labelledby="packet-heading">
      <header className="cmd-packet-header">
        <div>
          <p className="cmd-eyebrow">
            Immutable local snapshot / {packet.schemaVersion}
          </p>
          <h1 id="packet-heading">Execution packet</h1>
          <p className="cmd-lead">
            Version {packet.packetVersion} for {snapshot.objective.title}
          </p>
        </div>
        <dl className="cmd-packet-meta">
          <div>
            <dt>Generated</dt>
            <dd>
              <time dateTime={packet.generatedAt}>{packet.generatedAt}</time>
            </dd>
          </div>
          <div>
            <dt>Packet ID</dt>
            <dd>
              <code>{packet.id}</code>
            </dd>
          </div>
          <div>
            <dt>Content digest</dt>
            <dd>
              <code>{packet.contentDigest}</code>
            </dd>
          </div>
        </dl>
      </header>
      <p className="cmd-packet-notice">
        This packet records selected context at creation time. It does not
        verify the task, grant a capability, or start an agent run.
      </p>

      <div className="cmd-packet-grid">
        <section
          className="cmd-packet-section"
          aria-labelledby="packet-objective-heading"
        >
          <p className="cmd-eyebrow">Saved task</p>
          <h2 id="packet-objective-heading">Objective</h2>
          <h3>{snapshot.objective.title}</h3>
          <p className="cmd-packet-text">
            {snapshot.objective.description ||
              "No task description was recorded."}
          </p>
          <p>Saved status: {snapshot.objective.status}</p>
          {snapshot.objective.workType && (
            <p>Saved work type: {snapshot.objective.workType}</p>
          )}
          {snapshot.objective.assignee && (
            <>
              <p>Saved assignee: {snapshot.objective.assignee.label}</p>
              <Source source={snapshot.objective.assignee.evidence} />
            </>
          )}
          <a href={`/work-items/${encodeURIComponent(packet.workItemId)}`}>
            View current work item
          </a>
          <a
            href={`/inbox?captureId=${encodeURIComponent(packet.sourceCaptureId)}`}
          >
            View exact original capture
          </a>
          {snapshot.objective.evidence.map((source) => (
            <Source key={`${source.kind}:${source.id}`} source={source} />
          ))}
        </section>
        <section
          className="cmd-packet-section"
          aria-labelledby="packet-project-heading"
        >
          <p className="cmd-eyebrow">Scope</p>
          <h2 id="packet-project-heading">Project context</h2>
          <h3>{snapshot.projectContext.name}</h3>
          <p>
            {snapshot.projectContext.summary ||
              "No project summary was recorded."}
          </p>
          <dl className="cmd-packet-small-facts">
            <div>
              <dt>Type</dt>
              <dd>{snapshot.projectContext.type}</dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>{snapshot.projectContext.lifecycle}</dd>
            </div>
          </dl>
          <a
            href={`/projects/${encodeURIComponent(snapshot.projectContext.id)}`}
          >
            View current project
          </a>
          <Source source={snapshot.projectContext.evidence} />
        </section>
      </div>

      <div className="cmd-packet-grid">
        <section
          className="cmd-packet-section"
          aria-labelledby="packet-knowledge-heading"
        >
          <p className="cmd-eyebrow">
            Explicit selection / {snapshot.selectedKnowledge.length} included
          </p>
          <h2 id="packet-knowledge-heading">Selected knowledge</h2>
          {snapshot.selectedKnowledge.length === 0 ? (
            <p className="cmd-brief-empty">
              No knowledge records were selected for this version.
            </p>
          ) : (
            <ul className="cmd-packet-list">
              {snapshot.selectedKnowledge.map((item) => (
                <li key={item.id}>
                  <h3>{item.title}</h3>
                  {item.kind && (
                    <p>Saved type: {knowledgeTypeLabel(item.kind)}</p>
                  )}
                  <p>
                    Only the Knowledge identity
                    {item.kind ? ", type, and" : " and"} source reference are
                    included in this packet. Open the current record for its
                    content.
                  </p>
                  <a href={`/knowledge-items/${encodeURIComponent(item.id)}`}>
                    View current Knowledge item
                  </a>
                  <Source source={item.evidence} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          className="cmd-packet-section"
          aria-labelledby="packet-resources-heading"
        >
          <p className="cmd-eyebrow">
            Explicit selection / {snapshot.selectedResources.length} included
          </p>
          <h2 id="packet-resources-heading">Selected resources</h2>
          {snapshot.selectedResources.length === 0 ? (
            <p className="cmd-brief-empty">
              No linked resources were selected for this version.
            </p>
          ) : (
            <ul className="cmd-packet-list">
              {snapshot.selectedResources.map((item) => (
                <li key={item.id}>
                  <h3>Selected resource</h3>
                  <p>Resource ID: {item.id}</p>
                  <p>{`Project relationship: ${item.linkType.replaceAll("_", " ")}. Link ID: ${item.linkId}.`}</p>
                  <p>
                    Only the resource identity and relationship provenance are
                    included in this packet. Current resource details may
                    change.
                  </p>
                  <a href={`/resources/${encodeURIComponent(item.id)}`}>
                    View current resource
                  </a>
                  <Source source={item.evidence} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="cmd-packet-grid">
        {snapshot.acceptance && (
          <section
            className="cmd-packet-section"
            aria-labelledby="packet-acceptance-heading"
          >
            <p className="cmd-eyebrow">Saved task requirements</p>
            <h2 id="packet-acceptance-heading">Acceptance criteria</h2>
            <p>Version {snapshot.acceptance.version}</p>
            <p className="cmd-packet-text">{snapshot.acceptance.criteria}</p>
            <Source source={snapshot.acceptance.evidence} />
            {snapshot.acceptance.latestReview ? (
              <>
                <h3>Latest manual local review</h3>
                <p>
                  {snapshot.acceptance.latestReview.result.replaceAll("_", " ")}
                  : {snapshot.acceptance.latestReview.note}
                </p>
                <p>
                  Cited original document:{" "}
                  {snapshot.acceptance.latestReview.documentTitle}. This is a
                  local review claim, not independent verification.
                </p>
                {snapshot.acceptance.latestReview.evidence.map((source) => (
                  <Source key={`${source.kind}:${source.id}`} source={source} />
                ))}
              </>
            ) : (
              <p>No manual review was recorded for these criteria.</p>
            )}
          </section>
        )}
        <section
          className="cmd-packet-section"
          aria-labelledby="packet-gaps-heading"
        >
          <p className="cmd-eyebrow">Explicit gaps</p>
          <h2 id="packet-gaps-heading">Recorded context and gaps</h2>
          <dl className="cmd-brief-gaps">
            <div>
              <dt>Acceptance criteria</dt>
              <dd>{snapshot.missing.acceptanceCriteria.message}</dd>
            </div>
            <div>
              <dt>Verification expectations</dt>
              <dd>{snapshot.missing.verificationExpectations.message}</dd>
            </div>
            <div>
              <dt>Task constraints</dt>
              <dd>{snapshot.missing.taskConstraints.message}</dd>
            </div>
          </dl>
        </section>
        <section
          className="cmd-packet-section"
          aria-labelledby="packet-authorization-heading"
        >
          <p className="cmd-eyebrow">Authorization at creation</p>
          <h2 id="packet-authorization-heading">Capabilities and actions</h2>
          <p>{snapshot.authorization.explanation}</p>
          <p>
            Capability grants:{" "}
            {snapshot.authorization.capabilityGrants.length === 0
              ? "none"
              : snapshot.authorization.capabilityGrants.join(", ")}
          </p>
          <p>
            External actions:{" "}
            {snapshot.authorization.externalActions.replaceAll("_", " ")}.
          </p>
        </section>
      </div>
    </article>
  );
}
