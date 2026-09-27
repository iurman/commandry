import type { Meta, StoryObj } from "@storybook/react";
import { WorkAssigneeBadge } from "@commandry/ui";

const meta = {
  title: "Records/WorkAssigneeBadge",
  component: WorkAssigneeBadge,
  parameters: { layout: "centered" },
  args: { kind: "unassigned" },
} satisfies Meta<typeof WorkAssigneeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unassigned: Story = {};
export const LocalUser: Story = {
  args: { kind: "local_user" },
};
export const SyntheticAgent: Story = {
  args: { kind: "agent", label: "Synthetic local agent: Research helper" },
};
