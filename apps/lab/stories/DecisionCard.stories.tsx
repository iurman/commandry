import type { Meta, StoryObj } from "@storybook/react";
import { DecisionCard } from "@commandry/ui";

const meta = {
  title: "Records/DecisionCard",
  component: DecisionCard,
  parameters: { layout: "centered" },
  args: {
    id: "88cc88cc-88cc-48cc-88cc-88cc88cc88cc",
    question: "How should a captured thought become project work?",
    outcome:
      "Keep the original capture and require local review before filing.",
    alternatives: "Automatically create a task or note.",
    rationale:
      "A visible review makes classification errors easy to correct while preserving the source.",
    status: "accepted",
    revision: 2,
    sourceLabel: "Synthetic Storybook decision fixture",
    updatedAt: "2026-09-26T12:00:00.000Z",
  },
} satisfies Meta<typeof DecisionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Accepted: Story = {};

export const Proposed: Story = {
  args: {
    status: "proposed",
    revision: 1,
    outcome: "Trial a local manual review.",
  },
};

export const Superseded: Story = {
  args: { status: "superseded", revision: 3 },
};
