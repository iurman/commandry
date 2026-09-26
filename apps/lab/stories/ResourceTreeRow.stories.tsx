import type { Meta, StoryObj } from "@storybook/react";
import { ResourceTreeRow } from "@commandry/ui";

const meta = {
  title: "Patterns/Resource tree row",
  component: ResourceTreeRow,
  args: {
    resource: {
      id: "d7a06a57-4a15-444c-a892-af8d640b1f68",
      kind: "service",
      name: "Synthetic example service",
      state: null,
      lastObservedAt: null,
    },
    expanded: false,
    onToggle: () => undefined,
  },
  decorators: [
    (Story) => (
      <div className="lab-stack">
        <p>Synthetic lab fixture. Operational health is unknown.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResourceTreeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Root: Story = {};
export const Expanded: Story = { args: { expanded: true } };
