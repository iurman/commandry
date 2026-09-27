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

export const FileOriginal: Story = {
  args: {
    capture: {
      ...syntheticCapture,
      inputType: "file",
      originalContent: "capture-file://00000000-0000-4000-8000-000000000001",
      file: {
        originalName: "Synthetic field log.txt",
        mediaType: "text/plain",
        byteSize: 184,
        sha256: "a".repeat(64),
        downloadHref:
          "/api/v1/captures/00000000-0000-4000-8000-000000000001/original-file",
      },
    },
  },
};
