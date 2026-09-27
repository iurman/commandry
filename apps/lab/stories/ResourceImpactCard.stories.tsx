import type { Meta, StoryObj } from "@storybook/react";
import { ResourceImpactCard } from "@commandry/ui";

const database = {
  id: "157af635-ed2d-4a5b-a57d-dda4493b2df2",
  name: "Fixture database",
};
const api = {
  id: "82fdc68d-2f03-48ad-aed2-4ded2e292497",
  name: "Fixture API",
};
const website = {
  id: "9e38c60a-2f29-48b6-b793-c2f7ccb188f4",
  name: "Fixture website",
};

const meta = {
  title: "Patterns/Resource impact",
  component: ResourceImpactCard,
  args: {
    impact: {
      resource: { ...website, kind: "service" },
      depth: 2,
      path: [database, api, website],
      reason:
        "Fixture website is connected to Fixture database by 2 manually recorded dependency links. This is potential impact, not an observed outage.",
      projects: [
        {
          id: "a9357d8d-b3a6-4fa1-a489-d3c179d393ba",
          name: "Fixture storefront project",
          resourceId: website.id,
        },
      ],
    },
  },
} satisfies Meta<typeof ResourceImpactCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoHopProject: Story = {};
export const DirectWithoutProject: Story = {
  args: {
    impact: {
      resource: { ...api, kind: "service" },
      depth: 1,
      path: [database, api],
      reason:
        "Fixture API is connected to Fixture database by 1 manually recorded dependency link. This is potential impact, not an observed outage.",
      projects: [],
    },
  },
};
