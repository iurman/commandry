import type { Meta, StoryObj } from "@storybook/react";
import { LocalReleasePreflightCard } from "@commandry/ui";

const preflight = {
  id: "8d709fa6-ece0-4e33-b2a3-8cb43b1a045e",
  sourceLabel: "Local Compose release preflight",
  outcome: "passed" as const,
  checkoutRevision: "a".repeat(40),
  imageId: `sha256:${"b".repeat(64)}`,
  versionSha: "campaign",
  checks: {
    postgresHealthy: true,
    webHealthy: true,
    workerHealthy: true,
    migrationExited: true,
    revisionKnown: true,
    sameImage: true,
    versionReachable: true,
    apiRead: true,
    heartbeatFresh: true,
    localEvidence: true,
  },
  backupEvidenceId: "5bdec5ea-b736-4760-a9ab-b4208221e7eb",
  recoveryEvidenceId: "bbba004e-2a21-456f-aa7c-f4721b2d62c8",
  releaseEvidenceId: "785b660a-87da-4d98-8715-10ba336765d4",
  errorCode: null,
  completedAt: "2026-09-27T16:00:00.000Z",
};

const meta = {
  title: "Patterns/Local release preflight fixture",
  component: LocalReleasePreflightCard,
  args: { preflight },
  decorators: [
    (Story) => (
      <div style={{ width: "min(100%, 28rem)" }}>
        <p>Storybook fixture. No live preflight was run for this story.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocalReleasePreflightCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Passed: Story = {};
export const MissingWorkerHeartbeat: Story = {
  args: {
    preflight: {
      ...preflight,
      outcome: "failed",
      checks: { ...preflight.checks, heartbeatFresh: false },
      errorCode: "WORKER_HEARTBEAT_STALE",
    },
  },
};
