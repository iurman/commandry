import type { Meta, StoryObj } from "@storybook/react";
import { LocalReleasePreflightCard } from "@commandry/ui";

const preflight = {
  id: "8d709fa6-ece0-4e33-b2a3-8cb43b1a045e",
  sourceLabel: "Local Compose release preflight",
  outcome: "passed" as const,
  sourceEvidenceVersion: 2 as const,
  checkoutRevision: "a".repeat(40),
  imageId: `sha256:${"b".repeat(64)}`,
  versionSha: "a".repeat(40),
  imageSourceRevision: "a".repeat(40),
  imageSourceClean: true,
  checkoutClean: true,
  sourceVerified: true,
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

export const DirtySource: Story = {
  args: {
    preflight: {
      ...preflight,
      outcome: "failed",
      versionSha: "local-dirty",
      imageSourceClean: false,
      checkoutClean: false,
      sourceVerified: false,
      errorCode: "SOURCE_PROVENANCE_UNVERIFIED",
    },
  },
};

export const OlderSourceUnchecked: Story = {
  args: {
    preflight: {
      ...preflight,
      sourceEvidenceVersion: 1,
      versionSha: "campaign",
      imageSourceRevision: null,
      imageSourceClean: null,
      checkoutClean: null,
      sourceVerified: null,
    },
  },
};
