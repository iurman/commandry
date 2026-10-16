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
  foundationActorSchema,
  foundationFailureSchema,
  foundationOwnerMemoryReadSchema,
  foundationOwnerMemoryReviewResultSchema,
  foundationReadRecordSchema,
  foundationReviewMemorySchema,
  type FoundationOwnerMemoryRead,
  type FoundationReviewMemory,
} from "@commandry/contracts";
import styles from "./FoundationMemoryReview.module.css";

type Props = { enabled: boolean; projectId: string; memoryId: string };
type Choice = FoundationReviewMemory["decision"] | "";
type Loaded = {
  key: string;
  state: "loading" | "ready" | "auth" | "error";
  detail: FoundationOwnerMemoryRead | null;
};
type Attempt = {
  scope: string;
  detail: FoundationOwnerMemoryRead;
  input: FoundationReviewMemory;
  body: string;
  key: string;
};
type Receipt = {
  scope: string;
  loadKey: string;
  value: ReturnType<typeof foundationOwnerMemoryReviewResultSchema.parse>;
};
type Issue = { scope: string; message: string; reload: boolean };

function verifiedReceipt(raw: unknown, attempt: Attempt) {
  const result = foundationOwnerMemoryReviewResultSchema.parse(raw);
  const { memory } = attempt.detail;
  if (
    result.record.id !== attempt.input.memoryId ||
    result.record.projectId !== attempt.input.projectId ||
    result.record.version !== attempt.input.expectedVersion ||
    result.record.lifecycle !== attempt.input.decision ||
    JSON.stringify({
      ...result.record,
      lifecycle: memory.lifecycle,
      verification: memory.verification,
    }) !== JSON.stringify(memory)
  ) {
    throw new Error("Unavailable review receipt");
  }
  // A concurrent factual verification can change independently of lifecycle.
  return result;
}

export function FoundationMemoryReview({
  enabled,
  projectId,
  memoryId,
}: Props) {
  const labelId = useId();
  const scope = JSON.stringify([projectId, memoryId]);
  const viewScope = JSON.stringify([scope, enabled]);
  const [visit, setVisit] = useState({ scope: viewScope, epoch: 0 });
  const [sending, setSending] = useState(false);
  if (visit.scope !== viewScope) {
    setVisit({ scope: viewScope, epoch: visit.epoch + 1 });
    setSending(false);
  }
  const [reload, setReload] = useState(0);
  const requestKey = JSON.stringify([viewScope, visit.epoch, reload]);
  const [loaded, setLoaded] = useState<Loaded>({
    key: requestKey,
    state: "loading",
    detail: null,
  });
  const [draft, setDraft] = useState<{
    scope: string;
    decision: Choice;
    reason: string;
  }>({ scope, decision: "", reason: "" });
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const alive = useRef(true);
  const selection = useRef({ scope, requestKey });
  const attemptRef = useRef<Attempt | null>(null);
  const sendingRef = useRef(false);
  const sendGeneration = useRef(0);
  const sendController = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    selection.current = { scope, requestKey };
  }, [scope, requestKey]);
  useLayoutEffect(() => {
    // Aborting a mutation cannot prove rollback. Retain its frozen attempt.
    sendGeneration.current += 1;
    sendController.current?.abort();
    sendingRef.current = false;
  }, [viewScope]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sendGeneration.current += 1;
      sendController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let current = true;
    const selected = foundationReadRecordSchema.safeParse({
      projectId,
      id: memoryId,
    });
    const active = () =>
      current &&
      alive.current &&
      !controller.signal.aborted &&
      selection.current.requestKey === requestKey;
    void (async () => {
      try {
        if (!selected.success) throw new Error("Unavailable selection");
        const response = await fetch(
          "/api/v1/foundation/memory/" +
            encodeURIComponent(selected.data.id) +
            "?projectId=" +
            encodeURIComponent(selected.data.projectId),
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!active()) return;
        if (!response.ok) {
          setLoaded({
            key: requestKey,
            state:
              response.status === 401 || response.status === 403
                ? "auth"
                : "error",
            detail: null,
          });
          return;
        }
        const detail = foundationOwnerMemoryReadSchema.parse(
          await response.json(),
        );
        if (
          detail.memory.id !== selected.data.id ||
          detail.memory.projectId !== selected.data.projectId
        )
          throw new Error("Unavailable assertion binding");
        if (!active()) return;
        setLoaded({ key: requestKey, state: "ready", detail });
        setDraft({ scope, decision: "", reason: "" });
      } catch {
        if (active())
          setLoaded({ key: requestKey, state: "error", detail: null });
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, projectId, memoryId, scope, requestKey]);

  const detail = loaded.key === requestKey ? loaded.detail : null;
  const state = loaded.key === requestKey ? loaded.state : "loading";
  const currentAttempt = attempt?.scope === scope ? attempt : null;
  const foreignAttempt = attempt !== null && attempt.scope !== scope;
  const currentIssue = issue?.scope === scope ? issue : null;
  const currentReceipt = receipt?.scope === scope ? receipt : null;
  const confirmedThisLoad = currentReceipt?.loadKey === requestKey;
  const decision =
    currentAttempt?.input.decision ??
    (draft.scope === scope ? draft.decision : "");
  const reason =
    currentAttempt?.input.reason ?? (draft.scope === scope ? draft.reason : "");
  const frozen = attempt !== null || sending;
  const canDecide =
    detail !== null && !frozen && !currentIssue?.reload && !confirmedThisLoad;

  async function send(snapshot: Attempt) {
    if (
      !enabled ||
      sendingRef.current ||
      attemptRef.current !== snapshot ||
      selection.current.scope !== snapshot.scope ||
      selection.current.requestKey !== requestKey
    )
      return;
    const deliverySelection = selection.current;
    const generation = ++sendGeneration.current;
    const controller = new AbortController();
    sendController.current = controller;
    sendingRef.current = true;
    setSending(true);
    setIssue(null);
    const active = () =>
      alive.current &&
      !controller.signal.aborted &&
      sendGeneration.current === generation &&
      selection.current === deliverySelection;
    try {
      const response = await fetch(
        "/api/v1/foundation/memory/" +
          encodeURIComponent(snapshot.input.memoryId) +
          "/review",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": snapshot.key,
          },
          body: snapshot.body,
        },
      );
      if (!active()) return;
      if (!response.ok) {
        if (response.status === 409) {
          const failure = foundationFailureSchema.safeParse(
            await response.json(),
          );
          if (failure.success && failure.data.code === "VERSION_CONFLICT") {
            if (!active()) return;
            attemptRef.current = null;
            setAttempt(null);
            setIssue({
              scope: snapshot.scope,
              reload: true,
              message:
                "The assertion version changed. Reload current state before deciding again.",
            });
            return;
          }
        }
        if (response.status === 401 || response.status === 403) {
          setIssue({
            scope: snapshot.scope,
            reload: false,
            message:
              "Owner access is required. Sign in again in another tab, then retry this exact decision.",
          });
        }
        throw new Error("Unconfirmed review");
      }
      const value = verifiedReceipt(await response.json(), snapshot);
      if (!active()) return;
      attemptRef.current = null;
      setAttempt(null);
      setIssue(null);
      setReceipt({ scope: snapshot.scope, loadKey: requestKey, value });
    } catch {
      // A lost or invalid response never releases the exact input/key.
    } finally {
      if (sendGeneration.current === generation) {
        sendingRef.current = false;
        if (alive.current) setSending(false);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !enabled ||
      !canDecide ||
      !detail ||
      selection.current.requestKey !== requestKey ||
      attemptRef.current !== null ||
      sendingRef.current
    )
      return;
    const input = foundationReviewMemorySchema.safeParse({
      projectId: detail.memory.projectId,
      memoryId: detail.memory.id,
      expectedVersion: detail.memory.version,
      decision,
      reason,
    });
    if (!input.success) {
      setIssue({
        scope,
        reload: false,
        message:
          "Choose a review decision and enter a nonblank reason of at most 4000 characters.",
      });
      return;
    }
    let key: string;
    try {
      key = foundationActorSchema.shape.correlationId.parse(
        crypto.randomUUID(),
      );
    } catch {
      setIssue({
        scope,
        reload: false,
        message: "Could not prepare a secure review request. Try again.",
      });
      return;
    }
    const { memoryId: target, ...body } = input.data;
    if (target !== detail.memory.id) return;
    const snapshot: Attempt = {
      scope,
      detail,
      input: input.data,
      key,
      body: JSON.stringify(body),
    };
    attemptRef.current = snapshot;
    setAttempt(snapshot);
    setIssue(null);
    void send(snapshot);
  }

  function reloadReview() {
    if (attemptRef.current !== null || sendingRef.current) return;
    setIssue(null);
    setReload((value) => value + 1);
  }

  if (!enabled)
    return (
      <section className={styles.panel} aria-labelledby={labelId + "-title"}>
        <h2 id={labelId + "-title"}>Memory assertion review</h2>
        <p>Sign in with the owner password to review this assertion.</p>
      </section>
    );

  return (
    <section
      className={styles.panel}
      aria-labelledby={labelId + "-title"}
      aria-busy={state === "loading" || sending}
    >
      <h2 id={labelId + "-title"}>Memory assertion review</h2>
      <p className={styles.hint}>
        Acceptance changes lifecycle only. Factual verification and instruction
        approval require separate owner decisions.
      </p>
      {state === "loading" && <p role="status">Loading assertion review...</p>}
      {state !== "loading" && state !== "ready" && (
        <div className={styles.message}>
          <p role="alert">
            {state === "auth"
              ? "Sign in as the owner to load this assertion."
              : "Assertion review is unavailable. Try loading it again."}
          </p>
          <button type="button" disabled={frozen} onClick={reloadReview}>
            {state === "auth" ? "Retry after sign-in" : "Reload current state"}
          </button>
        </div>
      )}
      {detail && (
        <>
          <div className={styles.card}>
            <h3>Loaded assertion state</h3>
            <p className={styles.hint}>
              This read does not confirm a submitted review.
            </p>
            <pre className={styles.exact} aria-label="Assertion statement">
              {detail.memory.content.statement}
            </pre>
            <dl className={styles.metadata}>
              <dt>Assertion ID</dt>
              <dd>{detail.memory.id}</dd>
              <dt>Project ID</dt>
              <dd>{detail.memory.projectId}</dd>
              <dt>Category</dt>
              <dd>{detail.memory.content.category}</dd>
              <dt>Content version</dt>
              <dd>{detail.memory.version}</dd>
              <dt>Content digest</dt>
              <dd>
                <code>{detail.memory.contentDigest}</code>
              </dd>
              <dt>Recorded by</dt>
              <dd>{detail.memory.recordedBy}</dd>
              <dt>Recorded at</dt>
              <dd>
                <time dateTime={detail.memory.recordedAt}>
                  {detail.memory.recordedAt}
                </time>
              </dd>
              <dt>Lifecycle</dt>
              <dd>{detail.memory.lifecycle}</dd>
              <dt>Factual verification</dt>
              <dd>{detail.memory.verification}</dd>
              <dt>Source freshness</dt>
              <dd>{detail.anchor.freshness}</dd>
            </dl>
          </div>
          <details className={styles.card}>
            <summary>Inspect source and all evidence IDs</summary>
            <dl className={styles.metadata}>
              <dt>Knowledge ID</dt>
              <dd>{detail.anchor.knowledgeItemId}</dd>
              <dt>Knowledge version</dt>
              <dd>{detail.anchor.knowledgeVersion}</dd>
              <dt>Anchor evidence ID</dt>
              <dd>{detail.anchor.evidenceId}</dd>
              <dt>Source version</dt>
              <dd className={styles.exact}>
                {detail.anchor.sourceVersion ?? "null"}
              </dd>
              <dt>Source digest</dt>
              <dd>
                <code>{detail.anchor.contentDigest}</code>
              </dd>
            </dl>
            <a
              href={
                "/api/v1/knowledge-items/" +
                encodeURIComponent(detail.memory.knowledgeItemId)
              }
            >
              View current Knowledge source JSON
            </a>
            <p className={styles.hint}>
              The link shows current Knowledge. The anchor above records the
              assertion&apos;s source version.
            </p>
            <h3>Evidence IDs ({detail.memory.content.evidenceIds.length})</h3>
            <ul aria-label="All evidence IDs" className={styles.ids}>
              {detail.memory.content.evidenceIds.map((id) => (
                <li key={id}>
                  <code>{id}</code>
                </li>
              ))}
            </ul>
            <h3>Related assertions</h3>
            <p>Relation: {detail.memory.content.relationType ?? "none"}</p>
            <ul aria-label="All related assertion IDs" className={styles.ids}>
              {detail.memory.content.relatedMemoryIds.map((id) => (
                <li key={id}>
                  <code>{id}</code>
                </li>
              ))}
            </ul>
          </details>
          {!confirmedThisLoad && (
            <form className={styles.form} onSubmit={submit}>
              <label htmlFor={labelId + "-decision"}>Review decision</label>
              <select
                id={labelId + "-decision"}
                value={decision}
                required
                disabled={!canDecide}
                onChange={(event) => {
                  if (attemptRef.current !== null || sendingRef.current) return;
                  setDraft((previous) => ({
                    ...previous,
                    scope,
                    decision: event.target.value as Choice,
                  }));
                }}
              >
                <option value="">Choose a decision</option>
                <option value="accepted">Accept assertion</option>
                <option value="rejected">Reject assertion</option>
                <option value="superseded">Mark superseded</option>
              </select>
              <label htmlFor={labelId + "-reason"}>Review reason</label>
              <textarea
                id={labelId + "-reason"}
                required
                maxLength={4000}
                rows={4}
                value={reason}
                disabled={!canDecide}
                onChange={(event) => {
                  if (attemptRef.current !== null || sendingRef.current) return;
                  setDraft((previous) => ({
                    ...previous,
                    scope,
                    reason: event.target.value,
                  }));
                }}
              />
              {!currentAttempt && (
                <button type="submit" disabled={!canDecide}>
                  Save review decision
                </button>
              )}
            </form>
          )}
          {!currentAttempt && (
            <button
              type="button"
              className={styles.selfStart}
              disabled={frozen}
              onClick={reloadReview}
            >
              Reload current state
            </button>
          )}
        </>
      )}
      {foreignAttempt && (
        <p role="status" className={styles.notice}>
          An earlier review is unresolved. Return to its assertion to retry
          before starting another review.
        </p>
      )}
      {currentAttempt && (
        <div className={styles.notice}>
          <p role="status">
            {sending
              ? "Saving review decision..."
              : "This review may have been saved. Keep this page open and retry the same decision to confirm its receipt."}
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
      {currentIssue && <p role="alert">{currentIssue.message}</p>}
      {currentReceipt && (
        <section className={styles.card} aria-label="Confirmed review receipt">
          <h3>Review receipt confirmed</h3>
          <p role="status">
            {currentReceipt.value.replayed
              ? "Original review receipt replayed."
              : "Review decision receipt recorded."}
          </p>
          <p>
            Lifecycle in this receipt: {currentReceipt.value.record.lifecycle}.
            Content version: {currentReceipt.value.record.version}.
          </p>
          <p>
            Correlation ID: <code>{currentReceipt.value.correlationId}</code>
          </p>
          <p className={styles.hint}>
            This is the submitted review&apos;s historical receipt. Reload
            current state to check later changes.
          </p>
        </section>
      )}
    </section>
  );
}
