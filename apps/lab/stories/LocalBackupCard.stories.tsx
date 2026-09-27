import type { Meta, StoryObj } from "@storybook/react";
import { LocalBackupCard } from "@commandry/ui";

const backup = {
  id: "7595bfd8-7659-45c9-b097-e72c60764adc",
  outcome: "passed" as const,
  sourceLabel: "Encrypted local PostgreSQL archive",
  archiveBytes: 128_420,
  sourceSchemaTableCount: 81,
  restoredSchemaTableCount: 81,
  captureId: "0a77b41a-35b6-450c-8953-92e1cf3e7dd1",
  errorCode: null,
  completedAt: "2026-09-27T12:00:00.000Z",
};

const meta = {
  title: "Patterns/Local backup evidence fixture",
  component: LocalBackupCard,
  args: { backup },
  decorators: [
    (Story) => (
      <div style={{ width: "min(100%, 24rem)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocalBackupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VerifiedAtCreation: Story = {};
export const Failed: Story = {
  args: {
    backup: {
      ...backup,
      outcome: "failed",
      archiveBytes: 0,
      restoredSchemaTableCount: 0,
      errorCode: "BACKUP_RESTORE",
    },
  },
};
