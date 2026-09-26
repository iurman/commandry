import type { ReactNode } from "react";

export interface SimulatedApprovalView {
  id: string;
  occurrenceId: string;
  requestFingerprint: string;
  descriptorDigest: string;
  descriptor: {
    schemaVersion: "simulated-resource-restart/v1";
    actionType: "simulated.resource.restart";
    intendedActor: { agentId: string; runId: string };
    proposedBy: "local-reviewer:unattributed";
    packet: { id: string; version: number; digest: string };
    target: {
      projectId: string;
      resourceId: string;
      projectResourceLinkId: string;
    };
    parameters: { mode: "graceful" };
    reason: string;
    expectedResult: string;
    risk: "sensitive";
    requiredCapability: "infrastructure.restart";
    policy: {
      automaticCeiling: "read_only" | "reversible";
      approvalRequired: true;
      grantScope: "simulation_only";
    };
    reversibility: { isApplicable: false; explanation: string };
    expiresAt: string;
    sourceLabel: "Synthetic local action proposal";
    isSynthetic: true;
    externalActions: [];
  };
  state: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  decision: {
    kind: "approve" | "reject" | "cancel";
    actor: "local-reviewer:unattributed";
    occurrenceId: string;
    decidedAt: string;
  } | null;
  outcome: {
    kind: "simulated_only";
    verificationStatus: "unverified";
    externalActions: [];
    resourceStateChanged: false;
    recordedAt: string;
    summary: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulatedApprovalAuditView {
  id: string;
  approvalId: string;
  eventType:
    | "proposed"
    | "approved"
    | "rejected"
    | "cancelled"
    | "expired"
    | "simulation_recorded";
  actor: string;
  occurrenceId: string | null;
  detail: string;
  createdAt: string;
}

function approvalState(approval: SimulatedApprovalView) {
  if (approval.outcome) return "Simulation recorded";
  if (approval.state === "approved") return "Approved, simulation pending";
  return approval.state.charAt(0).toUpperCase() + approval.state.slice(1);
}

export function SimulatedApprovalCard({
  approval,
}: {
  approval: SimulatedApprovalView;
}) {
  return (
    <article
      className="cmd-approval-card"
      aria-label={`Approval ${approval.id}`}
    >
      <div className="cmd-approval-card-head">
        <div>
          <p className="cmd-eyebrow">Synthetic local proposal</p>
          <h2>
            <a href={`/approvals/${encodeURIComponent(approval.id)}`}>
              Simulated resource restart
            </a>
          </h2>
        </div>
        <span className="cmd-approval-state" data-state={approval.state}>
          {approvalState(approval)}
        </span>
      </div>
      <p>
        Resource <code>{approval.descriptor.target.resourceId}</code> in project{" "}
        <code>{approval.descriptor.target.projectId}</code>
      </p>
      <p className="cmd-approval-card-meta">
        Sensitive / Approval required / No external effect
      </p>
      <p className="cmd-approval-card-meta">
        Requested{" "}
        <time dateTime={approval.createdAt}>{approval.createdAt}</time>
        {approval.state === "pending" && (
          <>
            {" "}
            / Expires{" "}
            <time dateTime={approval.descriptor.expiresAt}>
              {approval.descriptor.expiresAt}
            </time>
          </>
        )}
      </p>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function SimulatedApprovalPanel({
  approval,
  projectName,
  resourceName,
}: {
  approval: SimulatedApprovalView;
  projectName?: string;
  resourceName?: string;
}) {
  const { descriptor } = approval;
  return (
    <article className="cmd-approval-detail" aria-label="Exact action review">
      <header className="cmd-approval-detail-head">
        <div>
          <p className="cmd-eyebrow">
            Exact action review / {descriptor.schemaVersion}
          </p>
          <h1>Simulated resource restart</h1>
          <p className="cmd-lead">
            A sensitive local proposal for one selected resource link.
          </p>
        </div>
        <span className="cmd-approval-state" data-state={approval.state}>
          {approvalState(approval)}
        </span>
      </header>
      <p className="cmd-approval-disclosure">
        <strong>Synthetic review. No external effect.</strong> Approval permits
        only a local no-effect simulation. It does not grant a real restart
        capability, contact a source system, verify a restart, or change
        resource state.
      </p>
      <div className="cmd-approval-detail-grid">
        <section aria-labelledby="approval-action-heading">
          <h2 id="approval-action-heading">Exact action and target</h2>
          <dl className="cmd-approval-facts">
            <Fact label="Action type">
              <code>{descriptor.actionType}</code>
            </Fact>
            <Fact label="Version">
              <code>{descriptor.schemaVersion}</code>
            </Fact>
            <Fact label="Project">
              <a
                href={`/projects/${encodeURIComponent(descriptor.target.projectId)}`}
              >
                {projectName ?? descriptor.target.projectId}
              </a>
              {projectName && <code>{descriptor.target.projectId}</code>}
            </Fact>
            <Fact label="Resource">
              <a
                href={`/resources/${encodeURIComponent(descriptor.target.resourceId)}`}
              >
                {resourceName ?? descriptor.target.resourceId}
              </a>
              {resourceName && <code>{descriptor.target.resourceId}</code>}
            </Fact>
            <Fact label="Exact project-resource link">
              <a
                href={`/api/v1/project-resource-links/${encodeURIComponent(descriptor.target.projectResourceLinkId)}`}
              >
                <code>{descriptor.target.projectResourceLinkId}</code>
              </a>
            </Fact>
            <Fact label="Parameters">
              <code>mode={descriptor.parameters.mode}</code>
            </Fact>
            <Fact label="Descriptor digest">
              <code>{approval.descriptorDigest}</code>
            </Fact>
          </dl>
        </section>
        <section aria-labelledby="approval-policy-heading">
          <h2 id="approval-policy-heading">Risk and policy</h2>
          <dl className="cmd-approval-facts">
            <Fact label="Risk">{descriptor.risk}</Fact>
            <Fact label="Conceptual required capability">
              <code>{descriptor.requiredCapability}</code>
            </Fact>
            <Fact label="Local automatic ceiling">
              <code>{descriptor.policy.automaticCeiling}</code>
            </Fact>
            <Fact label="Decision threshold">
              {descriptor.policy.approvalRequired
                ? "Approval required above local automatic ceiling"
                : "No approval required"}
            </Fact>
            <Fact label="Grant scope">
              <code>{descriptor.policy.grantScope}</code>
            </Fact>
            <Fact label="Expiry">
              <time dateTime={descriptor.expiresAt}>
                {descriptor.expiresAt}
              </time>
            </Fact>
            <Fact label="Rollback truth">
              {descriptor.reversibility.explanation}
            </Fact>
          </dl>
        </section>
        <section aria-labelledby="approval-lineage-heading">
          <h2 id="approval-lineage-heading">Actor and evidence</h2>
          <dl className="cmd-approval-facts">
            <Fact label="Proposed by">
              <code>{descriptor.proposedBy}</code> / Local review is not
              product-authenticated
            </Fact>
            <Fact label="Intended actor">
              <code>{descriptor.intendedActor.agentId}</code> / Synthetic local
              agent
            </Fact>
            <Fact label="Fake run">
              <a
                href={`/agent-runs/${encodeURIComponent(descriptor.intendedActor.runId)}`}
              >
                <code>{descriptor.intendedActor.runId}</code>
              </a>
            </Fact>
            <Fact label="Reviewed packet">
              <a
                href={`/execution-packets/${encodeURIComponent(descriptor.packet.id)}`}
              >
                Version {descriptor.packet.version}
              </a>
              <code>{descriptor.packet.digest}</code>
            </Fact>
            <Fact label="Reason">{descriptor.reason}</Fact>
            <Fact label="Expected result">{descriptor.expectedResult}</Fact>
            <Fact label="Source label">{descriptor.sourceLabel}</Fact>
          </dl>
        </section>
      </div>
      {approval.decision && (
        <section
          className="cmd-approval-outcome"
          aria-labelledby="approval-decision-heading"
        >
          <h2 id="approval-decision-heading">Decision</h2>
          <p>
            {approval.decision.kind} by {approval.decision.actor} at{" "}
            <time dateTime={approval.decision.decidedAt}>
              {approval.decision.decidedAt}
            </time>
            . The local reviewer identity is unattributed.
          </p>
        </section>
      )}
      {approval.outcome && (
        <section
          className="cmd-approval-outcome"
          aria-labelledby="approval-outcome-heading"
        >
          <h2 id="approval-outcome-heading">Simulation recorded</h2>
          <p>{approval.outcome.summary}</p>
          <p>
            Unverified / No external actions / Resource state unchanged /{" "}
            <time dateTime={approval.outcome.recordedAt}>
              {approval.outcome.recordedAt}
            </time>
          </p>
        </section>
      )}
    </article>
  );
}

export function SimulatedApprovalAuditList({
  items,
  children,
}: {
  items: SimulatedApprovalAuditView[];
  children?: ReactNode;
}) {
  return (
    <section className="cmd-approval-audit" aria-label="Approval audit history">
      <p className="cmd-eyebrow">Append-only history</p>
      <h2>Approval audit history</h2>
      {items.length === 0 ? (
        <p>No approval events recorded yet.</p>
      ) : (
        <ol>
          {items.map((event) => (
            <li key={event.id}>
              <strong>{event.eventType.replaceAll("_", " ")}</strong>
              <span>{event.detail}</span>
              <span>{event.actor}</span>
              <time dateTime={event.createdAt}>{event.createdAt}</time>
              {event.occurrenceId && <code>{event.occurrenceId}</code>}
            </li>
          ))}
        </ol>
      )}
      {children}
    </section>
  );
}
