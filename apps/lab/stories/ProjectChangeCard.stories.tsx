import type { Meta, StoryObj } from "@storybook/react";
import { ProjectChangeCard } from "@commandry/ui";

const meta = {
  title: "Projects/Project change evidence fixture",
  component: ProjectChangeCard,
  args: {
    href: "/api/v1/projects/example/changes/4",
    event: {
      id: "181020cc-e39c-4844-8bb4-7f7347ac477b",
      version: 4,
      actor: "local-user:unattributed",
      createdAt: "2026-09-27T15:30:00.000Z",
      changedFields: ["summary", "lifecycle"] as ("summary" | "lifecycle")[],
      previous: {
        name: "Garden plan",
        summary: "Collect ideas",
        type: "personal",
        lifecycle: "proposed",
      },
      current: {
        name: "Garden plan",
        summary: "Plant the autumn beds and track supplies",
        type: "personal",
        lifecycle: "active",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(100%, 40rem)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectChangeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Revision: Story = {};
