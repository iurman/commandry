"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { WorkItemComment } from "@commandry/contracts";
import { Button, WorkCommentCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export default function WorkDiscussion({ workItemId }: { workItemId: string }) {
  const path = `/api/v1/work-items/${encodeURIComponent(workItemId)}/comments`;
  const [comments, setComments] = useState<WorkItemComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<WorkItemComment>>(pagePath(path))
      .then((page) => {
        if (active) {
          setComments(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Discussion is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await apiJson<WorkItemComment>(path, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setComments((current) => [saved, ...current]);
      setBody("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add comment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<WorkItemComment>>(
        pagePath(path, cursor),
      );
      setComments((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load discussion.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="discussion"
      className="cmd-detail-document"
      aria-labelledby="work-discussion-heading"
    >
      <p className="cmd-eyebrow">Manual local discussion / Preserved</p>
      <h2 id="work-discussion-heading">Task discussion</h2>
      <p>
        Add context without changing the task&apos;s original capture. Comments
        are immutable local records with their own audit entries.
      </p>
      <form className="cmd-form" onSubmit={(event) => void post(event)}>
        <label htmlFor="work-comment-body">New comment</label>
        <textarea
          id="work-comment-body"
          maxLength={5_000}
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button type="submit" disabled={busy || !body.trim()}>
          {busy ? "Saving comment..." : "Add comment"}
        </Button>
      </form>
      {error && (
        <p className="cmd-form-error" role="alert">
          {error}
        </p>
      )}
      {comments.length === 0 && !error && (
        <p className="cmd-form-hint">No comments recorded yet.</p>
      )}
      <ul className="cmd-record-list" aria-label="Task comments">
        {comments.map((comment) => (
          <li key={comment.id}>
            <WorkCommentCard comment={comment} />
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={() => void more()}>
          Load older comments
        </Button>
      )}
    </section>
  );
}
