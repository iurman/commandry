import type { Meta, StoryObj } from "@storybook/react";
import { LocalFileTextCard } from "@commandry/ui";

const meta = {
  title: "Records/LocalFileTextCard",
  component: LocalFileTextCard,
  args: {
    projection: {
      captureId: "ccf69374-201f-4fd0-bd07-7c3a80ce700b",
      sourceSha256:
        "e096eb2e940bd605d48a9c99fb14fb3834d92fb78fc4c227ba26416931254cb8",
      status: "extracted",
      extractor: "local-utf8-v1",
      extractedText:
        "# Field notes\nObserved a restart during the local drill. The original Markdown remains separately downloadable.",
      truncated: false,
      message: null,
      updatedAt: "2026-09-27T10:00:00.000Z",
    },
  },
} satisfies Meta<typeof LocalFileTextCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Extracted: Story = {};
export const Unsupported: Story = {
  args: {
    projection: {
      ...meta.args.projection,
      status: "unsupported",
      extractedText: null,
      message: "This file type has no local text extractor.",
    },
  },
};
export const Pending: Story = {
  args: {
    projection: {
      ...meta.args.projection,
      status: "pending",
      extractedText: null,
    },
  },
};
