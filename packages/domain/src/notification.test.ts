import { describe, expect, it } from "vitest";
import {
  nextNotificationState,
  NotificationError,
  notificationStatePolicy,
  projectLocalNotification,
} from "./notification";

describe("local notification state", () => {
  const now = new Date("2026-09-26T12:00:00.000Z");

  it("declares the bounded audited action and reversible states", () => {
    expect(notificationStatePolicy).toMatchObject({
      risk: "reversible",
      capability: "notification.manage",
      approvalRequired: false,
      externalActions: false,
      auditEvent: "notification.state_changed",
    });
    expect(
      nextNotificationState({ action: "dismiss", expectedVersion: 0 }, now),
    ).toEqual({
      state: "dismissed",
      snoozedUntil: null,
    });
    expect(
      nextNotificationState({ action: "restore", expectedVersion: 1 }, now),
    ).toEqual({
      state: "unread",
      snoozedUntil: null,
    });
  });

  it("requires a future snooze expiry", () => {
    expect(() =>
      nextNotificationState(
        {
          action: "snooze",
          expectedVersion: 0,
          snoozedUntil: now.toISOString(),
        },
        now,
      ),
    ).toThrow(NotificationError);
    expect(
      nextNotificationState(
        {
          action: "snooze",
          expectedVersion: 0,
          snoozedUntil: "2026-09-27T12:00:00.000Z",
        },
        now,
      ).state,
    ).toBe("snoozed");
  });

  it("keeps monitor recovery and actionable approval distinct and labeled", () => {
    const alert = {
      kind: "alert" as const,
      id: "alert-open:one:1",
      projectId: "project",
      projectName: "Project",
      resourceId: "resource",
      resourceName: "Local service",
      sourceId: "alert",
      sourceAt: now.toISOString(),
      reason: "Synthetic monitor evidence",
      sourceLabel: "Synthetic operational fixture",
    };
    expect(
      projectLocalNotification({ ...alert, sourceState: "open" }),
    ).toMatchObject({
      kind: "synthetic_alert",
      priority: "critical",
      isSynthetic: true,
      evidenceHref: "/api/v1/alerts/alert",
    });
    expect(
      projectLocalNotification({ ...alert, sourceState: "resolved" }),
    ).toMatchObject({
      priority: "informational",
      title: "Synthetic monitor recovered",
    });
    expect(
      projectLocalNotification({
        kind: "approval",
        id: "approval-pending:one",
        projectId: "project",
        projectName: "Project",
        sourceId: "proposal",
        sourceAt: now.toISOString(),
        resourceName: "Local service",
      }),
    ).toMatchObject({
      priority: "action_required",
      href: "/approvals/proposal",
    });
  });
});
