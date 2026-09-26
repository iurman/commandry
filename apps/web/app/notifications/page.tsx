"use client";

import { useEffect, useState } from "react";
import type {
  Notification,
  NotificationAuditEvent,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  NotificationCard,
  RecordEmptyState,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";

function listPath(
  view: "active" | "all",
  projectId: string,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: "20", view });
  if (projectId) params.set("projectId", projectId);
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/notifications?${params}`;
}

function oneHourFromNow() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "all">("active");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectSelectionReady, setProjectSelectionReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [audit, setAudit] = useState<NotificationAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects"))
      .then(async (page) => {
        if (!active) return;
        setProjects(page.items);
        setProjectCursor(page.nextCursor);
        const requestedId = new URLSearchParams(window.location.search).get(
          "projectId",
        );
        if (!requestedId) return;
        const listed = page.items.find((item) => item.id === requestedId);
        if (listed) {
          setProjectId(listed.id);
          return;
        }
        const requested = await apiJson<ProjectRecord>(
          `/api/v1/projects/${encodeURIComponent(requestedId)}`,
        );
        if (!active) return;
        setProjects((current) => [requested, ...current]);
        setProjectId(requested.id);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Project choices are unavailable.",
          );
      })
      .finally(() => {
        if (active) setProjectSelectionReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!projectSelectionReady) return;
    let active = true;
    apiJson<PageResponse<Notification>>(listPath(view, projectId))
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Notifications are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, projectId, projectSelectionReady]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<Notification>>(
        listPath(view, projectId),
      );
      setItems(page.items);
      setCursor(page.nextCursor);
      setFeedback("Local notification sources refreshed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh notifications.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<Notification>>(
        listPath(view, projectId, cursor),
      );
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load older notifications.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreProjects() {
    if (!projectCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", projectCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setProjectCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load project choices.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeState(
    item: Notification,
    action: "acknowledge" | "dismiss" | "snooze" | "restore",
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiJson<Notification>(
        `/api/v1/notifications/${encodeURIComponent(item.id)}/state`,
        {
          method: "PUT",
          body: JSON.stringify({
            action,
            expectedVersion: item.version,
            ...(action === "snooze"
              ? {
                  snoozedUntil: oneHourFromNow(),
                }
              : {}),
          }),
        },
      );
      setItems((current) =>
        current.flatMap((saved) =>
          saved.id === item.id
            ? view === "active" &&
              (updated.state === "dismissed" || updated.state === "snoozed")
              ? []
              : [updated]
            : [saved],
        ),
      );
      setFeedback(
        `Notification ${updated.state}. This local choice is reversible in All notifications.`,
      );
      if (auditId === item.id) void showAudit(item.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not change notification state.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function showAudit(id: string, next?: string) {
    try {
      const page = await apiJson<PageResponse<NotificationAuditEvent>>(
        pagePath(`/api/v1/notifications/${encodeURIComponent(id)}/audit`, next),
      );
      setAuditId(id);
      setAudit((current) => (next ? [...current, ...page.items] : page.items));
      setAuditCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load local history.",
      );
    }
  }

  return (
    <AppShell current="Notifications">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Local-only / Contextual inbox</p>
          <h1>Notifications</h1>
          <p className="cmd-lead">
            Source-linked synthetic alerts, simulated approvals, and local
            worker failures. Nothing is sent to email, push, or external
            channels.
          </p>
        </div>
      </header>
      <section
        className="cmd-workspace-section"
        aria-labelledby="notification-list-heading"
      >
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Context / Current source state</p>
            <h2 id="notification-list-heading">Notification center</h2>
          </div>
          <span className="cmd-count">{items.length} shown</span>
        </div>
        <div className="cmd-notification-toolbar">
          <label htmlFor="notification-view">View</label>
          <select
            id="notification-view"
            value={view}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setView(event.target.value as "active" | "all");
            }}
          >
            <option value="active">Active</option>
            <option value="all">All current sources</option>
          </select>
          <label htmlFor="notification-project">Project</label>
          <select
            id="notification-project"
            value={projectId}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setProjectId(event.target.value);
            }}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {projectCursor && (
            <Button disabled={busy} onClick={loadMoreProjects}>
              Load more project choices
            </Button>
          )}
          <Button disabled={busy} onClick={refresh}>
            Refresh sources
          </Button>
        </div>
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
        {loading && (
          <p className="cmd-inline-state" role="status">
            Loading notifications...
          </p>
        )}
        {!loading && items.length === 0 && !error && (
          <RecordEmptyState
            title="No notifications in this view"
            description="Synthetic source changes and pending local reviews will appear here when present."
          />
        )}
        <ul className="cmd-notification-list" aria-label="Local notifications">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationCard notification={item}>
                {item.state !== "acknowledged" && (
                  <Button
                    disabled={busy}
                    onClick={() => changeState(item, "acknowledge")}
                  >
                    Acknowledge
                  </Button>
                )}
                {item.state !== "dismissed" && (
                  <Button
                    disabled={busy}
                    onClick={() => changeState(item, "dismiss")}
                  >
                    Dismiss
                  </Button>
                )}
                {item.state !== "snoozed" && (
                  <Button
                    disabled={busy}
                    onClick={() => changeState(item, "snooze")}
                  >
                    Snooze one hour
                  </Button>
                )}
                {item.state !== "unread" && (
                  <Button
                    disabled={busy}
                    onClick={() => changeState(item, "restore")}
                  >
                    Restore unread
                  </Button>
                )}
                <Button
                  disabled={busy}
                  onClick={() =>
                    auditId === item.id
                      ? setAuditId(null)
                      : void showAudit(item.id)
                  }
                >
                  {auditId === item.id
                    ? "Hide local history"
                    : "View local history"}
                </Button>
                {auditId === item.id && (
                  <div className="cmd-notification-audit">
                    <h4>Local state history</h4>
                    {audit.length === 0 && <p>No state changes recorded.</p>}
                    <ul>
                      {audit.map((event) => (
                        <li key={event.id}>
                          {event.previousState} to {event.nextState} by{" "}
                          {event.actor} at{" "}
                          <time dateTime={event.createdAt}>
                            {event.createdAt}
                          </time>
                        </li>
                      ))}
                    </ul>
                    {auditCursor && (
                      <Button
                        disabled={busy}
                        onClick={() => showAudit(item.id, auditCursor)}
                      >
                        Load more history
                      </Button>
                    )}
                  </div>
                )}
              </NotificationCard>
            </li>
          ))}
        </ul>
        {cursor && (
          <Button disabled={busy} onClick={loadMore}>
            Load more notifications
          </Button>
        )}
      </section>
    </AppShell>
  );
}
