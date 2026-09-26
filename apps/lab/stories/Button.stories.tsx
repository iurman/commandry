import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@commandry/ui";

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "View source" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {};

export const Primary: Story = {
  args: { variant: "primary", children: "Review action" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Action unavailable" },
};
