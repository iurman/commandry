import type { Meta, StoryObj } from "@storybook/react";
import { LocalAgentCallbackTimeline } from "@commandry/ui";

const events = [
  {
    id: "c37d2189-d006-4ead-af53-b05c5b601e06",
    attemptId: "cd650df1-485b-4e41-af4d-e9eff5d80ebd",
    sequence: 5,
    kind: "artifact" as const,
    stage: null,
    artifactName: "synthetic-run-report.json" as const,
    artifactBytes: 425,
    artifactSha256: "a".repeat(64),
    sourceLabel: "Synthetic local runner callback",
    createdAt: "2026-09-27T12:05:00.000Z",
  },
  {
    id: "5d8b8fe0-3201-46c6-9526-72b168058037",
    attemptId: "cd650df1-485b-4e41-af4d-e9eff5d80ebd",
    sequence: 4,
    kind: "heartbeat" as const,
    stage: "result_prepared" as const,
    artifactName: null,
    artifactBytes: null,
    artifactSha256: null,
    sourceLabel: "Synthetic local runner callback",
    createdAt: "2026-09-27T12:04:00.000Z",
  },
];

const meta = {
  title: "Agents/Local runner callback timeline fixture",
  component: LocalAgentCallbackTimeline,
  args: {
    runId: "152b30c5-f695-4cfd-bd4e-bc35726efeda",
    events,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(100%, 42rem)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocalAgentCallbackTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Completed: Story = {};
export const AwaitingCallback: Story = { args: { events: [] } };
