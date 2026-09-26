import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig, devices } from "@playwright/test";

if (!process.env.PLAYWRIGHT_BASE_URL) {
  if (!existsSync(".env.local")) {
    throw new Error(
      "Missing .env.local. Run `pnpm setup` before `pnpm test:e2e`.",
    );
  }
  loadEnvFile(".env.local");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @commandry/web dev",
        url: "http://127.0.0.1:3000/health/live",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
