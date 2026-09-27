import type { Meta, StoryObj } from "@storybook/react";
import { AutomationCard } from "@commandry/ui";

const meta = {
  title: "Records/AutomationCard",
  component: AutomationCard,
  parameters: { layout: "centered" },
  args: {
    automation: {
      id: "24d1cc30-5abc-4f51-8f75-d2e655139272",
      name: "Project context snapshot",
      projectName: "Synthetic Storybook project fixture",
      enabled: true,
      triggerType: "on_creation_once",
      latestRunState: "succeeded",
      latestRunAt: "2026-09-26T12:00:00.000Z",
      nextRunAt: null,
    },
  },
} satisfies Meta<typeof AutomationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {};
export const Disabled: Story = {
  args: {
    automation: {
      ...meta.args.automation,
      enabled: false,
      latestRunState: null,
      latestRunAt: null,
      nextRunAt: null,
    },
  },
};

export const Scheduled: Story = {
  args: {
    automation: {
      ...meta.args.automation,
      latestRunState: "queued",
      nextRunAt: "2026-09-27T09:00:00.000Z",
    },
  },
};

export const Recurring: Story = {
  args: {
    automation: {
      ...meta.args.automation,
      name: "Synthetic recurring project summary",
      triggerType: "recurring_interval",
      latestRunState: "succeeded",
      nextRunAt: "2026-09-27T09:00:00.000Z",
    },
  },
};

export const SyntheticEvent: Story = {
  args: {
    automation: {
      ...meta.args.automation,
      name: "Investigate synthetic monitor down",
      triggerType: "synthetic_event",
      eventType: "monitor.down",
      latestRunState: "succeeded",
      nextRunAt: null,
    },
  },
};

export const SyntheticCondition: Story = {
  args: {
    automation: {
      ...meta.args.automation,
      name: "Review synthetic service availability",
      triggerType: "synthetic_condition",
      condition: { thresholdPercent: 50 },
      latestRunState: "succeeded",
      nextRunAt: null,
    },
  },
};
