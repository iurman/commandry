export function assessLocalRecovery<T extends { outcome: "passed" | "failed" }>(
  latestDrill: T | null,
) {
  return {
    environment: "local" as const,
    localRehearsal: latestDrill?.outcome ?? ("not_run" as const),
    latestDrill,
    productionReady: false as const,
    productionGates: [
      { code: "vps_inventory" as const, status: "unverified" as const },
      {
        code: "offsite_backup_restore" as const,
        status: "unverified" as const,
      },
      { code: "deployment_control" as const, status: "unverified" as const },
      {
        code: "human_sign_in_recovery" as const,
        status: "unverified" as const,
      },
    ],
  };
}
