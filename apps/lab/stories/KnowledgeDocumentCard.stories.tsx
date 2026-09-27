import type { Meta, StoryObj } from "@storybook/react";
import { KnowledgeDocumentCard } from "@commandry/ui";

const meta = {
  title: "Records/KnowledgeDocumentCard",
  component: KnowledgeDocumentCard,
  args: {
    document: {
      id: "49a1583b-aa28-4107-b0b5-11747c0ad36e",
      projectId: "2b1f9e47-8c33-4217-8ea1-b4dd5f0aab41",
      projectName: "Garden plan",
      sourceCaptureId: "7a829190-f3a1-413e-8be5-89a04d101c74",
      title: "Irrigation diagram.pdf",
      content:
        "Original PDF captured locally. This context is a separate revisioned note.",
      version: 1,
    },
  },
} satisfies Meta<typeof KnowledgeDocumentCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const LocalFile: Story = {};
