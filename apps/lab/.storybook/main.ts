import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/nextjs-vite",
    options: { nextConfigPath: "../web/next.config.ts" },
  },
  core: { disableTelemetry: true },
};

export default config;
