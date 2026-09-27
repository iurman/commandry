import type { Meta, StoryObj } from "@storybook/react";
import { WorkBoardCard } from "@commandry/ui";

const meta = {
  title: "Work/WorkBoardCard",
  component: WorkBoardCard,
  parameters: { layout: "padded" },
  args: {
    item: {
      id: "02653898-09d7-49e9-b9cf-4abf71e6339f",
      projectId: "995483f0-61b8-4b38-97a7-147d158e759f",
      projectName: "Garden irrigation",
      sourceCaptureId: "50acfe47-4f66-4350-9bc1-a967cb977021",
      title: "Check the valve before the next watering cycle",
      priority: "high",
      dueOn: "2026-09-28",
      assigneeLabel: "Local user (unattributed)",
      status: "open",
    },
    onChangeStatus: () => undefined,
  },
} satisfies Meta<typeof WorkBoardCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Done: Story = {
  args: {
    item: { ...meta.args.item, status: "done", dueOn: null },
  },
};
