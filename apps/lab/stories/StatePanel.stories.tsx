import type { Meta, StoryObj } from "@storybook/react";
import { StatePanel } from "@commandry/ui";

const meta = {
  title: "Components/State panel",
  component: StatePanel,
  args: {
    id: "state-panel-title",
    title: "Attention",
    state: "normal",
  },
} satisfies Meta<typeof StatePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    children: (
      <p>A sourced item with a reason and a next action can appear here.</p>
    ),
  },
};

export const Loading: Story = {
  args: {
    state: "loading",
    description: "Loading attention from connected sources.",
  },
};

export const Empty: Story = {
  args: {
    state: "empty",
    description: "No attention items are available from the connected sources.",
  },
};

export const Error: Story = {
  args: {
    state: "error",
    description:
      "Attention could not be loaded. The last known state is not current.",
  },
};

export const Disabled: Story = {
  args: {
    state: "disabled",
    description: "Attention is unavailable in this workspace.",
  },
};

export const PermissionDenied: Story = {
  args: {
    state: "permission-denied",
    description: "You do not have permission to view these items.",
  },
};
