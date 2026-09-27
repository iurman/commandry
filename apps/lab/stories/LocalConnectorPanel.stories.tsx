import type { Meta, StoryObj } from "@storybook/react";
import { LocalConnectorPanel } from "@commandry/ui";

const meta = {
  title: "Records/LocalConnectorPanel",
  component: LocalConnectorPanel,
  parameters: { layout: "centered" },
  args: {
    enabled: true,
    receiverConfigured: true,
    token: "cmdry_local_storybook_synthetic_token_shown_once",
    feed: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        scenarioId: "operations.monitor-down",
        state: "submitted",
        importId: "66666666-6666-4666-8666-666666666666",
        error: null,
        attempts: 1,
      },
    ],
    nextCursor: null,
    busy: false,
    onRotate: () => undefined,
    onReceive: () => undefined,
    onQueue: () => undefined,
    onRefresh: () => undefined,
    onLoadMore: () => undefined,
    scenarios: [{ id: "operations.monitor-down", label: "monitor down" }],
  },
} satisfies Meta<typeof LocalConnectorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Submitted: Story = {};
export const Pending: Story = {
  args: {
    token: null,
    receiverConfigured: false,
    feed: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        scenarioId: "operations.monitor-down",
        state: "queued",
        importId: null,
        error: null,
        attempts: 0,
      },
    ],
  },
};
