import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/schema.ts",
    "./src/foundation-schema.ts",
    "./src/foundation-evaluation-schema.ts",
  ],
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_MIGRATION_URL ??
      "postgresql://unused:unused@localhost:5432/commandry",
  },
});
