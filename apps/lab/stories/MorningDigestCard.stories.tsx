import type { Meta, StoryObj } from "@storybook/react";
import { MorningDigestCard } from "@commandry/ui";

const meta = {
  title: "Records/MorningDigestCard",
  component: MorningDigestCard,
  parameters: { layout: "centered" },
  args: {
    item: {
      id: "3c91aa39-37f4-47ab-a2df-2fdb176555af",
      kind: "automation",
      title: "Investigate synthetic monitor down",
      actorLabel: "Local automation worker",
      outcome: "awaiting_review",
      summary:
        "Synthetic monitor.down event prompted this project summary. No work was executed or verified.",
      completedAt: "2026-09-26T06:00:00.000Z",
      href: "/automations/24d1cc30-5abc-4f51-8f75-d2e655139272",
      evidenceHref:
        "/api/v1/automation-runs/3c91aa39-37f4-47ab-a2df-2fdb176555af",
      sourceEvidenceHref: "/api/v1/events/d131a0c1-6374-49c8-87bd-b29aa92a6419",
      sourceLabel: "Synthetic local automation",
    },
  },
} satisfies Meta<typeof MorningDigestCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AwaitingReview: Story = {};
export const Skipped: Story = {
  args: {
    item: {
      ...meta.args.item,
      outcome: "skipped",
      summary: "Disabled when the synthetic event was processed.",
    },
  },
};
