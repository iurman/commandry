"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, RecordEmptyState, WorkVerificationCard } from "@commandry/ui";
import type {
  WorkItemAcceptance,
  WorkItemAcceptanceRevision,
  WorkItemAttachment,
  WorkItemVerification,
} from "@commandry/contracts";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function WorkAcceptance({
  workItemId,
  status,
}: {
  workItemId: string;
  status: "open" | "done";
}) {
  const root = `/api/v1/work-items/${encodeURIComponent(workItemId)}`;
  const [acceptance, setAcceptance] = useState<WorkItemAcceptance | null>(null);
  const [draft, setDraft] = useState("");
  const [revisions, setRevisions] = useState<WorkItemAcceptanceRevision[]>([]);
  const [revisionCursor, setRevisionCursor] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WorkItemVerification[]>([]);
  const [reviewCursor, setReviewCursor] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<WorkItemAttachment[]>([]);
  const [attachmentCursor, setAttachmentCursor] = useState<string | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState("");
  const [result, setResult] = useState<"met" | "not_met">("met");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [loadingMore, setLoadingMore] = useState<
    "revisions" | "reviews" | "attachments" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<WorkItemAcceptance>(`${root}/acceptance`),
      apiJson<PageResponse<WorkItemAcceptanceRevision>>(
        pagePath(`${root}/acceptance-revisions`),
      ),
      apiJson<PageResponse<WorkItemVerification>>(
        pagePath(`${root}/verifications`),
      ),
      apiJson<PageResponse<WorkItemAttachment>>(
        pagePath(`${root}/attachments`),
      ),
    ])
      .then(([current, revisionPage, reviewPage, attachmentPage]) => {
        if (!active) return;
        setAcceptance(current);
        setDraft(current.criteria);
        setRevisions(revisionPage.items);
        setRevisionCursor(revisionPage.nextCursor);
        setReviews(reviewPage.items);
        setReviewCursor(reviewPage.nextCursor);
        setAttachments(attachmentPage.items);
        setAttachmentCursor(attachmentPage.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(errorMessage(cause, "Task acceptance is unavailable."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [root]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptance || saving) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const current = await apiJson<WorkItemAcceptance>(`${root}/acceptance`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: acceptance.version,
          criteria: draft.trim(),
        }),
      });
      const revisionPage = await apiJson<
        PageResponse<WorkItemAcceptanceRevision>
      >(pagePath(`${root}/acceptance-revisions`));
      setAcceptance(current);
      setDraft(current.criteria);
      setRevisions(revisionPage.items);
      setRevisionCursor(revisionPage.nextCursor);
      setFeedback("Acceptance criteria saved with an immutable revision.");
    } catch (cause) {
      setError(errorMessage(cause, "Could not save acceptance criteria."));
    } finally {
      setSaving(false);
    }
  }

  async function recordReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptance?.criteria.trim() || !selectedAttachmentId || reviewing)
      return;
    setReviewing(true);
    setError(null);
    setFeedback(null);
    try {
      const review = await apiJson<WorkItemVerification>(
        `${root}/verifications`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedAcceptanceVersion: acceptance.version,
            attachmentId: selectedAttachmentId,
            result,
            note: note.trim(),
          }),
        },
      );
      setReviews((current) => [
        review,
        ...current.filter((known) => known.id !== review.id),
      ]);
      setNote("");
      setFeedback(
        "Manual local review recorded. The linked source stays available for inspection.",
      );
    } catch (cause) {
      setError(errorMessage(cause, "Could not record the review."));
    } finally {
      setReviewing(false);
    }
  }

  async function refreshAttachments() {
    setError(null);
    try {
      const page = await apiJson<PageResponse<WorkItemAttachment>>(
        pagePath(`${root}/attachments`),
      );
      setAttachments(page.items);
      setAttachmentCursor(page.nextCursor);
      if (!page.items.some((item) => item.id === selectedAttachmentId))
        setSelectedAttachmentId("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not refresh attached documents."));
    }
  }

  async function loadMore(kind: "revisions" | "reviews" | "attachments") {
    const cursor =
      kind === "revisions"
        ? revisionCursor
        : kind === "reviews"
          ? reviewCursor
          : attachmentCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(kind);
    setError(null);
    try {
      if (kind === "revisions") {
        const page = await apiJson<PageResponse<WorkItemAcceptanceRevision>>(
          pagePath(`${root}/acceptance-revisions`, cursor),
        );
        setRevisions((current) => [...current, ...page.items]);
        setRevisionCursor(page.nextCursor);
      } else if (kind === "reviews") {
        const page = await apiJson<PageResponse<WorkItemVerification>>(
          pagePath(`${root}/verifications`, cursor),
        );
        setReviews((current) => [...current, ...page.items]);
        setReviewCursor(page.nextCursor);
      } else {
        const page = await apiJson<PageResponse<WorkItemAttachment>>(
          pagePath(`${root}/attachments`, cursor),
        );
        setAttachments((current) => [...current, ...page.items]);
        setAttachmentCursor(page.nextCursor);
      }
    } catch (cause) {
      setError(errorMessage(cause, "Could not load older task evidence."));
    } finally {
      setLoadingMore(null);
    }
  }

  const latestCurrentReview = reviews.find(
    (review) => review.acceptanceVersion === acceptance?.version,
  );

  return (
    <section
      className="cmd-detail-document"
      aria-labelledby="work-acceptance-heading"
    >
      <p className="cmd-eyebrow">Local work review / Source linked</p>
      <h2 id="work-acceptance-heading">Acceptance and completion evidence</h2>
      <p>
        State the result this task needs. Attach an original Knowledge document,
        then record a manual review against the current criteria. A review is a
        claim with inspectable evidence, not an automated test result.
      </p>
      {loading && <p role="status">Loading task acceptance...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      {acceptance && (
        <>
          <p>
            Current criteria: version {acceptance.version}.{" "}
            {acceptance.criteria.trim()
              ? latestCurrentReview
                ? `Latest local review: ${latestCurrentReview.result.replaceAll("_", " ")}.`
                : "No review recorded for this version."
              : "No criteria recorded."}
          </p>
          <form className="cmd-form" onSubmit={save}>
            <label htmlFor="work-acceptance-criteria">
              Acceptance criteria
            </label>
            <textarea
              id="work-acceptance-criteria"
              value={draft}
              maxLength={10_000}
              rows={5}
              disabled={status !== "open"}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              type="submit"
              disabled={
                status !== "open" ||
                saving ||
                draft.trim() === acceptance.criteria
              }
            >
              {saving ? "Saving criteria..." : "Save criteria"}
            </Button>
          </form>
          {status === "done" && (
            <p>Reopen this task to revise criteria or record another review.</p>
          )}
          <h3>Criteria history</h3>
          {revisions.length === 0 && <p>No criteria revisions recorded.</p>}
          {revisions.length > 0 && (
            <ol>
              {revisions.map((revision) => (
                <li key={revision.id}>
                  Version {revision.version} at{" "}
                  <time dateTime={revision.createdAt}>
                    {revision.createdAt}
                  </time>
                  : {revision.criteria || "Criteria cleared"}.{" "}
                  <a
                    href={`/api/v1/work-item-acceptance-revisions/${revision.id}`}
                  >
                    Exact revision
                  </a>
                </li>
              ))}
            </ol>
          )}
          {revisionCursor && (
            <Button
              disabled={loadingMore !== null}
              onClick={() => loadMore("revisions")}
            >
              {loadingMore === "revisions"
                ? "Loading..."
                : "Load older criteria"}
            </Button>
          )}
          <h3>Record manual review</h3>
          <p>
            By default, marking a task with criteria done requires a current met
            review citing an attached original document. Local configuration can
            change this gate.
          </p>
          <Button type="button" onClick={refreshAttachments}>
            Refresh attached documents
          </Button>
          {attachments.length === 0 && (
            <RecordEmptyState
              title="No attached document yet"
              description="Attach a Knowledge document above, then refresh this list."
            />
          )}
          <form className="cmd-form" onSubmit={recordReview}>
            <label htmlFor="work-review-document">Evidence document</label>
            <select
              id="work-review-document"
              value={selectedAttachmentId}
              disabled={status !== "open"}
              onChange={(event) => setSelectedAttachmentId(event.target.value)}
            >
              <option value="">Choose an attached original document</option>
              {attachments.map((attachment) => (
                <option key={attachment.id} value={attachment.id}>
                  {attachment.documentTitle}
                </option>
              ))}
            </select>
            {attachmentCursor && (
              <Button
                type="button"
                disabled={loadingMore !== null}
                onClick={() => loadMore("attachments")}
              >
                {loadingMore === "attachments"
                  ? "Loading..."
                  : "Load more attached documents"}
              </Button>
            )}
            <label htmlFor="work-review-result">Review result</label>
            <select
              id="work-review-result"
              value={result}
              disabled={status !== "open"}
              onChange={(event) =>
                setResult(event.target.value as "met" | "not_met")
              }
            >
              <option value="met">Criteria claimed met</option>
              <option value="not_met">Criteria not met</option>
            </select>
            <label htmlFor="work-review-note">
              Reason and evidence summary
            </label>
            <textarea
              id="work-review-note"
              value={note}
              rows={3}
              maxLength={5_000}
              disabled={status !== "open"}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button
              type="submit"
              disabled={
                status !== "open" ||
                reviewing ||
                !acceptance.criteria.trim() ||
                !selectedAttachmentId ||
                !note.trim()
              }
            >
              {reviewing ? "Recording review..." : "Record manual review"}
            </Button>
          </form>
          <h3>Review history</h3>
          {reviews.length === 0 && <p>No manual reviews recorded.</p>}
          <div className="cmd-record-grid">
            {reviews.map((review) => (
              <WorkVerificationCard
                key={review.id}
                review={review}
                currentVersion={acceptance.version}
              />
            ))}
          </div>
          {reviewCursor && (
            <Button
              disabled={loadingMore !== null}
              onClick={() => loadMore("reviews")}
            >
              {loadingMore === "reviews" ? "Loading..." : "Load older reviews"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
