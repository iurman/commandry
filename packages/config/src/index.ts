import { z } from "zod";

const postgresUrl = z
  .url()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    {
      message: "must use the PostgreSQL protocol",
    },
  );

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const environmentSchema = z.object({
  APP_ENV: z.enum(["local", "test", "preview", "production"]),
  APP_ORIGIN: z.url(),
  DATABASE_URL: postgresUrl,
  DATABASE_MIGRATION_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    postgresUrl.optional(),
  ),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().min(32),
  INITIAL_ADMIN_EMAIL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.email().optional(),
  ),
  RELEASE_SHA: z.string().min(1),
  RELEASE_IMAGE_DIGEST: optionalString,
  RELEASE_BUILD_TIME: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.iso.datetime({ offset: true }).optional(),
  ),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  BOSS_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  LOCAL_APPROVAL_AUTO_CEILING: z
    .enum(["read_only", "reversible"])
    .default("reversible"),
  LOCAL_APPROVAL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(3_600),
});

export type RuntimeConfig = {
  appEnv: "local" | "test" | "preview" | "production";
  appOrigin: string;
  databaseUrl: string;
  databaseMigrationUrl?: string;
  betterAuthSecret: string;
  appEncryptionKey: string;
  initialAdminEmail?: string;
  releaseSha: string;
  releaseImageDigest?: string;
  releaseBuildTime?: string;
  dbPoolMax: number;
  bossPoolMax: number;
  localApprovalAutoCeiling: "read_only" | "reversible";
  localApprovalTtlSeconds: number;
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function loadRuntimeConfig(
  source: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new ConfigurationError(
      `Invalid runtime configuration: ${fields.join(", ")}`,
    );
  }

  const value = result.data;
  if (value.APP_ENV === "preview" || value.APP_ENV === "production") {
    throw new ConfigurationError(
      "Public environments are disabled until human sign-in and recovery are decided (OQ-003).",
    );
  }

  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  const origin = new URL(value.APP_ORIGIN);
  if (origin.protocol !== "http:" || !localHosts.has(origin.hostname)) {
    throw new ConfigurationError(
      "Local runtime APP_ORIGIN must use HTTP on a loopback host.",
    );
  }
  const databaseHosts = new Set([...localHosts, "postgres"]);
  if (!databaseHosts.has(new URL(value.DATABASE_URL).hostname)) {
    throw new ConfigurationError(
      "Local runtime DATABASE_URL must point to local PostgreSQL.",
    );
  }
  if (
    value.DATABASE_MIGRATION_URL &&
    !databaseHosts.has(new URL(value.DATABASE_MIGRATION_URL).hostname)
  ) {
    throw new ConfigurationError(
      "Local runtime DATABASE_MIGRATION_URL must point to local PostgreSQL.",
    );
  }

  return {
    appEnv: value.APP_ENV,
    appOrigin: value.APP_ORIGIN,
    databaseUrl: value.DATABASE_URL,
    ...(value.DATABASE_MIGRATION_URL && {
      databaseMigrationUrl: value.DATABASE_MIGRATION_URL,
    }),
    betterAuthSecret: value.BETTER_AUTH_SECRET,
    appEncryptionKey: value.APP_ENCRYPTION_KEY,
    ...(value.INITIAL_ADMIN_EMAIL && {
      initialAdminEmail: value.INITIAL_ADMIN_EMAIL,
    }),
    releaseSha: value.RELEASE_SHA,
    ...(value.RELEASE_IMAGE_DIGEST && {
      releaseImageDigest: value.RELEASE_IMAGE_DIGEST,
    }),
    ...(value.RELEASE_BUILD_TIME && {
      releaseBuildTime: value.RELEASE_BUILD_TIME,
    }),
    dbPoolMax: value.DB_POOL_MAX,
    bossPoolMax: value.BOSS_POOL_MAX,
    localApprovalAutoCeiling: value.LOCAL_APPROVAL_AUTO_CEILING,
    localApprovalTtlSeconds: value.LOCAL_APPROVAL_TTL_SECONDS,
  };
}

export function loadMigrationConfig(
  source: Record<string, string | undefined> = process.env,
): RuntimeConfig & { databaseMigrationUrl: string } {
  const config = loadRuntimeConfig(source);
  if (!config.databaseMigrationUrl) {
    throw new ConfigurationError(
      "DATABASE_MIGRATION_URL is required for migrations.",
    );
  }
  return { ...config, databaseMigrationUrl: config.databaseMigrationUrl };
}
