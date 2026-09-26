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
      latestRunState: "succeeded",
      latestRunAt: "2026-09-26T12:00:00.000Z",
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
    },
  },
};
