import type { Meta, StoryObj } from "@storybook/react";
import { UpcomingWorkCard } from "@commandry/ui";

const meta = {
  title: "Records/UpcomingWorkCard",
  component: UpcomingWorkCard,
  parameters: { layout: "centered" },
  args: {
    task: {
      id: "88b876ac-5d1a-4fb9-80f2-fbb67cf78e10",
      projectId: "be3d58d3-5ee8-449f-887d-dfa28ad4e555",
      title: "Review garden timer replacement",
      dueOn: "2026-09-27",
      priority: "high",
      dueState: "upcoming",
    },
  },
} satisfies Meta<typeof UpcomingWorkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Upcoming: Story = {};
export const Overdue: Story = {
  args: {
    task: { ...meta.args.task, dueOn: "2026-09-20", dueState: "overdue" },
  },
};
