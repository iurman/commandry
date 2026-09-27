import type { Meta, StoryObj } from "@storybook/react";
import { WorkCommentCard } from "@commandry/ui";

const meta = {
  title: "Records/WorkCommentCard",
  component: WorkCommentCard,
  args: {
    comment: {
      id: "b6418a97-3320-4da8-8f25-6fba02a1b983",
      body: "The original capture remains the task source. This local comment records the review note separately.",
      actor: "local-user:unattributed",
      sourceLabel: "Manual local work comment",
      createdAt: "2026-09-26T17:00:00.000Z",
    },
  },
} satisfies Meta<typeof WorkCommentCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Manual: Story = {};
