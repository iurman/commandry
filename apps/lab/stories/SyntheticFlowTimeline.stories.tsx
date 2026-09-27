import type { Meta, StoryObj } from "@storybook/react";
import { SyntheticFlowTimeline } from "@commandry/ui";

const meta = {
  title: "Activity/SyntheticFlowTimeline",
  component: SyntheticFlowTimeline,
  parameters: { layout: "padded" },
  args: {
    stages: [
      {
        id: "import:fixture:queued",
        kind: "import_queued",
        title: "Fixture import accepted",
        detail: "Commandry recorded a local synthetic import request.",
        recordedAt: "2026-09-27T12:00:00.000Z",
        occurredAt: null,
        href: "/api/v1/synthetic-event-imports/00000000-0000-4000-8000-000000000001",
        isSynthetic: true,
      },
      {
        id: "event:fixture",
        kind: "event_projected",
        title: "Normalized synthetic event projected",
        detail: "monitor.down: Fixture service reported unavailable.",
        recordedAt: "2026-09-27T12:00:01.000Z",
        occurredAt: "2026-09-27T11:58:00.000Z",
        href: "/api/v1/events/00000000-0000-4000-8000-000000000002",
        isSynthetic: true,
      },
    ],
  },
} satisfies Meta<typeof SyntheticFlowTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StoredReplay: Story = {};
