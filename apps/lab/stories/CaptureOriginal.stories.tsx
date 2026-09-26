import type { Meta, StoryObj } from "@storybook/react";
import { CaptureOriginal, type CaptureOriginalRecord } from "@commandry/ui";

const syntheticCapture: CaptureOriginalRecord = {
  inputType: "text",
  originalContent:
    "Coolify cleanup: there may be stale deployment jobs.\nNot dealing with this now.",
  source: "manual-local",
  author: "synthetic-lab-user",
  createdAt: "2026-09-25T10:00:00.000Z",
};

function CaptureSourceExample({ capture }: { capture: CaptureOriginalRecord }) {
  return (
    <div className="lab-stack">
      <p>Synthetic lab fixture. No external source was fetched or observed.</p>
      <CaptureOriginal capture={capture} />
    </div>
  );
}

const meta = {
  title: "Patterns/Capture original",
  component: CaptureSourceExample,
  args: { capture: syntheticCapture },
} satisfies Meta<typeof CaptureSourceExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextOriginal: Story = {};
export const UrlOriginal: Story = {
  args: {
    capture: {
      ...syntheticCapture,
      inputType: "url",
      originalContent: "https://example.invalid/reference?view=original",
    },
  },
};
