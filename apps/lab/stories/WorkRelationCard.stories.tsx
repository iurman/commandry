import type { Meta, StoryObj } from "@storybook/react";
import { WorkRelationCard } from "@commandry/ui";

const meta = {
  title: "Records/WorkRelationCard",
  component: WorkRelationCard,
  args: {
    relation: {
      id: "203188fd-4d96-4c9b-9af8-d14b9037511b",
      sourceWorkItemId: "35539469-5773-4234-9f9e-f1980346f268",
      sourceTitle: "Review service capacity",
      sourceStatus: "open",
      targetWorkItemId: "fe24c168-775b-4c5b-ac9a-a57aab9bdd3a",
      targetTitle: "Schedule the maintenance window",
      targetStatus: "open",
      type: "blocks",
      sourceLabel: "Manual local work relationship",
      createdAt: "2026-09-26T17:00:00.000Z",
    },
  },
} satisfies Meta<typeof WorkRelationCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Blocks: Story = {};
