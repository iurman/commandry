import { loadRuntimeConfig } from "@commandry/config";
import { createAuth } from "@commandry/db";
import { getDatabase } from "./database";

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (!auth) {
    const config = loadRuntimeConfig();
    auth = createAuth({
      db: getDatabase().db,
      secret: config.betterAuthSecret,
      baseURL: config.appOrigin,
      ...(config.initialAdminEmail && { adminEmail: config.initialAdminEmail }),
      passwordLoginEnabled: config.humanAuthMode === "password",
      trustedOrigins: [
        config.appOrigin,
        ...(config.localAuthTrustedOrigin
          ? [config.localAuthTrustedOrigin]
          : []),
      ],
    });
  }
  return auth;
}
