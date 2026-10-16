"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  foundationActorSchema,
  listProjectsResponseSchema,
  foundationImprovementDecisionInputSchema,
  foundationImprovementDecisionSchema,
  foundationImprovementDetailSchema,
  foundationImprovementPageSchema,
  foundationOnboardingApplyInputSchema,
  foundationOnboardingDecisionSchema,
  foundationOnboardingDetailSchema,
  foundationOnboardingOutcomeSchema,
  foundationOnboardingPageSchema,
  foundationOnboardingPreviewSchema,
  foundationOnboardingReviewInputSchema,
  type FoundationImprovementDetail,
  type FoundationOnboardingDetail,
  type FoundationOnboardingPreview,
} from "@commandry/contracts";
import { z } from "zod";
import { apiJson, pagePath } from "../../projects/api";
import styles from "./FoundationWorkflowReview.module.css";

type Project = ReturnType<
  typeof listProjectsResponseSchema.parse
>["items"][number];
type Kind = "improvements" | "onboarding";
type Detail = FoundationImprovementDetail | FoundationOnboardingDetail;
type Selection = {
  scope: string;
  requestKey: string;
  detail: Detail;
  preview: FoundationOnboardingPreview | null;
};
type Attempt = {
  scope: string;
  kind: Kind;
  action: "review" | "apply";
  key: string;
  body: string;
  input: Record<string, unknown>;
};
type Receipt = { scope: string; message: string; resourceId: string | null };
const endpoint = "/api/v1/foundation/workflows";
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
async function read(path: string, signal: AbortSignal) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok)
    throw new Error(
      "Owner workflow is unavailable. Sign in as the owner or reload.",
    );
  return response.json() as Promise<unknown>;
}
function verifyReceipt(raw: unknown, attempt: Attempt): Receipt {
  const schema =
    attempt.action === "apply"
      ? foundationOnboardingOutcomeSchema
      : attempt.kind === "improvements"
        ? foundationImprovementDecisionSchema
        : foundationOnboardingDecisionSchema;
  const result = z
    .strictObject({
      record: schema,
      replayed: z.boolean(),
      correlationId: foundationActorSchema.shape.correlationId,
    })
    .parse(raw);
  const record = result.record;
  if (
    record.projectId !== attempt.input.projectId ||
    record.proposalId !== attempt.input.proposalId
  )
    throw new Error("Unavailable receipt");
  if (attempt.action === "apply") {
    if (
      !("resource" in record) ||
      record.decisionId !== attempt.input.decisionId ||
      record.decisionVersion !== attempt.input.expectedDecisionVersion ||
      record.decisionDigest !== attempt.input.expectedDecisionDigest ||
      record.proposalDigest !== attempt.input.expectedProposalDigest ||
      record.correlationId !== result.correlationId
    )
      throw new Error("Unavailable receipt");
    return {
      scope: attempt.scope,
      message: result.replayed
        ? "Confirmed the original inventory apply receipt."
        : "Host inventory and project connection saved.",
      resourceId: record.resource.id,
    };
  }
  if (
    "resource" in record ||
    !Object.entries(attempt.input).every(([key, value]) =>
      same(record[key as keyof typeof record], value),
    )
  )
    throw new Error("Unavailable receipt");
  return {
    scope: attempt.scope,
    message:
      attempt.kind === "improvements"
        ? "Owner decision recorded. Configuration adoption remains a separate operation."
        : "Owner decision recorded. Apply remains a separate operation.",
    resourceId: null,
  };
}

function useActivationKey(scope: string) {
  const [visit, setVisit] = useState({ scope, epoch: 0 });
  if (visit.scope !== scope) setVisit({ scope, epoch: visit.epoch + 1 });
  return JSON.stringify([scope, visit.epoch]);
}

export function FoundationWorkflowReview({
  enabled,
  initialProjectId = "",
}: {
  enabled: boolean;
  initialProjectId?: string;
}) {
  const id = useId();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectsBusy, setProjectsBusy] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [kind, setKind] = useState<Kind>("improvements");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<{
    scope: string;
    requestKey: string;
    items: { id: string; rationale: string }[];
    cursor: string | null;
  }>({ scope: "", requestKey: "", items: [], cursor: null });
  const [continuationBusy, setPageBusy] = useState(false);
  const [pageFailure, setPageFailure] = useState<{
    requestKey: string;
    message: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [detailFailure, setDetailFailure] = useState<{
    requestKey: string;
    message: string;
  } | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const [inventoryReviewed, setInventoryReviewed] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [sending, setSending] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const attemptRef = useRef<Attempt | null>(null);
  const sendingRef = useRef(false);
  const alive = useRef(true);
  const listScope = JSON.stringify([projectId, kind]);
  const scope = JSON.stringify([projectId, kind, selectedId]);
  const requestKey = useActivationKey(
    JSON.stringify([scope, revision, enabled]),
  );
  const listRequestKey = useActivationKey(
    JSON.stringify([listScope, revision, enabled]),
  );
  const activeScope = useRef(scope);
  const activeRequest = useRef(requestKey);
  const activeList = useRef(listRequestKey);
  const continuation = useRef<{
    requestKey: string;
    cursor: string;
    controller: AbortController;
  } | null>(null);
  useLayoutEffect(() => {
    activeScope.current = scope;
    activeRequest.current = requestKey;
  }, [scope, requestKey]);
  useLayoutEffect(() => {
    activeList.current = listRequestKey;
    continuation.current?.controller.abort();
    continuation.current = null;
  }, [listRequestKey]);
  const frozen = attempt !== null || sending;
  const currentSelection =
    selected?.scope === scope && selected.requestKey === requestKey
      ? selected
      : null;
  const detail = currentSelection?.detail ?? null;
  const preview = currentSelection?.preview ?? null;
  const currentPage = page.requestKey === listRequestKey ? page : null;
  const pageError =
    pageFailure?.requestKey === listRequestKey ? pageFailure.message : null;
  const detailError =
    detailFailure?.requestKey === requestKey ? detailFailure.message : null;
  const pageBusy =
    continuationBusy || (enabled && !!projectId && !currentPage && !pageError);
  const setPageError = useCallback(
    (message: string | null) => {
      setPageFailure(
        message === null ? null : { requestKey: listRequestKey, message },
      );
    },
    [listRequestKey],
  );
  const setDetailError = useCallback(
    (message: string | null) => {
      setDetailFailure(message === null ? null : { requestKey, message });
    },
    [requestKey],
  );
  const decisionExpiry = detail?.currentDecision?.expiresAt;
  useEffect(() => {
    if (!decisionExpiry) return;
    const deadline = Date.parse(decisionExpiry);
    if (deadline <= clock) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(2147483647, Math.max(0, deadline - Date.now()) + 1),
    );
    return () => clearTimeout(timer);
  }, [decisionExpiry, clock]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      continuation.current?.controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    apiJson<unknown>(pagePath("/api/v1/projects"))
      .then((value) => listProjectsResponseSchema.parse(value))
      .then((value) => {
        if (!current) return;
        setProjects(value.items);
        setProjectCursor(value.nextCursor);
        setProjectsError(null);
      })
      .catch(() => {
        if (current)
          setProjectsError(
            "Project list unavailable. Reload the page to retry.",
          );
      })
      .finally(() => {
        if (current) setProjectsBusy(false);
      });
    return () => {
      current = false;
    };
  }, [enabled]);
  async function moreProjects() {
    if (!projectCursor || projectsBusy || frozen) return;
    setProjectsBusy(true);
    try {
      const value = listProjectsResponseSchema.parse(
        await apiJson<unknown>(pagePath("/api/v1/projects", projectCursor)),
      );
      if (!alive.current) return;
      setProjects((previous) => [
        ...previous,
        ...value.items.filter(
          (item) => !previous.some((old) => old.id === item.id),
        ),
      ]);
      setProjectCursor(value.nextCursor);
      setProjectsError(null);
    } catch {
      if (alive.current)
        setProjectsError("Could not load more projects. Try again.");
    } finally {
      if (alive.current) setProjectsBusy(false);
    }
  }
  useEffect(() => {
    if (!enabled || !projectId) return;
    let current = true;
    const controller = new AbortController();
    void read(
      `${endpoint}/${kind}?${new URLSearchParams({ projectId, limit: "25" })}`,
      controller.signal,
    )
      .then((raw) => {
        const value = (
          kind === "improvements"
            ? foundationImprovementPageSchema
            : foundationOnboardingPageSchema
        ).parse(raw);
        if (value.projectId !== projectId) throw new Error("Unavailable scope");
        if (!current) return;
        setPageError(null);
        setPage({
          scope: listScope,
          requestKey: listRequestKey,
          items: value.items,
          cursor: value.nextCursor,
        });
      })
      .catch(() => {
        if (current)
          setPageError(
            "Proposal list unavailable. Sign in as the owner or reload.",
          );
      })
      .finally(() => {
        if (current) setPageBusy(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, projectId, kind, listScope, listRequestKey, setPageError]);
  async function moreProposals() {
    if (!currentPage?.cursor || pageBusy || frozen || continuation.current)
      return;
    const requestedScope = listScope;
    const selection = {
      requestKey: listRequestKey,
      cursor: currentPage.cursor,
      controller: new AbortController(),
    };
    continuation.current = selection;
    const current = () =>
      alive.current &&
      continuation.current === selection &&
      activeList.current === selection.requestKey;
    setPageBusy(true);
    try {
      const raw = await read(
        `${endpoint}/${kind}?${new URLSearchParams({ projectId, limit: "25", cursor: selection.cursor })}`,
        selection.controller.signal,
      );
      const value = (
        kind === "improvements"
          ? foundationImprovementPageSchema
          : foundationOnboardingPageSchema
      ).parse(raw);
      if (value.projectId !== projectId) throw new Error("Unavailable scope");
      if (!current()) return;
      setPage((previous) =>
        previous.requestKey === selection.requestKey &&
        previous.cursor === selection.cursor
          ? {
              scope: requestedScope,
              requestKey: selection.requestKey,
              items: [
                ...previous.items,
                ...value.items.filter(
                  (item) => !previous.items.some((old) => old.id === item.id),
                ),
              ],
              cursor: value.nextCursor,
            }
          : previous,
      );
    } catch {
      if (current())
        setPageError(
          "Could not load more proposals. Retry, or reload to restart traversal.",
        );
    } finally {
      if (current()) {
        continuation.current = null;
        setPageBusy(false);
      }
    }
  }
  useEffect(() => {
    if (!enabled || !projectId || !selectedId) return;
    let current = true;
    const controller = new AbortController();
    const path = `${endpoint}/${kind}/${encodeURIComponent(selectedId)}`;
    const query = `?${new URLSearchParams({ projectId })}`;
    void (async () => {
      try {
        const [raw, rawPreview] = await Promise.all([
          read(path + query, controller.signal),
          kind === "onboarding"
            ? read(path + "/preview" + query, controller.signal)
            : Promise.resolve(null),
        ]);
        const value = (
          kind === "improvements"
            ? foundationImprovementDetailSchema
            : foundationOnboardingDetailSchema
        ).parse(raw);
        const inspected =
          rawPreview === null
            ? null
            : foundationOnboardingPreviewSchema.parse(rawPreview);
        if (
          value.proposal.projectId !== projectId ||
          value.proposal.id !== selectedId ||
          (inspected &&
            (inspected.proposalId !== selectedId ||
              inspected.projectId !== projectId ||
              inspected.proposalDigest !== value.proposal.contentDigest))
        )
          throw new Error("Unavailable scope");
        if (current) {
          setDetailError(null);
          setIssue(null);
          setReason("");
          setInventoryReviewed(false);
          setSelected({ scope, requestKey, detail: value, preview: inspected });
        }
      } catch {
        if (current) {
          setSelected(null);
          setDetailError("Review unavailable. Sign in as the owner or reload.");
        }
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, projectId, kind, selectedId, scope, requestKey, setDetailError]);

  async function send(snapshot: Attempt) {
    if (
      sendingRef.current ||
      attemptRef.current !== snapshot ||
      activeScope.current !== snapshot.scope
    )
      return;
    const deliveryRequest = activeRequest.current;
    sendingRef.current = true;
    setSending(true);
    let verified: Receipt | null = null;
    try {
      const response = await fetch(
        `${endpoint}/${snapshot.kind}/${snapshot.action}`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "idempotency-key": snapshot.key,
          },
          body: snapshot.body,
        },
      );
      if (!response.ok) {
        if ([400, 401, 403, 404, 409, 413].includes(response.status)) {
          attemptRef.current = null;
          if (alive.current) {
            setAttempt(null);
            setSelected(null);
            setIssue(
              "Decision not accepted or the review changed. Sign in if needed, then reload the exact review before trying again.",
            );
          }
          return;
        }
        throw new Error("Uncertain delivery");
      }
      verified = verifyReceipt(await response.json(), snapshot);
    } catch {
      /* Retain exact private input and key when the commit is uncertain. */
    } finally {
      sendingRef.current = false;
      if (alive.current) setSending(false);
    }
    if (!verified) return;
    attemptRef.current = null;
    if (!alive.current) return;
    setAttempt(null);
    if (
      activeScope.current !== snapshot.scope ||
      activeRequest.current !== deliveryRequest
    )
      return;
    setReceipt(verified);
    setRevision((value) => value + 1);
  }
  function submit(action: "review" | "apply", decision?: string) {
    if (!detail || frozen || attemptRef.current || sendingRef.current) return;
    try {
      const proposal = detail.proposal;
      let input: Record<string, unknown>;
      if (action === "apply") {
        const current = detail.currentDecision;
        if (
          !("outcome" in detail) ||
          detail.outcome ||
          !current ||
          current.decision !== "approved"
        )
          return;
        input = foundationOnboardingApplyInputSchema.parse({
          projectId,
          proposalId: proposal.id,
          expectedProposalDigest: proposal.contentDigest,
          decisionId: current.id,
          expectedDecisionVersion: current.version,
          expectedDecisionDigest: current.contentDigest,
        });
      } else {
        const common = {
          projectId,
          proposalId: proposal.id,
          expectedProposalDigest: proposal.contentDigest,
          expectedDecisionVersion: detail.currentDecision?.version ?? 0,
          decision,
          reason,
          expiresAt: new Date(Date.now() + hours * 3600000).toISOString(),
        };
        input =
          "advisory" in detail
            ? foundationImprovementDecisionInputSchema.parse({
                ...common,
                expectedPopulationDigest: detail.advisory.populationDigest,
                expectedReportDigest: detail.advisory.reportDigest,
              })
            : foundationOnboardingReviewInputSchema.parse({
                ...common,
                expectedPreviewDigest: preview?.previewDigest,
                inventoryReviewed,
              });
      }
      const snapshot: Attempt = {
        scope,
        kind,
        action,
        key: crypto.randomUUID(),
        input,
        body: JSON.stringify(input),
      };
      attemptRef.current = snapshot;
      setAttempt(snapshot);
      setIssue(null);
      setReceipt(null);
      void send(snapshot);
    } catch {
      setIssue(
        "Enter a nonblank review reason and inspect the current proposal before deciding.",
      );
    }
  }
  if (!enabled)
    return (
      <p role="status">
        Sign in as the owner to review agent workflows. Local preview access
        does not grant owner authority.
      </p>
    );
  return (
    <section className={styles.panel}>
      <div className={styles.controls}>
        <label htmlFor={`${id}-project`}>Project</label>
        <select
          id={`${id}-project`}
          value={projectId}
          disabled={frozen}
          onChange={(event) => {
            setProjectId(event.target.value);
            setSelectedId("");
          }}
        >
          <option value="">Choose a project</option>
          {initialProjectId &&
            !projects.some((item) => item.id === initialProjectId) && (
              <option value={initialProjectId}>
                Selected project: {initialProjectId}
              </option>
            )}
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {projectsBusy && <p role="status">Loading projects...</p>}
        {projectCursor && (
          <button
            type="button"
            disabled={projectsBusy || frozen}
            onClick={() => void moreProjects()}
          >
            Load more projects
          </button>
        )}
        {projectsError && <p role="alert">{projectsError}</p>}
        <label htmlFor={`${id}-kind`}>Workflow</label>
        <select
          id={`${id}-kind`}
          value={kind}
          disabled={frozen}
          onChange={(event) => {
            setKind(event.target.value as Kind);
            setSelectedId("");
          }}
        >
          <option value="improvements">Configuration improvements</option>
          <option value="onboarding">Host onboarding</option>
        </select>
        <button
          type="button"
          disabled={frozen}
          onClick={() => setRevision((value) => value + 1)}
        >
          Reload current view
        </button>
      </div>
      {projectId && (
        <div className={styles.proposals} aria-busy={pageBusy}>
          <h2>Agent proposals</h2>
          {pageBusy && <p role="status">Loading proposals...</p>}
          {pageError && <p role="alert">{pageError}</p>}
          {!pageBusy && !pageError && currentPage?.items.length === 0 && (
            <p>No proposals in this project yet.</p>
          )}
          <ul>
            {currentPage?.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={selectedId === item.id}
                  disabled={frozen}
                  onClick={() => setSelectedId(item.id)}
                >
                  {item.rationale}
                  <span className={styles.meta}>{item.id}</span>
                </button>
              </li>
            ))}
          </ul>
          {currentPage?.cursor && (
            <button
              type="button"
              disabled={pageBusy || frozen}
              onClick={() => void moreProposals()}
            >
              Load more proposals
            </button>
          )}
        </div>
      )}
      {selectedId && !detail && !detailError && !issue && (
        <p role="status">Loading exact review...</p>
      )}
      {detailError && <p role="alert">{detailError}</p>}
      {detail && (
        <article className={styles.review}>
          <h2>
            {kind === "improvements"
              ? "Review a configuration comparison"
              : "Review host inventory changes"}
          </h2>
          <dl>
            <dt>Proposal</dt>
            <dd>{detail.proposal.id}</dd>
            <dt>Producer</dt>
            <dd>{detail.proposal.recordedBy}</dd>
            <dt>Environment</dt>
            <dd>{detail.proposal.environment}</dd>
          </dl>
          <p>{detail.proposal.rationale}</p>
          {"advisory" in detail ? (
            <>
              <p>{detail.proposal.hypothesis}</p>
              <dl>
                <dt>Baseline configuration</dt>
                <dd>{detail.proposal.baselineConfigurationId}</dd>
                <dt>Candidate configuration</dt>
                <dd>{detail.proposal.candidateConfigurationId}</dd>
                <dt>Evaluation</dt>
                <dd>{detail.proposal.definitionId}</dd>
              </dl>
              <p role="status">
                {detail.advisory.eligibleForReview
                  ? "Current regression is eligible for owner review."
                  : "Current regression is blocked."}
              </p>
              <p>
                Newer unreviewed assessments:{" "}
                {detail.advisory.pendingNewerAssessmentCount}
              </p>
              <ul>
                {detail.advisory.blockers.map((item) => (
                  <li key={item}>{item.replaceAll("_", " ")}</li>
                ))}
              </ul>
              {detail.advisory.comparisons.map((item, index) => (
                <div key={index} className={styles.comparison}>
                  <h3>
                    {item.model} / {item.runtime}
                  </h3>
                  <p>
                    {item.counts.passedCells} passed; {item.counts.failedCells}{" "}
                    failed; {item.counts.missingCells} missing;{" "}
                    {item.counts.unassessedCells} unassessed;{" "}
                    {item.counts.attemptCount} attempts.
                  </p>
                  <ul>
                    {item.blockers.map((blocker) => (
                      <li key={blocker}>{blocker.replaceAll("_", " ")}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className={styles.meta}>
                Acceptance records a bounded owner decision. It does not
                install, activate or execute a configuration.
              </p>
            </>
          ) : (
            <>
              <h3>Proposed local inventory</h3>
              {detail.proposal.target.mode === "create" ? (
                <dl>
                  <dt>New host name</dt>
                  <dd>{detail.proposal.target.name}</dd>
                  <dt>Subtype</dt>
                  <dd>{detail.proposal.target.subtype ?? "Unspecified"}</dd>
                  <dt>URL</dt>
                  <dd>{detail.proposal.target.externalUrl ?? "None"}</dd>
                  <dt>Owner-asserted identity</dt>
                  <dd>
                    {detail.proposal.target.identity.namespace} /{" "}
                    {detail.proposal.target.identity.authority} /{" "}
                    {detail.proposal.target.identity.externalId}
                  </dd>
                </dl>
              ) : (
                <p>
                  Reuse host {detail.proposal.target.resourceId}. Existing host
                  fields remain unchanged.
                </p>
              )}
              <p>Project relationship: {detail.proposal.relationship}</p>
              {preview && (
                <>
                  <p role="status">
                    {detail.outcome
                      ? "Inventory changes were applied. Current inventory is shown below."
                      : preview.canApply
                        ? "Current inventory preview is eligible."
                        : "Inventory preview is blocked."}
                  </p>
                  {!detail.outcome && (
                    <ul>
                      {preview.blockers.map((item) => (
                        <li key={item}>{item.replaceAll("_", " ")}</li>
                      ))}
                    </ul>
                  )}
                  <p>
                    Existing host:{" "}
                    {preview.preconditions.resource?.name ?? "None"};
                    connection:{" "}
                    {preview.preconditions.link?.lifecycle ?? "None"}.
                  </p>
                </>
              )}
              <p className={styles.meta}>
                Apply records a canonical host and project connection. Server
                access, provisioning, renames and collector installation are
                separate operations.
              </p>
              {detail.outcome && (
                <p role="status">
                  Previously applied at {detail.outcome.recordedAt}. Resource:{" "}
                  {detail.outcome.resource.id}.
                </p>
              )}
            </>
          )}
          {detail.currentDecision && (
            <p>
              Current owner decision: {detail.currentDecision.decision}, version{" "}
              {detail.currentDecision.version}. Expires{" "}
              {detail.currentDecision.expiresAt}.
            </p>
          )}
          <label htmlFor={`${id}-reason`}>Review reason</label>
          <textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={4000}
            required
            value={reason}
            disabled={frozen}
            onChange={(event) => setReason(event.target.value)}
          />
          <label htmlFor={`${id}-expiry`}>Decision expires after</label>
          <select
            id={`${id}-expiry`}
            value={hours}
            disabled={frozen}
            onChange={(event) => setHours(Number(event.target.value))}
          >
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={168}>7 days</option>
          </select>
          {kind === "onboarding" && (
            <label>
              <input
                type="checkbox"
                checked={inventoryReviewed}
                disabled={frozen}
                onChange={(event) => setInventoryReviewed(event.target.checked)}
              />{" "}
              I inspected this host identity, existing inventory and proposed
              project connection.
            </label>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              disabled={
                frozen ||
                !reason.trim() ||
                ("advisory" in detail
                  ? !detail.advisory.eligibleForReview
                  : !preview?.canApply || !inventoryReviewed)
              }
              onClick={() =>
                submit(
                  "review",
                  kind === "improvements" ? "accepted" : "approved",
                )
              }
            >
              {kind === "improvements"
                ? "Accept comparison"
                : "Approve inventory changes"}
            </button>
            <button
              type="button"
              disabled={frozen || !reason.trim()}
              onClick={() => submit("review", "rejected")}
            >
              Reject
            </button>
            {detail.currentDecision && (
              <button
                type="button"
                disabled={frozen || !reason.trim()}
                onClick={() => submit("review", "revoked")}
              >
                Revoke decision
              </button>
            )}
            {"outcome" in detail &&
              !detail.outcome &&
              detail.currentDecision?.decision === "approved" && (
                <button
                  type="button"
                  disabled={
                    frozen ||
                    !preview?.canApply ||
                    Date.parse(detail.currentDecision.expiresAt) <= clock
                  }
                  onClick={() => submit("apply")}
                >
                  Apply approved inventory changes
                </button>
              )}
          </div>
        </article>
      )}
      {attempt && (
        <div role="status">
          {sending
            ? "Saving..."
            : "The response was not confirmed. Retry the same request to recover its original receipt."}
          <button
            type="button"
            disabled={sending}
            onClick={() => void send(attempt)}
          >
            Retry same request
          </button>
        </div>
      )}
      {issue && <p role="alert">{issue}</p>}
      {receipt?.scope === scope && (
        <p role="status">
          {receipt.message}
          {receipt.resourceId && (
            <>
              {" "}
              <a
                href={`/infrastructure?projectId=${encodeURIComponent(projectId)}`}
              >
                View project infrastructure
              </a>
            </>
          )}
        </p>
      )}
    </section>
  );
}
