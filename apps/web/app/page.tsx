"use client";

import { useEffect, useState } from "react";
import type { Notification, WorkItem } from "@commandry/contracts";
import { chooseCommandCenterNextAction, workDueLabel } from "@commandry/domain";
import {
  AppShell,
  Button,
  NotificationCard,
  StatePanel,
  StatusBadge,
  SyntheticEventCard,
  UpcomingWorkCard,
} from "@commandry/ui";
import { apiJson, type PageResponse } from "./projects/api";
import {
  activityPagePath,
  syntheticPage,
  type SyntheticEventRecord,
} from "./activity/api";

const recentNotificationsPath = "/api/v1/notifications?view=active&limit=3";

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function oneHourFromNow() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export default function HomePage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null,
  );
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationFeedback, setNotificationFeedback] = useState<
    string | null
  >(null);
  const [events, setEvents] = useState<SyntheticEventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<WorkItem[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<Notification>>(recentNotificationsPath)
      .then((page) => {
        if (active) setNotifications(page.items);
      })
      .catch((cause: unknown) => {
        if (active)
          setNotificationsError(
            message(cause, "Local notifications are unavailable."),
          );
      })
      .finally(() => {
        if (active) setNotificationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<WorkItem>>("/api/v1/work-items/upcoming?limit=3")
      .then((page) => {
        if (active) setUpcoming(page.items);
      })
      .catch((cause: unknown) => {
        if (active)
          setUpcomingError(message(cause, "Upcoming work is unavailable."));
      })
      .finally(() => {
        if (active) setUpcomingLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticEventRecord>>(
      activityPagePath("/api/v1/events", { limit: 1 }),
    )
      .then(syntheticPage)
      .then((page) => {
        if (active) setEvents(page.items);
      })
      .catch((cause: unknown) => {
        if (active)
          setEventsError(message(cause, "Recent activity is unavailable."));
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function changeNotificationState(
    item: Notification,
    action: "acknowledge" | "dismiss" | "snooze",
  ) {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationsError(null);
    setNotificationFeedback(null);
    try {
      await apiJson<Notification>(
        `/api/v1/notifications/${encodeURIComponent(item.id)}/state`,
        {
          method: "PUT",
          body: JSON.stringify({
            action,
            expectedVersion: item.version,
            ...(action === "snooze" ? { snoozedUntil: oneHourFromNow() } : {}),
          }),
        },
      );
      const page = await apiJson<PageResponse<Notification>>(
        recentNotificationsPath,
      );
      setNotifications(page.items);
      setNotificationFeedback(
        `Notification ${action === "acknowledge" ? "acknowledged" : action === "dismiss" ? "dismissed" : "snoozed"}. Restore it from All notifications if needed.`,
      );
    } catch (cause) {
      setNotificationsError(
        message(cause, "Could not update the local notification."),
      );
    } finally {
      setNotificationBusy(false);
    }
  }

  const recentEvent = events[0];
  const nextAction = chooseCommandCenterNextAction(notifications);

  return (
    <AppShell>
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Home / Command Center</p>
          <h1>Command Center</h1>
          <p className="cmd-lead">
            Current local attention and meaningful change stay connected to
            their source evidence.
          </p>
        </div>
        <StatusBadge dimension="sync" label="No live sources" tone="neutral" />
      </header>

      <div className="cmd-notice cmd-synthetic-notice">
        <h2>Local simulation</h2>
        <p>
          No live integrations are connected. Items below, when present, come
          from fixed synthetic fixtures or local simulated runs. They do not
          report project or resource health.
        </p>
      </div>

      <div className="cmd-panel-grid">
        <StatePanel
          description={
            upcomingError ??
            (upcoming.length === 0 && !upcomingLoading
              ? "No open task has a local due date. Set one on a filed task to see it here."
              : "Three earliest dated open tasks across projects. Dates use UTC calendar days.")
          }
          id="upcoming-title"
          state={
            upcomingLoading ? "loading" : upcomingError ? "error" : "normal"
          }
          title="Upcoming work"
        >
          {upcoming.length > 0 && !upcomingError && (
            <ul className="cmd-record-list" aria-label="Upcoming tasks">
              {upcoming.map((item) => {
                if (!item.dueOn) return null;
                const dueState = workDueLabel(
                  item.dueOn,
                  item.status,
                  new Date().toISOString().slice(0, 10),
                );
                if (dueState === "none") return null;
                return (
                  <li key={item.id}>
                    <UpcomingWorkCard
                      task={{
                        id: item.id,
                        projectId: item.projectId,
                        title: item.title,
                        dueOn: item.dueOn,
                        priority: item.priority ?? null,
                        dueState,
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="cmd-home-panel-link">
            <a href="/work">Review all upcoming work</a>
          </p>
        </StatePanel>
        <StatePanel
          description={
            notificationsError ??
            (!notificationsLoading && notifications.length === 0
              ? (notificationFeedback ??
                "No current local notification needs attention. This does not establish external system health.")
              : "Three most recent active local notifications, ordered by source time. Review the full notification center for older items.")
          }
          id="attention-title"
          state={
            notificationsLoading
              ? "loading"
              : notificationsError
                ? "error"
                : notifications.length > 0
                  ? "normal"
                  : "empty"
          }
          title="Attention"
        >
          {notificationFeedback && (
            <p className="cmd-form-success" role="status">
              {notificationFeedback}
            </p>
          )}
          {notifications.length > 0 && !notificationsError && (
            <ul
              className="cmd-notification-list cmd-home-attention-list"
              aria-label="Recent attention"
            >
              {notifications.map((item) => (
                <li key={item.id}>
                  <NotificationCard notification={item}>
                    {item.state !== "acknowledged" && (
                      <Button
                        disabled={notificationBusy}
                        onClick={() =>
                          void changeNotificationState(item, "acknowledge")
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                    <Button
                      disabled={notificationBusy}
                      onClick={() =>
                        void changeNotificationState(item, "dismiss")
                      }
                    >
                      Dismiss
                    </Button>
                    <Button
                      disabled={notificationBusy}
                      onClick={() =>
                        void changeNotificationState(item, "snooze")
                      }
                    >
                      Snooze one hour
                    </Button>
                  </NotificationCard>
                </li>
              ))}
            </ul>
          )}
          <p className="cmd-home-panel-link">
            <a href="/notifications">Review all local notifications</a>
          </p>
        </StatePanel>
        <StatePanel
          description={
            eventsError ??
            (!eventsLoading && !recentEvent
              ? "No synthetic events have been normalized by the local worker."
              : "Latest normalized synthetic event, with its source envelope.")
          }
          id="change-title"
          state={
            eventsLoading
              ? "loading"
              : eventsError
                ? "error"
                : recentEvent
                  ? "normal"
                  : "empty"
          }
          title="Recent change"
        >
          {recentEvent && (
            <>
              <SyntheticEventCard {...recentEvent} />
              <p className="cmd-home-panel-link">
                <a href="/activity#events">Review all synthetic events</a>
              </p>
            </>
          )}
        </StatePanel>
        <StatePanel
          description={
            notificationsError ??
            (notificationsLoading
              ? "Checking current local sources."
              : nextAction.reason)
          }
          id="next-title"
          state={
            notificationsLoading
              ? "loading"
              : notificationsError
                ? "error"
                : "normal"
          }
          title="Local next step"
        >
          {!notificationsLoading && !notificationsError && (
            <p>
              <a href={nextAction.href}>{nextAction.label}</a>
            </p>
          )}
        </StatePanel>
      </div>
    </AppShell>
  );
}
