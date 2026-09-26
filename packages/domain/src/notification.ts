type NotificationStateRequest =
  | { action: "acknowledge" | "dismiss" | "restore"; expectedVersion: number }
  | { action: "snooze"; expectedVersion: number; snoozedUntil: string };

export const notificationStatePolicy = {
  risk: "reversible",
  capability: "notification.manage",
  approvalRequired: false,
  auditEvent: "notification.state_changed",
  externalActions: false,
} as const;

export class NotificationError extends Error {
  constructor(
    public readonly code:
      | "NOTIFICATION_NOT_FOUND"
      | "NOTIFICATION_STALE"
      | "NOTIFICATION_INVALID_SNOOZE"
      | "NOTIFICATION_INVALID_CURSOR",
    message: string,
  ) {
    super(message);
  }
}

export function nextNotificationState(
  input: NotificationStateRequest,
  now: Date,
) {
  if (input.action === "snooze") {
    const until = new Date(input.snoozedUntil);
    if (!Number.isFinite(until.getTime()) || until <= now)
      throw new NotificationError(
        "NOTIFICATION_INVALID_SNOOZE",
        "Snooze must end in the future",
      );
    return { state: "snoozed" as const, snoozedUntil: until };
  }
  return {
    state:
      input.action === "acknowledge"
        ? ("acknowledged" as const)
        : input.action === "dismiss"
          ? ("dismissed" as const)
          : ("unread" as const),
    snoozedUntil: null,
  };
}

export type LocalNotificationSource =
  | {
      kind: "alert";
      id: string;
      projectId: string;
      projectName: string;
      resourceId: string;
      resourceName: string;
      sourceId: string;
      sourceAt: string;
      sourceState: "open" | "resolved";
      reason: string;
      sourceLabel: string;
    }
  | {
      kind: "approval";
      id: string;
      projectId: string;
      projectName: string;
      sourceId: string;
      sourceAt: string;
      resourceName: string;
    }
  | {
      kind: "automation";
      id: string;
      projectId: string;
      projectName: string;
      sourceId: string;
      definitionId: string;
      sourceAt: string;
      error: string | null;
    };

export function projectLocalNotification(source: LocalNotificationSource) {
  const common = {
    id: source.id,
    projectId: source.projectId,
    projectName: source.projectName,
    isSynthetic: true as const,
    occurredAt: source.sourceAt,
  };
  if (source.kind === "alert") {
    return {
      ...common,
      kind: "synthetic_alert" as const,
      priority:
        source.sourceState === "open"
          ? ("critical" as const)
          : ("informational" as const),
      title:
        source.sourceState === "open"
          ? "Synthetic monitor needs attention"
          : "Synthetic monitor recovered",
      reason: `Affected resource: ${source.resourceName}. ${source.reason}`,
      sourceLabel: source.sourceLabel,
      href: `/resources/${source.resourceId}`,
      evidenceHref: `/api/v1/alerts/${source.sourceId}`,
    };
  }
  if (source.kind === "approval") {
    return {
      ...common,
      kind: "approval" as const,
      priority: "action_required" as const,
      title: "Simulated sensitive action awaits review",
      reason: `Affected resource: ${source.resourceName}. A simulated restart requires an explicit local decision before its no-effect worker outcome can be recorded.`,
      sourceLabel: "Simulated local approval",
      href: `/approvals/${source.sourceId}`,
      evidenceHref: `/api/v1/approvals/${source.sourceId}`,
    };
  }
  return {
    ...common,
    kind: "automation_failure" as const,
    priority: "informational" as const,
    title: "Local automation attempt failed",
    reason: `${source.error ?? "The worker could not finish its local summary."} A queued retry may still run.`,
    sourceLabel: "Synthetic local automation",
    href: `/automations/${source.definitionId}`,
    evidenceHref: `/api/v1/automation-runs/${source.sourceId}`,
  };
}

export function effectiveNotificationReceipt(
  receipt: {
    state: "unread" | "acknowledged" | "dismissed" | "snoozed" | null;
    snoozedUntil: Date | null;
    version: number | null;
  },
  now: Date,
) {
  const expired =
    receipt.state === "snoozed" &&
    !!receipt.snoozedUntil &&
    receipt.snoozedUntil <= now;
  return {
    state: expired ? ("unread" as const) : (receipt.state ?? "unread"),
    snoozedUntil: expired
      ? null
      : (receipt.snoozedUntil?.toISOString() ?? null),
    version: receipt.version ?? 0,
  };
}
