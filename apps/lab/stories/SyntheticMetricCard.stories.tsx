import type { Meta, StoryObj } from "@storybook/react";
import { SyntheticMetricCard } from "@commandry/ui";

const meta = {
  title: "Signals/SyntheticMetricCard",
  component: SyntheticMetricCard,
  parameters: { layout: "centered" },
  args: {
    sample: {
      id: "72147cb4-74ca-4f61-ab40-c71fa89056dd",
      resourceId: "60c4802e-8a50-4a60-97d3-6fa51175a5a6",
      resourceName: "Synthetic Storybook service fixture",
      value: 0,
      sampledAt: "2026-09-26T12:00:00.000Z",
      recordedAt: "2026-09-26T12:01:00.000Z",
      evidenceHref:
        "/api/v1/source-envelopes/71a4c897-1544-4bd4-ae8c-aadba44ddaba",
      sourceLabel: "Synthetic operational fixture",
    },
    previousValue: 100,
  },
} satisfies Meta<typeof SyntheticMetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DownAfterRecovery: Story = {};
export const Recovered: Story = {
  args: {
    sample: { ...meta.args.sample, value: 100 },
    previousValue: 0,
  },
};
