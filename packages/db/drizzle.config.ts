import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/schema.ts",
    "./src/foundation-schema.ts",
    "./src/foundation-evaluation-schema.ts",
    "./src/foundation-import-schema.ts",
    "./src/foundation-improvement-schema.ts",
    "./src/foundation-finding-schema.ts",
    "./src/foundation-onboarding-schema.ts",
  ],
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_MIGRATION_URL ??
      "postgresql://unused:unused@localhost:5432/commandry",
  },
});
