import type { Meta, StoryObj } from "@storybook/react";
import { WorkRecurrenceCard } from "@commandry/ui";

const meta = {
  title: "Work/WorkRecurrenceCard",
  component: WorkRecurrenceCard,
  parameters: { layout: "padded" },
  args: {
    occurrence: {
      id: "a6421965-c76b-45ce-95a1-eeb5a173a95f",
      scheduledFor: "2026-09-28T08:00:00.000Z",
      state: "generated",
      generatedWorkItemId: "7e06c550-b829-44dd-9f6d-b38a005eb4a9",
      attempts: 1,
      lastError: null,
    },
  },
} satisfies Meta<typeof WorkRecurrenceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Generated: Story = {};
export const Queued: Story = {
  args: {
    occurrence: {
      id: "a6421965-c76b-45ce-95a1-eeb5a173a95f",
      scheduledFor: "2026-09-28T08:00:00.000Z",
      state: "queued",
      generatedWorkItemId: null,
      attempts: 0,
      lastError: null,
    },
  },
};
export const FailedAttempt: Story = {
  args: {
    occurrence: {
      id: "a6421965-c76b-45ce-95a1-eeb5a173a95f",
      scheduledFor: "2026-09-28T08:00:00.000Z",
      state: "failed",
      generatedWorkItemId: null,
      attempts: 2,
      lastError: "DatabaseUnavailable",
    },
  },
};
