import { readFileSync } from "node:fs";
import { loadRuntimeConfig } from "@commandry/config";
import { createAuth, createDatabase } from "@commandry/db";

async function main() {
  const config = loadRuntimeConfig();
  if (config.humanAuthMode !== "password" || !config.initialAdminEmail) {
    throw new Error(
      "Enable the configured owner password mode and set INITIAL_ADMIN_EMAIL before bootstrap.",
    );
  }
  if (process.stdin.isTTY) {
    throw new Error("Pipe the owner password through standard input.");
  }
  const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  if (password.length < 12 || password.length > 128) {
    throw new Error("The owner password must be 12 to 128 characters.");
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
        "A user already exists. Owner bootstrap is one-time only.",
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
        name: "Commandry owner",
        email: config.initialAdminEmail,
        password,
      },
      headers: new Headers({ origin: config.appOrigin }),
    });
    if (
      !result.user ||
      result.user.email.toLowerCase() !== config.initialAdminEmail.toLowerCase()
    ) {
      throw new Error("Owner bootstrap did not return the configured owner.");
    }
    console.log(`Created one Commandry owner: ${result.user.email}`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Owner bootstrap failed.",
  );
  process.exitCode = 1;
});
