import type { Meta, StoryObj } from "@storybook/react";
import { NotificationCard } from "@commandry/ui";

const meta = {
  title: "Records/NotificationCard",
  component: NotificationCard,
  parameters: { layout: "centered" },
  args: {
    notification: {
      id: "alert-open:72ac99c7-7e83-4ff3-b312-94313c4d8bb0:1",
      title: "Synthetic monitor needs attention",
      reason:
        "A synthetic operations fixture reported the service unavailable. The real resource health remains unknown.",
      priority: "critical",
      projectName: "Synthetic Storybook project fixture",
      sourceLabel: "Synthetic operational fixture",
      occurredAt: "2026-09-26T12:00:00.000Z",
      href: "/resources/72ac99c7-7e83-4ff3-b312-94313c4d8bb0",
      evidenceHref: "/api/v1/alerts/72ac99c7-7e83-4ff3-b312-94313c4d8bb0",
      state: "unread",
      snoozedUntil: null,
    },
  },
} satisfies Meta<typeof NotificationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Alert: Story = {};
export const Snoozed: Story = {
  args: {
    notification: {
      ...meta.args.notification,
      state: "snoozed",
      snoozedUntil: "2026-09-26T13:00:00.000Z",
    },
  },
};
