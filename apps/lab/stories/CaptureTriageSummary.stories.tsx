import type { Meta, StoryObj } from "@storybook/react";
import { CaptureTriageSummary } from "@commandry/ui";

const pending = {
  suggestion: {
    kind: "task" as const,
    title: "Review captured action",
    confidence: 60,
    rationale:
      "Action words in this text triggered a fixed local task suggestion. It may be wrong; review before filing.",
    sourceLabel: "Local deterministic rule",
    ruleVersion: "capture-triage/v1",
  },
  decision: null,
};

const meta = {
  title: "Patterns/Capture triage summary",
  component: CaptureTriageSummary,
  args: {
    review: pending,
    captureState: "unfiled",
  },
  decorators: [
    (Story) => (
      <div className="lab-stack">
        <p>Synthetic lab fixture. No capture was filed or action performed.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CaptureTriageSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingReview: Story = {};
export const ApprovedWithCorrection: Story = {
  args: {
    captureState: "filed",
    review: {
      ...pending,
      decision: {
        decision: "approve",
        actor: "local-user:unattributed",
        createdAt: "2026-09-26T10:00:00.000Z",
      },
    },
  },
};
export const Rejected: Story = {
  args: {
    review: {
      ...pending,
      decision: {
        decision: "reject",
        actor: "local-user:unattributed",
        createdAt: "2026-09-26T10:00:00.000Z",
      },
    },
  },
};
