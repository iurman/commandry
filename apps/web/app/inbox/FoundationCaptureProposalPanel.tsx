"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  foundationFindingProposalDetailSchema,
  foundationFindingProposalReviewInputSchema,
  foundationFindingProposalReviewReceiptSchema,
  type FoundationFindingProposalDetail,
  type FoundationFindingProposalReviewInput,
  type FoundationFindingProposalReviewReceipt,
  foundationTaskProposalDetailSchema,
  foundationTaskProposalReviewInputSchema,
  foundationTaskProposalReviewReceiptSchema,
  type FoundationTaskProposalDetail,
  type FoundationTaskProposalReviewInput,
  type FoundationTaskProposalReviewReceipt,
} from "@commandry/contracts";
import styles from "./FoundationTaskProposalPanel.module.css";

type ProposalKind = "task" | "finding";
type Detail = FoundationTaskProposalDetail | FoundationFindingProposalDetail;
type ReviewInput =
  FoundationTaskProposalReviewInput | FoundationFindingProposalReviewInput;
type Receipt =
  FoundationTaskProposalReviewReceipt | FoundationFindingProposalReviewReceipt;

type Props = {
  kind: ProposalKind;
  captureId: string;
  projectId: string;
  onReviewed: () => void;
  active?: boolean;
};
type Loaded = {
  scope: string;
  state: "loading" | "ready" | "empty" | "error" | "auth";
  detail: Detail | null;
};
type Draft = { proposal: string; title: string; body: string; reason: string };
type Attempt = {
  kind: ProposalKind;
  scope: string;
  detail: Detail;
  draft: Draft;
  input: ReviewInput;
  key: string;
  body: string;
};
type Issue = {
  scope: string;
  kind: "validation" | "reload" | "auth";
  message: string;
};
type Verified = {
  scope: string;
  record: Receipt;
};

function verifiedReceipt(raw: unknown, attempt: Attempt) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Unavailable review receipt");
  const envelope = raw as Record<string, unknown>;
  const keys = Object.keys(envelope);
  if (
    keys.length !== 3 ||
    !keys.includes("record") ||
    !keys.includes("replayed") ||
    !keys.includes("correlationId") ||
    typeof envelope.replayed !== "boolean"
  )
    throw new Error("Unavailable review receipt");
  const correlation =
    foundationTaskProposalReviewReceiptSchema.shape.proposalId.safeParse(
      envelope.correlationId,
    );
  if (
    !correlation.success ||
    correlation.data !== envelope.correlationId ||
    correlation.data !== correlation.data.toLowerCase()
  )
    throw new Error("Unavailable review receipt");
  const record = (
    attempt.kind === "finding"
      ? foundationFindingProposalReviewReceiptSchema
      : foundationTaskProposalReviewReceiptSchema
  ).parse(envelope.record);
  const { input, detail } = attempt;
  const binding = detail.suggestion.proposal.binding;
  const decision = record.decision;
  if (
    record.proposalId !== input.proposalId ||
    record.captureId !== detail.capture.id ||
    record.projectId !== input.projectId ||
    record.environment !== binding.environment ||
    decision.decision !== input.decision ||
    decision.provenance.proposalVersion !== input.expectedVersion ||
    decision.provenance.proposalDigest !== input.expectedProposalDigest ||
    decision.provenance.sourceDigest !== input.expectedSourceDigest ||
    decision.provenance.correlationId !== correlation.data ||
    decision.actor !== decision.provenance.reviewedBy ||
    (attempt.kind === "finding" &&
      (!("expectedCitationsDigest" in input) ||
        !("citationsDigest" in decision.provenance) ||
        decision.provenance.citationsDigest !== input.expectedCitationsDigest ||
        decision.provenance.reason !== input.reason)) ||
    (input.decision === "approve" &&
      (decision.selectedProjectId !== input.projectId ||
        decision.selectedTitle !== input.selectedTitle ||
        decision.selectedBody !== input.selectedBody))
  )
    throw new Error("Unavailable review receipt");
  return record;
}

export function FoundationCaptureProposalPanel({
  kind,
  captureId,
  projectId,
  onReviewed,
  active = true,
}: Props) {
  const scope = JSON.stringify([kind, captureId, projectId]);
  const labelId = useId();
  const [reload, setReload] = useState(0);
  const viewScope = JSON.stringify([scope, active]);
  const [visit, setVisit] = useState({ scope: viewScope, epoch: 0 });
  if (visit.scope !== viewScope) {
    setVisit({ scope: viewScope, epoch: visit.epoch + 1 });
  }
  const requestKey = JSON.stringify([
    captureId,
    projectId,
    reload,
    visit.epoch,
    active,
  ]);
  const [loaded, setLoaded] = useState<Loaded>({
    scope: requestKey,
    state: "loading",
    detail: null,
  });
  const [draft, setDraft] = useState<Draft>({
    proposal: "",
    title: "",
    body: "",
    reason: "",
  });
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [sending, setSending] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [verified, setVerified] = useState<Verified | null>(null);
  const alive = useRef(true);
  const selection = useRef({ scope, epoch: visit.epoch, requestKey });
  const callback = useRef(onReviewed);
  const attemptRef = useRef<Attempt | null>(null);
  const sendingRef = useRef(false);
  useLayoutEffect(() => {
    selection.current = { scope, epoch: visit.epoch, requestKey };
  }, [scope, visit.epoch, requestKey]);
  useLayoutEffect(() => {
    callback.current = onReviewed;
  }, [onReviewed]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let current = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/foundation/${kind === "finding" ? "workflows/findings" : "task-proposals"}/by-capture/${encodeURIComponent(captureId)}?projectId=${encodeURIComponent(projectId)}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (
          !current ||
          !alive.current ||
          selection.current.requestKey !== requestKey
        )
          return;
        if (!response.ok) {
          setLoaded({
            scope: requestKey,
            state:
              response.status === 404
                ? "empty"
                : response.status === 401 || response.status === 403
                  ? "auth"
                  : "error",
            detail: null,
          });
          return;
        }
        const detail = (
          kind === "finding"
            ? foundationFindingProposalDetailSchema
            : foundationTaskProposalDetailSchema
        ).parse(await response.json());
        const binding = detail.suggestion.proposal.binding;
        if (
          detail.capture.id !== captureId ||
          detail.capture.projectId !== projectId ||
          binding.captureId !== captureId ||
          binding.projectId !== projectId ||
          detail.suggestion.captureId !== captureId ||
          detail.suggestion.proposedProjectId !== projectId
        )
          throw new Error("Unavailable proposal binding");
        if (
          !current ||
          !alive.current ||
          selection.current.requestKey !== requestKey
        )
          return;
        setLoaded({ scope: requestKey, state: "ready", detail });
        const heldAttempt = attemptRef.current;
        if (detail.decision !== null && heldAttempt?.scope === scope) {
          // An authoritative terminal read resolves the current review state.
          // It does not verify a POST receipt or trigger mutation feedback.
          attemptRef.current = null;
          setAttempt(null);
        }
        if (detail.decision === null) {
          const proposal = `${scope}:${detail.suggestion.id}:${detail.suggestion.proposal.contentDigest}`;
          setDraft((previous) =>
            heldAttempt?.scope === scope
              ? heldAttempt.draft
              : previous.proposal === proposal
                ? previous
                : {
                    proposal,
                    title: detail.suggestion.title,
                    body: detail.suggestion.body,
                    reason: "",
                  },
          );
        }
      } catch {
        if (
          current &&
          alive.current &&
          selection.current.requestKey === requestKey
        )
          setLoaded({ scope: requestKey, state: "error", detail: null });
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [kind, captureId, projectId, scope, requestKey, active]);

  const detail = loaded.scope === requestKey ? loaded.detail : null;
  const state = loaded.scope === requestKey ? loaded.state : "loading";
  const currentIssue = issue?.scope === scope ? issue : null;
  const currentAttempt = attempt?.scope === scope ? attempt : null;
  const foreignAttempt = attempt !== null && attempt.scope !== scope;
  const receipt = verified?.scope === scope ? verified.record : null;
  const decision = receipt?.decision ?? detail?.decision ?? null;
  const pending = detail !== null && decision === null;

  async function send(snapshot: Attempt) {
    if (
      !active ||
      sendingRef.current ||
      attemptRef.current !== snapshot ||
      selection.current.scope !== snapshot.scope
    )
      return;
    const deliverySelection = selection.current;
    sendingRef.current = true;
    setSending(true);
    let record: Receipt | null = null;
    try {
      const response = await fetch(
        `/api/v1/foundation/${snapshot.kind === "finding" ? "workflows/findings" : "task-proposals"}/review`,
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
        if ([400, 401, 403, 404, 409].includes(response.status)) {
          attemptRef.current = null;
          if (alive.current) {
            setAttempt(null);
            if (selection.current === deliverySelection) {
              const auth = response.status === 401 || response.status === 403;
              const stale = response.status === 404 || response.status === 409;
              setIssue({
                scope: snapshot.scope,
                kind: auth ? "auth" : stale ? "reload" : "validation",
                message: auth
                  ? "Sign in as the owner, then reload this review."
                  : stale
                    ? "This review changed or is unavailable. Reload review before deciding again."
                    : "The decision was not accepted. Check the title and body before trying again.",
              });
            }
          }
          return;
        }
        throw new Error("Review delivery uncertain");
      }
      record = verifiedReceipt(await response.json(), snapshot);
    } catch {
      // Keep the immutable input and key: the server may have committed already.
    } finally {
      sendingRef.current = false;
      if (alive.current) setSending(false);
    }
    if (record === null) return;
    attemptRef.current = null;
    if (!alive.current) return;
    setAttempt(null);
    if (selection.current !== deliverySelection) return;
    setIssue(null);
    setVerified({ scope: snapshot.scope, record });
    callback.current();
  }

  function submit(choice: "approve" | "reject") {
    if (
      !active ||
      !pending ||
      !detail ||
      selection.current.requestKey !== requestKey ||
      attemptRef.current !== null ||
      sendingRef.current ||
      currentIssue?.kind === "reload" ||
      currentIssue?.kind === "auth"
    )
      return;
    const parsed = (
      kind === "finding"
        ? foundationFindingProposalReviewInputSchema
        : foundationTaskProposalReviewInputSchema
    ).safeParse({
      projectId,
      proposalId: detail.suggestion.id,
      expectedVersion: 1,
      expectedProposalDigest: detail.suggestion.proposal.contentDigest,
      expectedSourceDigest: detail.suggestion.proposal.binding.sourceDigest,
      decision: choice,
      ...(kind === "finding" &&
      "citationsDigest" in detail.suggestion.proposal.binding
        ? {
            expectedCitationsDigest:
              detail.suggestion.proposal.binding.citationsDigest,
            reason: draft.reason,
          }
        : {}),
      ...(choice === "approve"
        ? { selectedTitle: draft.title, selectedBody: draft.body }
        : {}),
    });
    if (!parsed.success) {
      setIssue({
        scope,
        kind: "validation",
        message:
          kind === "finding"
            ? "Enter a review reason (up to 4000 characters), title (up to 200) and body (up to 20000)."
            : "Enter a nonblank title of at most 200 characters and a body of at most 20000 characters.",
      });
      return;
    }
    let key: string;
    try {
      key = crypto.randomUUID();
    } catch {
      setIssue({
        scope,
        kind: "validation",
        message: "Could not prepare the decision. Try again.",
      });
      return;
    }
    const snapshot: Attempt = {
      kind,
      scope,
      detail,
      draft: { ...draft },
      input: parsed.data,
      key,
      body: JSON.stringify(parsed.data),
    };
    attemptRef.current = snapshot;
    setAttempt(snapshot);
    setIssue(null);
    void send(snapshot);
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit("approve");
  }

  function reloadReview() {
    if (sendingRef.current || attemptRef.current !== null) return;
    setIssue(null);
    setVerified(null);
    setReload((previous) => previous + 1);
  }

  const frozen = attempt !== null || sending;
  if (!active) return null;
  return (
    <section
      className={styles.panel}
      aria-labelledby={`${labelId}-heading`}
      aria-busy={state === "loading" || sending}
    >
      <h2 id={`${labelId}-heading`}>Agent {kind} proposal</h2>
      {state === "loading" && <p role="status">Loading proposal review...</p>}
      {state !== "loading" && state !== "ready" && (
        <div className={styles.message}>
          <p role={state === "empty" ? "status" : "alert"}>
            {state === "empty"
              ? `No ${kind} proposal is available for this capture.`
              : state === "auth"
                ? "Sign in as the owner to load this proposal review."
                : "Proposal review is unavailable. Try loading it again."}
          </p>
          <button type="button" onClick={reloadReview} disabled={frozen}>
            {state === "auth" ? "Retry after sign-in" : "Reload review"}
          </button>
        </div>
      )}
      {detail && (
        <>
          <p className={styles.status} role="status">
            {decision
              ? decision.decision === "approve"
                ? "Approved"
                : "Rejected"
              : "Pending review"}
          </p>
          <p className={styles.hint}>Unverified source content</p>
          <dl className={styles.metadata}>
            <dt>Client principal</dt>
            <dd>{detail.suggestion.proposal.binding.principalId}</dd>
            <dt>Environment</dt>
            <dd>{detail.suggestion.proposal.binding.environment}</dd>
            <dt>Project</dt>
            <dd>{projectId}</dd>
          </dl>
          {kind === "finding" &&
            "citations" in detail.suggestion.proposal.binding && (
              <div className={styles.suggestion}>
                <h3>Whole-source citations</h3>
                <p className={styles.hint}>
                  These references support review. Filing does not establish
                  factual verification or allow instructions to run.
                </p>
                <ol>
                  {detail.suggestion.proposal.binding.citations.map(
                    (citation) => (
                      <li key={citation.evidenceId}>
                        <p>
                          {citation.sourceKind}: {citation.sourceId}
                          {citation.sourceVersion
                            ? `, revision ${citation.sourceVersion}`
                            : ""}
                        </p>
                        <p>Evidence: {citation.evidenceId}</p>
                        <p>Digest: {citation.contentDigest}</p>
                      </li>
                    ),
                  )}
                </ol>
              </div>
            )}
          {decision ? (
            <div className={styles.message}>
              <p>
                Reviewed by <span>{decision.actor}</span>
              </p>
              <p>
                Reviewed at{" "}
                <time dateTime={decision.createdAt}>{decision.createdAt}</time>
              </p>
              {decision.decision === "approve" ? (
                kind === "finding" ? (
                  <div className={styles.message}>
                    <p>
                      Filed as Knowledge. Assertion acceptance and factual
                      verification remain separate.
                    </p>
                    <a
                      href={`/knowledge?projectId=${encodeURIComponent(projectId)}`}
                    >
                      View project knowledge
                    </a>
                    {receipt && "memory" in receipt && receipt.memory && (
                      <a
                        href={`/foundation/memory/${encodeURIComponent(receipt.memory.id)}?projectId=${encodeURIComponent(projectId)}`}
                      >
                        Review the proposed assertion
                      </a>
                    )}
                  </div>
                ) : (
                  <a href={`/work?projectId=${encodeURIComponent(projectId)}`}>
                    View project tasks
                  </a>
                )
              ) : (
                <p>The original capture is retained.</p>
              )}
            </div>
          ) : (
            <>
              <div className={styles.suggestion}>
                <h3>Suggested title</h3>
                <p className={styles.exact}>{detail.suggestion.title}</p>
                <h3>Suggested body</h3>
                <p className={styles.exact}>{detail.suggestion.body}</p>
                <h3>Rationale</h3>
                <p className={styles.exact}>{detail.suggestion.rationale}</p>
              </div>
              <p className={styles.hint}>
                Review the suggested {kind}. The original capture stays
                unchanged.
              </p>
              <form className={styles.form} onSubmit={approve}>
                <label htmlFor={`${labelId}-title`}>
                  {kind === "finding" ? "Finding" : "Task"} title
                </label>
                <textarea
                  id={`${labelId}-title`}
                  rows={2}
                  maxLength={200}
                  required
                  value={draft.title}
                  disabled={frozen}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      title: event.target.value,
                    }))
                  }
                />
                <label htmlFor={`${labelId}-body`}>
                  {kind === "finding" ? "Finding" : "Task"} body
                </label>
                <textarea
                  id={`${labelId}-body`}
                  rows={6}
                  maxLength={20000}
                  value={draft.body}
                  disabled={frozen}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      body: event.target.value,
                    }))
                  }
                />
                {kind === "finding" && (
                  <>
                    <label htmlFor={`${labelId}-reason`}>Review reason</label>
                    <textarea
                      id={`${labelId}-reason`}
                      rows={3}
                      maxLength={4000}
                      required
                      value={draft.reason}
                      disabled={frozen}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          reason: event.target.value,
                        }))
                      }
                    />
                  </>
                )}
                {!currentAttempt && (
                  <div className={styles.actions}>
                    <button
                      type="submit"
                      disabled={
                        frozen ||
                        currentIssue?.kind === "reload" ||
                        currentIssue?.kind === "auth"
                      }
                    >
                      {kind === "finding"
                        ? "Approve and file finding"
                        : "Approve and create task"}
                    </button>
                    <button
                      type="button"
                      onClick={() => submit("reject")}
                      disabled={
                        frozen ||
                        currentIssue?.kind === "reload" ||
                        currentIssue?.kind === "auth"
                      }
                    >
                      Reject proposal
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </>
      )}
      {foreignAttempt && (
        <p role="status">
          A decision for another capture is still pending. Return to that
          capture to resolve it before reviewing another.
        </p>
      )}
      {currentAttempt && (
        <div className={styles.message}>
          <p role="status">
            {sending
              ? "Saving decision..."
              : "This decision may have been saved. Retry the same decision to confirm its outcome."}
          </p>
          <button
            type="button"
            disabled={sending}
            onClick={() => void send(currentAttempt)}
          >
            Retry same decision
          </button>
        </div>
      )}
      {currentIssue && (
        <div className={styles.message}>
          <p role="alert">{currentIssue.message}</p>
          {currentIssue.kind !== "validation" && (
            <button type="button" onClick={reloadReview} disabled={frozen}>
              {currentIssue.kind === "auth"
                ? "Retry after sign-in"
                : "Reload review"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
