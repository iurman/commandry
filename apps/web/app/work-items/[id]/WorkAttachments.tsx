"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, RecordEmptyState, WorkAttachmentCard } from "@commandry/ui";
import type { WorkItemAttachment } from "@commandry/contracts";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

interface DocumentChoice {
  id: string;
  kind: "note" | "link" | "document";
  title: string;
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function WorkAttachments({
  workItemId,
  projectId,
}: {
  workItemId: string;
  projectId: string;
}) {
  const attachmentPath = `/api/v1/work-items/${encodeURIComponent(workItemId)}/attachments`;
  const documentPath = `/api/v1/projects/${encodeURIComponent(projectId)}/knowledge`;
  const [attachments, setAttachments] = useState<WorkItemAttachment[]>([]);
  const [attachmentCursor, setAttachmentCursor] = useState<string | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(true);
  const [attachmentLoadingMore, setAttachmentLoadingMore] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [choices, setChoices] = useState<DocumentChoice[]>([]);
  const [choiceCursor, setChoiceCursor] = useState<string | null>(null);
  const [choicesLoading, setChoicesLoading] = useState(true);
  const [choicesLoadingMore, setChoicesLoadingMore] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<WorkItemAttachment>>(pagePath(attachmentPath))
      .then((page) => {
        if (!active) return;
        setAttachments(page.items);
        setAttachmentCursor(page.nextCursor);
        setAttachmentError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setAttachmentError(
            errorMessage(cause, "Task attachments are unavailable."),
          );
      })
      .finally(() => {
        if (active) setAttachmentLoading(false);
      });
    apiJson<PageResponse<DocumentChoice>>(pagePath(documentPath))
      .then((page) => {
        if (!active) return;
        setChoices(page.items.filter((choice) => choice.kind === "document"));
        setChoiceCursor(page.nextCursor);
        setChoicesError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setChoicesError(
            errorMessage(cause, "Project documents are unavailable."),
          );
      })
      .finally(() => {
        if (active) setChoicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attachmentPath, documentPath]);

  async function loadMoreAttachments() {
    if (!attachmentCursor || attachmentLoadingMore) return;
    setAttachmentLoadingMore(true);
    setAttachmentError(null);
    try {
      const page = await apiJson<PageResponse<WorkItemAttachment>>(
        pagePath(attachmentPath, attachmentCursor),
      );
      setAttachments((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((known) => known.id === item.id),
        ),
      ]);
      setAttachmentCursor(page.nextCursor);
    } catch (cause) {
      setAttachmentError(
        errorMessage(cause, "Could not load more attachments."),
      );
    } finally {
      setAttachmentLoadingMore(false);
    }
  }

  async function loadMoreChoices() {
    if (!choiceCursor || choicesLoadingMore) return;
    setChoicesLoadingMore(true);
    setChoicesError(null);
    try {
      const page = await apiJson<PageResponse<DocumentChoice>>(
        pagePath(documentPath, choiceCursor),
      );
      setChoices((current) => [
        ...current,
        ...page.items.filter(
          (choice) =>
            choice.kind === "document" &&
            !current.some((known) => known.id === choice.id),
        ),
      ]);
      setChoiceCursor(page.nextCursor);
    } catch (cause) {
      setChoicesError(errorMessage(cause, "Could not load more documents."));
    } finally {
      setChoicesLoadingMore(false);
    }
  }

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || saving) return;
    setSaving(true);
    setAttachmentError(null);
    setFeedback(null);
    try {
      const created = await apiJson<WorkItemAttachment>(attachmentPath, {
        method: "POST",
        body: JSON.stringify({ knowledgeItemId: selectedId }),
      });
      setAttachments((current) => [created, ...current]);
      setSelectedId("");
      setFeedback(
        "Document linked to this task. Select it explicitly when creating a new execution packet; existing packets stay unchanged.",
      );
    } catch (cause) {
      setAttachmentError(errorMessage(cause, "Could not attach document."));
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (archivingId) return;
    setArchivingId(id);
    setAttachmentError(null);
    setFeedback(null);
    try {
      await apiJson(`/api/v1/work-item-attachments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setAttachments((current) => current.filter((item) => item.id !== id));
      setFeedback(
        "Task link archived. The Knowledge document and original file remain unchanged.",
      );
    } catch (cause) {
      setAttachmentError(errorMessage(cause, "Could not remove task link."));
    } finally {
      setArchivingId(null);
    }
  }

  const available = choices.filter(
    (choice) => !attachments.some((item) => item.knowledgeItemId === choice.id),
  );

  return (
    <section
      className="cmd-detail-document"
      aria-labelledby="work-attachments-heading"
    >
      <p className="cmd-eyebrow">Project Knowledge / Original files</p>
      <h2 id="work-attachments-heading">Task attachments</h2>
      <p>
        Link a document already filed in this project. The relation can be
        archived; its original file and Knowledge context stay separate. New
        execution packets include only the Knowledge records you select below.
      </p>
      {attachmentLoading && <p role="status">Loading task attachments...</p>}
      {attachmentError && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {attachmentError}
        </p>
      )}
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      {!attachmentLoading && attachments.length === 0 && !attachmentError && (
        <RecordEmptyState
          title="No documents attached"
          description="File an original in the Inbox as a Knowledge document, then link it here."
        />
      )}
      {attachments.length > 0 && (
        <ul className="cmd-record-list" aria-label="Task attachments">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <WorkAttachmentCard
                attachment={attachment}
                archiving={archivingId === attachment.id}
                onArchive={() => archive(attachment.id)}
                showWorkLink={false}
              />
            </li>
          ))}
        </ul>
      )}
      {attachmentCursor && (
        <Button disabled={attachmentLoadingMore} onClick={loadMoreAttachments}>
          {attachmentLoadingMore ? "Loading..." : "Load more attachments"}
        </Button>
      )}
      <form className="cmd-form" onSubmit={attach}>
        <label htmlFor="work-attachment-document">Project document</label>
        <select
          id="work-attachment-document"
          disabled={choicesLoading || available.length === 0}
          onChange={(event) => setSelectedId(event.target.value)}
          value={selectedId}
        >
          <option value="">Choose a Knowledge document</option>
          {available.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.title}
            </option>
          ))}
        </select>
        {choicesLoading && <p role="status">Loading project documents...</p>}
        {choicesError && (
          <p className="cmd-inline-state cmd-error" role="alert">
            {choicesError}
          </p>
        )}
        {!choicesLoading && choices.length === 0 && !choiceCursor && (
          <p className="cmd-form-hint">
            No project documents yet. <a href="/inbox">Capture a file</a> and
            file it to this project first.
          </p>
        )}
        {choiceCursor && (
          <Button disabled={choicesLoadingMore} onClick={loadMoreChoices}>
            {choicesLoadingMore ? "Loading..." : "Load more Knowledge choices"}
          </Button>
        )}
        <Button disabled={saving || !selectedId} type="submit">
          {saving ? "Linking document..." : "Attach document"}
        </Button>
      </form>
    </section>
  );
}
