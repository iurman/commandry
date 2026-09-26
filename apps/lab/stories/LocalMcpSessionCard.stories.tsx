import type { Meta, StoryObj } from "@storybook/react";
import { LocalMcpSessionCard } from "@commandry/ui";

const meta = {
  title: "Records/LocalMcpSessionCard",
  component: LocalMcpSessionCard,
  args: {
    session: {
      id: "a9a4bdf6-7714-4a4f-9302-315760d281a9",
      packetId: "f90b5e4f-0a66-419e-8a70-ec25f83bd080",
      packetVersion: 2,
      projectId: "d60c82f9-4279-4f99-a60a-7903bb9cf5e5",
      workItemId: "7558b00f-37f4-4e2a-a0ed-d45b860ced60",
      agentId: "fe05df50-30f5-4fe8-8252-8cf3cf433234",
      expiresAt: "2099-09-27T08:00:00.000Z",
      revokedAt: null,
      createdAt: "2026-09-26T07:30:00.000Z",
    },
  },
} satisfies Meta<typeof LocalMcpSessionCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Active: Story = {};
export const Revoked: Story = {
  args: {
    session: { ...meta.args.session, revokedAt: "2026-09-26T07:45:00.000Z" },
  },
};
