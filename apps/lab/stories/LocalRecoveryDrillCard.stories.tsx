import type { Meta, StoryObj } from "@storybook/react";
import { LocalRecoveryDrillCard } from "@commandry/ui";

const meta = {
  title: "Infrastructure/LocalRecoveryDrillCard",
  component: LocalRecoveryDrillCard,
  parameters: { layout: "padded" },
  args: {
    drill: {
      id: "ab4551db-d487-4273-a4cc-73ba9f312f60",
      sourceLabel: "Local disposable PostgreSQL restore rehearsal",
      outcome: "passed",
      sourceSchemaTableCount: 82,
      restoredSchemaTableCount: 82,
      sourceCaptureSha256:
        "6eb88855b05ba8774e6df1019ee460428aed692c2d872d7f15df6117311a97b8",
      restoredCaptureSha256:
        "6eb88855b05ba8774e6df1019ee460428aed692c2d872d7f15df6117311a97b8",
      backupSha256:
        "c99106538cef1134e5d9fe87959d317cfdd046a97920dff81b45db3593db56e5",
      errorCode: null,
      startedAt: "2026-09-27T09:40:00.000Z",
      completedAt: "2026-09-27T09:40:08.000Z",
    },
  },
} satisfies Meta<typeof LocalRecoveryDrillCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Passed: Story = {};
export const Failed: Story = {
  args: {
    drill: {
      ...meta.args.drill,
      outcome: "failed",
      restoredSchemaTableCount: 0,
      restoredCaptureSha256: null,
      errorCode: "BACKUP_RESTORE",
    },
  },
};
