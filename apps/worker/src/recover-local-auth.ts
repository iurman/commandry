import { readFileSync } from "node:fs";
import { createOwnerPasswordRecoveryService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  createDatabase,
  createOwnerPasswordRecoveryRepository,
} from "@commandry/db";

async function main() {
  const config = loadRuntimeConfig();
  if (config.humanAuthMode !== "password" || !config.initialAdminEmail) {
    throw new Error(
      "Enable the configured owner password mode and set INITIAL_ADMIN_EMAIL before recovery.",
    );
  }
  if (process.stdin.isTTY) {
    throw new Error(
      "Pipe the owner email and new password through standard input.",
    );
  }
  const input = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  const divider = input.indexOf("\n");
  if (divider < 0) {
    throw new Error(
      "Supply the owner email and new password on separate lines.",
    );
  }
  const confirmedEmail = input.slice(0, divider).replace(/\r$/, "");
  const newPassword = input.slice(divider + 1);
  const connection = createDatabase({
    connectionString: config.databaseUrl,
    max: 1,
  });
  try {
    const service = createOwnerPasswordRecoveryService(
      createOwnerPasswordRecoveryRepository(connection.db),
      config.appEnv === "production"
        ? "vps-operator-cli"
        : "local-operator-cli",
    );
    const result = await service.recover({
      expectedEmail: config.initialAdminEmail,
      confirmedEmail,
      newPassword,
    });
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "owner-recovery",
        environment: config.appEnv,
        operation: "auth.owner_password_recovered",
        ownerEmail: config.initialAdminEmail.toLowerCase(),
        revokedSessionCount: result.revokedSessionCount,
        auditEventId: result.auditEventId,
      }),
    );
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Owner recovery failed.",
  );
  process.exitCode = 1;
});
