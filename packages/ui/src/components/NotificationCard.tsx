import type { ReactNode } from "react";

export interface NotificationCardView {
  id: string;
  title: string;
  reason: string;
  priority: "critical" | "action_required" | "informational";
  projectName: string;
  sourceLabel: string;
  occurredAt: string;
  href: string;
  evidenceHref: string;
  state: "unread" | "acknowledged" | "dismissed" | "snoozed";
  snoozedUntil: string | null;
}

const priorityLabels = {
  critical: "Critical",
  action_required: "Action required",
  informational: "Informational",
};

export function NotificationCard({
  notification,
  children,
}: {
  notification: NotificationCardView;
  children?: ReactNode;
}) {
  return (
    <article className="cmd-notification-card">
      <div className="cmd-notification-card-top">
        <span
          className={`cmd-notification-priority cmd-notification-priority-${notification.priority}`}
        >
          {priorityLabels[notification.priority]}
        </span>
        <span className="cmd-count">{notification.state}</span>
      </div>
      <p className="cmd-eyebrow">{notification.sourceLabel} / Synthetic</p>
      <h3>{notification.title}</h3>
      <p>{notification.reason}</p>
      <dl className="cmd-notification-facts">
        <div>
          <dt>Project</dt>
          <dd>{notification.projectName}</dd>
        </div>
        <div>
          <dt>Changed</dt>
          <dd>
            <time dateTime={notification.occurredAt}>
              {notification.occurredAt}
            </time>
          </dd>
        </div>
        {notification.snoozedUntil && (
          <div>
            <dt>Snoozed until</dt>
            <dd>
              <time dateTime={notification.snoozedUntil}>
                {notification.snoozedUntil}
              </time>
            </dd>
          </div>
        )}
      </dl>
      <div className="cmd-notification-links">
        <a href={notification.href}>Review context</a>
        <a href={notification.evidenceHref}>Exact source record</a>
      </div>
      {children && <div className="cmd-notification-actions">{children}</div>}
    </article>
  );
}
