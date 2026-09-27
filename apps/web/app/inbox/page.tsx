"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  KNOWLEDGE_TEXT_TYPES,
  type KnowledgeTextType,
} from "@commandry/domain";
import {
  AppShell,
  Button,
  CaptureOriginal,
  CaptureTriageSummary,
  knowledgeTypeLabel,
  RecordEmptyState,
  StatusBadge,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";
import type {
  CaptureRecord,
  CaptureTriageReview,
  FiledCaptureResponse,
} from "./api";

type FilingKind = "task" | "note" | "link" | "document";

function preview(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function linkedCaptureId() {
  return new URLSearchParams(window.location.search).get("captureId");
}

export default function InboxPage() {
  const detailRef = useRef<HTMLElement>(null);
  const filingTouched = useRef(false);
  const suggestionPrefilledFor = useRef<string | null>(null);
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaptureRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const [triageReview, setTriageReview] = useState<CaptureTriageReview | null>(
    null,
  );
  const [triageError, setTriageError] = useState<string | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageSaving, setTriageSaving] = useState(false);
  const [triageFeedback, setTriageFeedback] = useState<string | null>(null);
  const [triageReload, setTriageReload] = useState(0);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [nextProjectCursor, setNextProjectCursor] = useState<string | null>(
    null,
  );
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsLoadingMore, setProjectsLoadingMore] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [inputType, setInputType] = useState<"text" | "url" | "file">("text");
  const [textDraft, setTextDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [fileDraft, setFileDraft] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [kind, setKind] = useState<FilingKind>("task");
  const [workType, setWorkType] = useState<"task" | "initiative">("task");
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeTextType>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [filing, setFiling] = useState(false);
  const [filingError, setFilingError] = useState<string | null>(null);
  const [filingFeedback, setFilingFeedback] = useState<string | null>(null);
  const originalContent = inputType === "text" ? textDraft : urlDraft;
  const detailLoading = Boolean(selectedId && !detail && !detailError);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<CaptureRecord>>(pagePath("/api/v1/captures"))
      .then((page) => {
        if (!active) return;
        setCaptures((current) => [
          ...current.filter(
            (item) => !page.items.some((saved) => saved.id === item.id),
          ),
          ...page.items,
        ]);
        setNextCursor(page.nextCursor);
        setSelectedId(
          (current) =>
            current ?? linkedCaptureId() ?? page.items[0]?.id ?? null,
        );
        setListError(null);
      })
      .catch((cause: unknown) => {
        if (active) {
          setListError(message(cause, "Inbox is unavailable."));
          setSelectedId((current) => current ?? linkedCaptureId());
        }
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects"))
      .then((page) => {
        if (!active) return;
        setProjects(page.items);
        setNextProjectCursor(page.nextCursor);
        setProjectsError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setProjectsError(message(cause, "Projects are unavailable."));
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    apiJson<CaptureRecord>(`/api/v1/captures/${encodeURIComponent(selectedId)}`)
      .then((record) => {
        if (!active) return;
        setDetail(record);
        setCaptures((current) =>
          current.some((item) => item.id === record.id)
            ? current.map((item) => (item.id === record.id ? record : item))
            : [record, ...current],
        );
        setProjectId(record.projectId ?? "");
        if (record.inputType === "file") {
          setKind("document");
          setTitle(record.file?.originalName ?? "");
        }
      })
      .catch((cause: unknown) => {
        if (active) setDetailError(message(cause, "Capture is unavailable."));
      });
    return () => {
      active = false;
    };
  }, [selectedId, detailReload]);

  useEffect(() => {
    if (!selectedId || detail?.inputType === "file") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function loadReview() {
      if (!selectedId || !active) return;
      setTriageLoading(true);
      try {
        const review = await apiJson<CaptureTriageReview>(
          `/api/v1/captures/${encodeURIComponent(selectedId)}/triage`,
        );
        if (!active) return;
        setTriageReview(review);
        setTriageError(null);
        if (
          review.suggestion &&
          !review.decision &&
          !filingTouched.current &&
          suggestionPrefilledFor.current !== review.suggestion.id
        ) {
          setKind(review.suggestion.kind);
          setWorkType("task");
          setKnowledgeType("note");
          setTitle(review.suggestion.title);
          setProjectId(review.suggestion.proposedProjectId ?? "");
          suggestionPrefilledFor.current = review.suggestion.id;
        } else if (!review.suggestion && detail?.state === "unfiled") {
          attempts += 1;
          timer = setTimeout(
            loadReview,
            Math.min(5_000, 1_000 + attempts * 250),
          );
        }
      } catch (cause) {
        if (active) {
          setTriageError(message(cause, "Triage suggestion is unavailable."));
          timer = setTimeout(loadReview, 5_000);
        }
      } finally {
        if (active) setTriageLoading(false);
      }
    }
    void loadReview();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [selectedId, triageReload, detail?.state, detail?.inputType]);

  function selectCapture(id: string) {
    detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    if (id === selectedId) return;
    setSelectedId(id);
    filingTouched.current = false;
    suggestionPrefilledFor.current = null;
    setDetail(null);
    setDetailError(null);
    setKind("task");
    setWorkType("task");
    setKnowledgeType("note");
    setTitle("");
    setBody("");
    setProjectId("");
    setFilingError(null);
    setFilingFeedback(null);
    setTriageReview(null);
    setTriageError(null);
    setTriageFeedback(null);
  }

  async function queueSuggestion() {
    if (
      !detail ||
      detail.inputType === "file" ||
      detail.state === "filed" ||
      triageLoading
    )
      return;
    setTriageLoading(true);
    setTriageError(null);
    try {
      await apiJson(
        `/api/v1/captures/${encodeURIComponent(detail.id)}/triage-suggestion`,
        {
          method: "POST",
        },
      );
      setTriageFeedback(
        "Rule-based suggestion queued. The original capture remains unchanged.",
      );
      setTriageReload((value) => value + 1);
    } catch (cause) {
      setTriageError(message(cause, "Could not queue a local suggestion."));
    } finally {
      setTriageLoading(false);
    }
  }

  async function reviewSuggestion(decision: "approve" | "reject") {
    if (
      !detail ||
      !triageReview?.suggestion ||
      triageReview.decision ||
      triageSaving
    )
      return;
    if (decision === "approve" && (!projectId || !title.trim())) return;
    setTriageSaving(true);
    setTriageError(null);
    try {
      const result = await apiJson<{
        capture: CaptureRecord;
        decision: CaptureTriageReview["decision"];
        suggestion: CaptureTriageReview["suggestion"];
        record: { id: string } | null;
      }>(`/api/v1/captures/${encodeURIComponent(detail.id)}/triage`, {
        method: "POST",
        body: JSON.stringify(
          decision === "approve"
            ? {
                decision,
                projectId,
                kind,
                title: title.trim(),
                ...(body.trim() ? { body } : {}),
              }
            : { decision },
        ),
      });
      setTriageReview({
        suggestion: result.suggestion,
        decision: result.decision,
      });
      setDetail(result.capture);
      setCaptures((current) =>
        current.map((item) =>
          item.id === result.capture.id ? result.capture : item,
        ),
      );
      setTriageFeedback(
        decision === "approve"
          ? "Reviewed suggestion filed. The original capture is unchanged."
          : "Suggestion rejected. The original capture stays in the Inbox for manual filing.",
      );
    } catch (cause) {
      setTriageError(message(cause, "Could not review suggestion."));
    } finally {
      setTriageSaving(false);
    }
  }

  async function loadMoreCaptures() {
    if (!nextCursor || listLoadingMore) return;
    setListLoadingMore(true);
    setListError(null);
    try {
      const page = await apiJson<PageResponse<CaptureRecord>>(
        pagePath("/api/v1/captures", nextCursor),
      );
      setCaptures((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setListError(message(cause, "Could not load more captures."));
    } finally {
      setListLoadingMore(false);
    }
  }

  async function loadMoreProjects() {
    if (!nextProjectCursor || projectsLoadingMore) return;
    setProjectsLoadingMore(true);
    setProjectsError(null);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", nextProjectCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextProjectCursor(page.nextCursor);
    } catch (cause) {
      setProjectsError(message(cause, "Could not load more projects."));
    } finally {
      setProjectsLoadingMore(false);
    }
  }

  async function captureInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      (inputType === "file" ? !fileDraft : !originalContent.trim()) ||
      capturing
    )
      return;
    setCapturing(true);
    setCaptureError(null);
    setCaptureFeedback(null);
    try {
      let saved: CaptureRecord;
      if (inputType === "file" && fileDraft) {
        const form = new FormData();
        form.set("file", fileDraft);
        const response = await fetch("/api/v1/captures/files", {
          method: "POST",
          body: form,
        });
        if (!response.ok) {
          const error = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(
            error?.message ?? `File upload failed (${response.status})`,
          );
        }
        saved = (await response.json()) as CaptureRecord;
      } else {
        saved = await apiJson<CaptureRecord>("/api/v1/captures", {
          method: "POST",
          body: JSON.stringify({ inputType, originalContent }),
        });
      }
      setCaptures((current) => [saved, ...current]);
      selectCapture(saved.id);
      if (inputType === "text") setTextDraft("");
      else if (inputType === "url") setUrlDraft("");
      else {
        setFileDraft(null);
        setFileInputKey((value) => value + 1);
      }
      setCaptureFeedback("Captured locally. The original is preserved below.");
    } catch (cause) {
      setCaptureError(message(cause, "Could not save capture."));
    } finally {
      setCapturing(false);
    }
  }

  async function fileCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !detail ||
      detail.state === "filed" ||
      !projectId ||
      !title.trim() ||
      filing
    )
      return;
    setFiling(true);
    setFilingError(null);
    setFilingFeedback(null);
    try {
      const result = await apiJson<FiledCaptureResponse>(
        `/api/v1/captures/${encodeURIComponent(detail.id)}/file`,
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            kind,
            ...(kind === "task" ? { workType } : {}),
            ...(kind === "note" ? { knowledgeType } : {}),
            title: title.trim(),
            ...(body.trim() ? { body } : {}),
          }),
        },
      );
      setDetail(result.capture);
      setCaptures((current) =>
        current.map((item) =>
          item.id === result.capture.id ? result.capture : item,
        ),
      );
      const filedType =
        kind === "task"
          ? workType
          : kind === "note"
            ? knowledgeTypeLabel(knowledgeType).toLowerCase()
            : kind;
      setFilingFeedback(
        `Filed as ${/^[aeiou]/.test(filedType) ? "an" : "a"} ${filedType} in the selected project.`,
      );
    } catch (cause) {
      setFilingError(message(cause, "Could not file capture."));
    } finally {
      setFiling(false);
    }
  }

  const selectedProject = projects.find(
    (project) => project.id === detail?.projectId,
  );

  return (
    <AppShell current="Inbox">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Capture / Triage</p>
          <h1>Inbox</h1>
          <p className="cmd-lead">
            Put the thought somewhere safe now. Choose its project and shape
            when you are ready.
          </p>
        </div>
        <span className="cmd-headline-mark" aria-hidden="true">
          02 / Preserve
        </span>
      </header>

      <div className="cmd-inbox-grid">
        <section
          className="cmd-create-panel cmd-inbox-compose"
          aria-labelledby="capture-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Quick capture</p>
              <h2 id="capture-heading">Save the original</h2>
            </div>
            <span className="cmd-inbox-step">01</span>
          </div>
          <p className="cmd-form-intro">
            Text and URLs are stored as entered. Files up to 2 MiB keep their
            exact bytes and SHA-256 in local PostgreSQL. This form does not open
            or fetch a URL.
          </p>
          <div
            className="cmd-capture-type"
            role="group"
            aria-label="Capture type"
          >
            <Button
              aria-pressed={inputType === "text"}
              className={inputType === "text" ? "cmd-capture-type-active" : ""}
              onClick={() => setInputType("text")}
            >
              Text
            </Button>
            <Button
              aria-pressed={inputType === "url"}
              className={inputType === "url" ? "cmd-capture-type-active" : ""}
              onClick={() => setInputType("url")}
            >
              URL
            </Button>
            <Button
              aria-pressed={inputType === "file"}
              className={inputType === "file" ? "cmd-capture-type-active" : ""}
              onClick={() => setInputType("file")}
            >
              File
            </Button>
          </div>
          <form className="cmd-form" onSubmit={captureInput}>
            <label htmlFor="capture-original">
              {inputType === "text"
                ? "Original text"
                : inputType === "url"
                  ? "Original URL"
                  : "Original file"}
              <span aria-hidden="true"> *</span>
            </label>
            {inputType === "text" ? (
              <textarea
                id="capture-original"
                onChange={(event) => setTextDraft(event.target.value)}
                placeholder="A thought, a question, or something to return to..."
                required
                rows={5}
                value={originalContent}
              />
            ) : inputType === "url" ? (
              <input
                id="capture-original"
                onChange={(event) => setUrlDraft(event.target.value)}
                placeholder="https://example.com/reference"
                required
                type="url"
                value={originalContent}
              />
            ) : (
              <input
                id="capture-original"
                key={fileInputKey}
                type="file"
                onChange={(event) =>
                  setFileDraft(event.target.files?.[0] ?? null)
                }
                required
              />
            )}
            {captureError && (
              <p className="cmd-form-error" role="alert">
                {captureError}
              </p>
            )}
            {captureFeedback && (
              <p className="cmd-form-success" role="status">
                {captureFeedback}
              </p>
            )}
            <Button
              disabled={
                capturing ||
                (inputType === "file" ? !fileDraft : !originalContent.trim())
              }
              type="submit"
              variant="primary"
            >
              {capturing ? "Saving capture..." : "Save to Inbox"}
            </Button>
          </form>
        </section>

        <section
          className="cmd-inbox-queue"
          aria-labelledby="inbox-queue-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Source ledger</p>
              <h2 id="inbox-queue-heading">Captured items</h2>
            </div>
            {!listLoading && (
              <span className="cmd-count">{captures.length} shown</span>
            )}
          </div>
          {listLoading && (
            <p className="cmd-inline-state" role="status">
              Loading captures...
            </p>
          )}
          {listError && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {listError}
            </p>
          )}
          {!listLoading &&
            !listError &&
            captures.length === 0 &&
            !selectedId && (
              <RecordEmptyState
                description="Capture text, a URL, or a file above. It will wait here until you file it."
                title="Inbox is clear"
              />
            )}
          {captures.length > 0 && (
            <ul className="cmd-inbox-list" aria-label="Captured items">
              {captures.map((capture) => (
                <li key={capture.id}>
                  <button
                    aria-pressed={selectedId === capture.id}
                    className={`cmd-inbox-item ${selectedId === capture.id ? "cmd-inbox-item-selected" : ""}`}
                    onClick={() => selectCapture(capture.id)}
                    type="button"
                  >
                    <span className="cmd-inbox-item-top">
                      <span className="cmd-inbox-item-kind">
                        {capture.inputType === "url"
                          ? "URL"
                          : capture.inputType === "file"
                            ? "File"
                            : "Text"}
                      </span>
                      <span className="cmd-inbox-item-state">
                        {capture.state === "filed" ? "Filed" : "To file"}
                      </span>
                    </span>
                    <span className="cmd-inbox-item-preview">
                      {preview(
                        capture.file?.originalName ?? capture.originalContent,
                      )}
                    </span>
                    <span className="cmd-inbox-item-time">
                      {capture.createdAt}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <Button disabled={listLoadingMore} onClick={loadMoreCaptures}>
              {listLoadingMore ? "Loading..." : "Load more captures"}
            </Button>
          )}
        </section>

        <section
          className="cmd-inbox-detail"
          aria-labelledby="capture-detail-heading"
          ref={detailRef}
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Review / File</p>
              <h2 id="capture-detail-heading">Capture detail</h2>
            </div>
            <span className="cmd-inbox-step">02</span>
          </div>
          {!selectedId && !listLoading && (
            <RecordEmptyState
              description="Select an item in the ledger to review its original and file a record."
              title="Select a capture"
            />
          )}
          {detailLoading && (
            <p className="cmd-inline-state" role="status">
              Loading original...
            </p>
          )}
          {detailError && (
            <div>
              <p className="cmd-inline-state cmd-error" role="alert">
                {detailError}
              </p>
              <Button
                onClick={() => {
                  setDetailError(null);
                  setDetailReload((value) => value + 1);
                }}
              >
                Retry capture
              </Button>
            </div>
          )}
          {detail && (
            <div className="cmd-inbox-detail-stack">
              <div className="cmd-inbox-detail-meta">
                <StatusBadge
                  dimension="lifecycle"
                  label={detail.state === "filed" ? "Filed" : "Unfiled"}
                  tone={detail.state === "filed" ? "positive" : "caution"}
                />
                <span className="cmd-count">Capture ID {detail.id}</span>
              </div>
              <CaptureOriginal capture={detail} />
              {detail.inputType !== "file" && (
                <section
                  className="cmd-inbox-file-form"
                  aria-labelledby="triage-suggestion-heading"
                >
                  <p className="cmd-eyebrow">
                    Reviewable local rule / No automatic filing
                  </p>
                  <h3 id="triage-suggestion-heading">Capture suggestion</h3>
                  {triageLoading && !triageReview?.suggestion && (
                    <p className="cmd-inline-state" role="status">
                      Checking for a suggestion...
                    </p>
                  )}
                  {!triageLoading &&
                    !triageReview?.suggestion &&
                    detail.state === "unfiled" && (
                      <div>
                        <p>
                          No suggestion is ready yet. The local worker may still
                          be processing; the original is safe in the Inbox, and
                          manual filing remains available.
                        </p>
                        <Button onClick={queueSuggestion} type="button">
                          Generate local suggestion
                        </Button>
                      </div>
                    )}
                  {triageReview?.suggestion && (
                    <CaptureTriageSummary
                      captureState={detail.state}
                      onReject={() => reviewSuggestion("reject")}
                      review={{
                        suggestion: triageReview.suggestion,
                        decision: triageReview.decision,
                      }}
                      saving={triageSaving}
                    />
                  )}
                  {triageError && (
                    <p className="cmd-form-error" role="alert">
                      {triageError}
                    </p>
                  )}
                  {triageFeedback && (
                    <p className="cmd-form-success" role="status">
                      {triageFeedback}
                    </p>
                  )}
                </section>
              )}
              {detail.state === "filed" && detail.filedRecord ? (
                <div className="cmd-inbox-filed">
                  <p className="cmd-eyebrow">Connected record</p>
                  <h3>
                    Filed as{" "}
                    {detail.filedRecord.kind === "task"
                      ? "Work"
                      : detail.filedRecord.kind === "note"
                        ? "Knowledge"
                        : detail.filedRecord.kind}
                  </h3>
                  <p>
                    The{" "}
                    {detail.filedRecord.kind === "task"
                      ? "Work item"
                      : detail.filedRecord.kind === "note"
                        ? "Knowledge item"
                        : detail.filedRecord.kind}{" "}
                    links back to this unchanged capture.
                    {detail.filedAt ? ` Filed at ${detail.filedAt}.` : ""}
                  </p>
                  <p className="cmd-record-identity">
                    <span>Record ID</span>
                    <code>{detail.filedRecord.id}</code>
                  </p>
                  {detail.projectId && (
                    <a
                      href={`/projects/${encodeURIComponent(detail.projectId)}`}
                    >
                      Open {selectedProject?.name ?? "project"}
                    </a>
                  )}
                  {detail.filedRecord.kind === "task" && (
                    <a
                      href={`/work-items/${encodeURIComponent(detail.filedRecord.id)}`}
                    >
                      Open saved Work item
                    </a>
                  )}
                  {(detail.filedRecord.kind === "note" ||
                    detail.filedRecord.kind === "link" ||
                    detail.filedRecord.kind === "document") && (
                    <a
                      href={`/knowledge-items/${encodeURIComponent(detail.filedRecord.id)}`}
                    >
                      {detail.filedRecord.kind === "note"
                        ? "Open saved Knowledge"
                        : `Open saved knowledge ${detail.filedRecord.kind}`}
                    </a>
                  )}
                  {filingFeedback && (
                    <p className="cmd-form-success" role="status">
                      {filingFeedback}
                    </p>
                  )}
                </div>
              ) : (
                <div className="cmd-inbox-file-form">
                  <p className="cmd-eyebrow">Create linked record</p>
                  <h3>File this capture</h3>
                  <p className="cmd-form-intro">
                    Add structured details without changing the original above.
                  </p>
                  <form className="cmd-form" onSubmit={fileCapture}>
                    <label htmlFor="file-project">
                      Project <span aria-hidden="true">*</span>
                    </label>
                    <select
                      disabled={projectsLoading || projects.length === 0}
                      id="file-project"
                      onChange={(event) => {
                        filingTouched.current = true;
                        setProjectId(event.target.value);
                      }}
                      required
                      value={projectId}
                    >
                      <option value="">Choose a project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    {projectsLoading && (
                      <p className="cmd-form-hint" role="status">
                        Loading projects...
                      </p>
                    )}
                    {projectsError && (
                      <p className="cmd-form-error" role="alert">
                        {projectsError}
                      </p>
                    )}
                    {!projectsLoading &&
                      projects.length === 0 &&
                      !projectsError && (
                        <p className="cmd-form-hint">
                          No project yet.{" "}
                          <a href="/projects">Create one first</a>.
                        </p>
                      )}
                    {nextProjectCursor && (
                      <Button
                        disabled={projectsLoadingMore}
                        onClick={loadMoreProjects}
                      >
                        {projectsLoadingMore
                          ? "Loading..."
                          : "Load more projects"}
                      </Button>
                    )}
                    <label htmlFor="file-kind">File as</label>
                    <select
                      id="file-kind"
                      onChange={(event) => {
                        filingTouched.current = true;
                        setKind(event.target.value as FilingKind);
                      }}
                      value={kind}
                    >
                      {detail.inputType === "file" ? (
                        <option value="document">Knowledge document</option>
                      ) : (
                        <>
                          <option value="task">Task</option>
                          <option value="note">Knowledge note</option>
                          {detail.inputType === "url" && (
                            <option value="link">Knowledge link</option>
                          )}
                        </>
                      )}
                    </select>
                    {kind === "task" && (
                      <>
                        <label htmlFor="file-work-type">Work type</label>
                        <select
                          id="file-work-type"
                          onChange={(event) => {
                            filingTouched.current = true;
                            setWorkType(
                              event.target.value as "task" | "initiative",
                            );
                          }}
                          value={workType}
                        >
                          <option value="task">Task</option>
                          <option value="initiative">Initiative</option>
                        </select>
                        <p className="cmd-form-hint">
                          An initiative can organize tasks through the typed
                          subtask relationship after filing. Subtasks keep their
                          own original captures.
                        </p>
                      </>
                    )}
                    {kind === "note" && (
                      <>
                        <label htmlFor="file-knowledge-type">
                          Knowledge type
                        </label>
                        <select
                          id="file-knowledge-type"
                          onChange={(event) => {
                            filingTouched.current = true;
                            setKnowledgeType(
                              event.target.value as KnowledgeTextType,
                            );
                          }}
                          value={knowledgeType}
                        >
                          {KNOWLEDGE_TEXT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {knowledgeTypeLabel(type)}
                            </option>
                          ))}
                        </select>
                        <p className="cmd-form-hint">
                          This label organizes a preserved original capture;
                          saved content can be revised separately.
                        </p>
                      </>
                    )}
                    <label htmlFor="file-title">
                      Title <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="file-title"
                      maxLength={160}
                      onChange={(event) => {
                        filingTouched.current = true;
                        setTitle(event.target.value);
                      }}
                      required
                      value={title}
                    />
                    <label htmlFor="file-body">
                      {kind === "task"
                        ? "Description"
                        : kind === "link"
                          ? "Link context"
                          : kind === "document"
                            ? "Document context"
                            : "Content"}
                      <span className="cmd-optional"> Optional</span>
                    </label>
                    <textarea
                      id="file-body"
                      onChange={(event) => {
                        filingTouched.current = true;
                        setBody(event.target.value);
                      }}
                      rows={4}
                      value={body}
                    />
                    {kind === "link" && (
                      <p className="cmd-form-hint">
                        The original URL stays unchanged in this capture. The
                        saved link removes query and fragment text and never
                        fetches the page.
                      </p>
                    )}
                    {kind === "document" && (
                      <p className="cmd-form-hint">
                        The original file bytes and checksum remain read only.
                        This context is a separate, editable Knowledge record.
                      </p>
                    )}
                    {filingError && (
                      <p className="cmd-form-error" role="alert">
                        {filingError}
                      </p>
                    )}
                    <Button
                      disabled={filing || !projectId || !title.trim()}
                      type="submit"
                      variant="primary"
                    >
                      {filing
                        ? "Filing..."
                        : `File as ${kind === "task" ? workType : kind === "note" ? knowledgeTypeLabel(knowledgeType).toLowerCase() : kind}`}
                    </Button>
                    {triageReview?.suggestion &&
                      !triageReview.decision &&
                      kind !== "link" &&
                      kind !== "document" &&
                      !(kind === "task" && workType === "initiative") &&
                      !(kind === "note" && knowledgeType !== "note") && (
                        <Button
                          disabled={triageSaving || !projectId || !title.trim()}
                          onClick={() => reviewSuggestion("approve")}
                          type="button"
                        >
                          {triageSaving
                            ? "Saving review..."
                            : "Approve reviewed suggestion"}
                        </Button>
                      )}
                  </form>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
