import type { Meta, StoryObj } from "@storybook/react";
import { WorkAttachmentCard } from "@commandry/ui";

const meta = {
  title: "Records/WorkAttachmentCard",
  component: WorkAttachmentCard,
  args: {
    attachment: {
      id: "5eb23d0b-d98a-4e2b-b9e0-d10f2880254d",
      workItemId: "30f3a0ae-f1fc-4e6e-a180-65e6b3d82f5a",
      workTitle: "Inspect irrigation timing",
      knowledgeItemId: "49a1583b-aa28-4107-b0b5-11747c0ad36e",
      documentTitle: "Irrigation diagram.pdf",
      sourceCaptureId: "7a829190-f3a1-413e-8be5-89a04d101c74",
      originalName: "Field survey.pdf",
      byteSize: 384_120,
      sha256: "a".repeat(64),
      downloadHref:
        "/api/v1/captures/7a829190-f3a1-413e-8be5-89a04d101c74/original-file",
      createdAt: "2026-09-26T16:00:00.000Z",
    },
    showWorkLink: false,
  },
} satisfies Meta<typeof WorkAttachmentCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const TaskDocument: Story = {};
export const SharedDocument: Story = {
  args: {
    attachment: {
      ...meta.args.attachment,
      contextLinkId: "30f3a0ae-f1fc-4e6e-a180-65e6b3d82f5a",
    },
  },
};
