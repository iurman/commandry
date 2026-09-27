import { readFileSync } from "node:fs";
import { loadRuntimeConfig } from "@commandry/config";
import { createAuth, createDatabase } from "@commandry/db";

async function main() {
  const config = loadRuntimeConfig();
  if (config.localAuthMode !== "password" || !config.initialAdminEmail) {
    throw new Error(
      "Set LOCAL_AUTH_MODE=password and INITIAL_ADMIN_EMAIL before local bootstrap.",
    );
  }
  if (process.stdin.isTTY) {
    throw new Error("Pipe the local password through standard input.");
  }
  const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  if (password.length < 12 || password.length > 128) {
    throw new Error("The local password must be 12 to 128 characters.");
  }

  const connection = createDatabase({
    connectionString: config.databaseUrl,
    max: 1,
  });
  try {
    const count = await connection.pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM "user"',
    );
    if (Number(count.rows[0]?.count) !== 0) {
      throw new Error(
        "A user already exists. Local bootstrap is one-time only.",
      );
    }
    const auth = createAuth({
      db: connection.db,
      secret: config.betterAuthSecret,
      baseURL: config.appOrigin,
      adminEmail: config.initialAdminEmail,
      passwordLoginEnabled: true,
      allowBootstrap: true,
      trustedOrigins: [config.appOrigin],
    });
    const result = await auth.api.signUpEmail({
      body: {
        name: "Local owner",
        email: config.initialAdminEmail,
        password,
      },
      headers: new Headers({ origin: config.appOrigin }),
    });
    if (
      !result.user ||
      result.user.email.toLowerCase() !== config.initialAdminEmail.toLowerCase()
    ) {
      throw new Error("Local user bootstrap did not return the owner.");
    }
    console.log(`Created one local Commandry owner: ${result.user.email}`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Local bootstrap failed.",
  );
  process.exitCode = 1;
});
