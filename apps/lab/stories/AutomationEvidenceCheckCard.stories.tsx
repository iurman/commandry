import type { Meta, StoryObj } from "@storybook/react";
import { AutomationEvidenceCheckCard } from "@commandry/ui";

const meta = {
  title: "Records/AutomationEvidenceCheckCard",
  component: AutomationEvidenceCheckCard,
  parameters: { layout: "centered" },
  args: {
    check: {
      id: "55555555-5555-4555-8555-555555555555",
      status: "complete",
      evidenceCount: 3,
      missing: [],
      checkedAt: "2026-09-27T10:00:00.000Z",
    },
  },
} satisfies Meta<typeof AutomationEvidenceCheckCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Present: Story = {};
export const Missing: Story = {
  args: {
    check: {
      id: "55555555-5555-4555-8555-555555555555",
      status: "missing",
      evidenceCount: 3,
      missing: [{ kind: "event", id: "66666666-6666-4666-8666-666666666666" }],
      checkedAt: "2026-09-27T10:00:00.000Z",
    },
  },
};
