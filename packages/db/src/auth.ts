import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { authSchema, user } from "./schema";

/** Owner password sign-in is provisional; OQ-003 still governs the canonical login and recovery choice. */
export function createAuth(options: {
  db: CommandryDatabase;
  secret: string;
  baseURL: string;
  adminEmail?: string;
  passwordLoginEnabled?: boolean;
  allowBootstrap?: boolean;
  trustedOrigins?: string[];
}) {
  const adminEmail = options.adminEmail?.toLowerCase();
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    emailAndPassword: {
      enabled: options.passwordLoginEnabled ?? false,
      disableSignUp: !options.allowBootstrap,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema: authSchema,
    }),
    databaseHooks: {
      user: {
        create: {
          before: async (candidate) =>
            !!adminEmail && candidate.email.toLowerCase() === adminEmail,
        },
        update: {
          before: async (candidate) =>
            !candidate.email ||
            (!!adminEmail && candidate.email.toLowerCase() === adminEmail),
        },
      },
      session: {
        create: {
          before: async (candidate) => {
            if (!adminEmail) return false;
            const [owner] = await options.db
              .select({ email: user.email })
              .from(user)
              .where(eq(user.id, candidate.userId))
              .limit(1);
            return owner?.email.toLowerCase() === adminEmail;
          },
        },
      },
    },
  });
}
