import type { Meta, StoryObj } from "@storybook/react";
import { LocalReleaseRehearsalCard } from "@commandry/ui";

const rehearsal = {
  id: "0e1184f3-e9ae-4937-9449-dde3f868282a",
  outcome: "passed" as const,
  sourceLabel: "Isolated local application rollback rehearsal",
  previousRevision: "a".repeat(40),
  candidateRevision: "b".repeat(40),
  initialWebVerified: true,
  initialWorkerVerified: true,
  candidateWebVerified: true,
  candidateWorkerVerified: true,
  rollbackWebVerified: true,
  rollbackWorkerVerified: true,
  sourceSchemaTableCount: 86,
  isolatedSchemaTableCount: 86,
  errorCode: null,
  completedAt: "2026-09-27T16:00:00.000Z",
};

const meta = {
  title: "Patterns/Local release rehearsal fixture",
  component: LocalReleaseRehearsalCard,
  args: { rehearsal },
  decorators: [
    (Story) => (
      <div style={{ width: "min(100%, 28rem)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocalReleaseRehearsalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RolledBack: Story = {};
export const CandidateFailed: Story = {
  args: {
    rehearsal: {
      ...rehearsal,
      outcome: "failed",
      candidateWorkerVerified: false,
      rollbackWebVerified: false,
      rollbackWorkerVerified: false,
      errorCode: "CANDIDATE_WORKER_VERIFY",
    },
  },
};
