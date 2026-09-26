import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import type { CommandryDatabase } from "./client";
import { authSchema } from "./schema";

/** Persistence and sessions only. A human sign-in and recovery method is still an open product decision. */
export function createAuth(options: {
  db: CommandryDatabase;
  secret: string;
  baseURL: string;
}) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema: authSchema,
    }),
  });
}
