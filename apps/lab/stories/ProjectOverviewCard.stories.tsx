import type { Meta, StoryObj } from "@storybook/react";
import { ProjectOverviewCard } from "@commandry/ui";

const meta = {
  title: "Projects/Overview source card fixture",
  component: ProjectOverviewCard,
  args: {
    title: "Recent activity",
    generatedAt: "2026-09-27T15:30:00.000Z",
    sourceListHref: "/api/v1/projects/example/activity",
    emptyState: null,
    facts: [
      {
        title: "Synthetic deployment event",
        detail: "A labeled local fixture was projected into this project.",
        evidenceHref: "/api/v1/events/example",
        sourceLabel: "Local development fixture",
        recordedAt: "2026-09-27T15:25:00.000Z",
        isSynthetic: true,
      },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(100%, 26rem)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectOverviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SyntheticEvidence: Story = {};
