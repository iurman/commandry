import type { Meta, StoryObj } from "@storybook/react";
import { WorkTypeBadge } from "@commandry/ui";

const meta = {
  title: "Records/WorkTypeBadge",
  component: WorkTypeBadge,
  parameters: { layout: "centered" },
  args: { type: "task", status: "open" },
} satisfies Meta<typeof WorkTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Task: Story = {};
export const Initiative: Story = {
  args: { type: "initiative", status: "open" },
};
export const Subtask: Story = {
  args: { type: "subtask", status: "done" },
};
