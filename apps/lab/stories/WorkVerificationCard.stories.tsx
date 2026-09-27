import type { Meta, StoryObj } from "@storybook/react";
import { WorkVerificationCard } from "@commandry/ui";

const meta = {
  title: "Records/WorkVerificationCard",
  component: WorkVerificationCard,
  args: {
    currentVersion: 2,
    review: {
      id: "48b99b14-5a91-4d80-ac0f-941377a2d431",
      acceptanceVersion: 2,
      result: "met",
      note: "The attached local test log covers the saved acceptance criteria.",
      documentTitle: "Local test log",
      sourceCaptureId: "5f654dbc-2bb9-4ed2-af9d-d63798c8dc3e",
      downloadHref:
        "/api/v1/captures/5f654dbc-2bb9-4ed2-af9d-d63798c8dc3e/original-file",
      createdAt: "2026-09-26T11:00:00.000Z",
    },
  },
} satisfies Meta<typeof WorkVerificationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentClaim: Story = {};

export const EarlierClaim: Story = {
  args: { currentVersion: 3 },
};
