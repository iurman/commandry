import type { Meta, StoryObj } from "@storybook/react";
import { OvernightQueueCard } from "@commandry/ui";

const meta = {
  title: "Records/OvernightQueueCard",
  component: OvernightQueueCard,
  args: {
    entry: {
      id: "1133a0ce-80f5-4d15-8269-61eaa9e58117",
      packetId: "f90b5e4f-0a66-419e-8a70-ec25f83bd080",
      packetVersion: 2,
      projectId: "d60c82f9-4279-4f99-a60a-7903bb9cf5e5",
      projectName: "Garden systems",
      workItemId: "7558b00f-37f4-4e2a-a0ed-d45b860ced60",
      workTitle: "Review the irrigation controller plan",
      agentName: "Local planning agent",
      runAfter: "2026-09-27T08:00:00.000Z",
      state: "scheduled",
      runId: null,
      runState: null,
      blockedReason: null,
    },
  },
} satisfies Meta<typeof OvernightQueueCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Scheduled: Story = {};
export const Blocked: Story = {
  args: {
    entry: {
      ...meta.args.entry,
      state: "blocked",
      blockedReason: "Packet work is done or missing",
    },
  },
};
