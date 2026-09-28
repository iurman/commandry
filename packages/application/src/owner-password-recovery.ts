export interface OwnerPasswordRecoveryPort {
  resetOnlyOwnerPassword(input: {
    expectedEmail: string;
    newPassword: string;
    actor: "local-operator-cli" | "vps-operator-cli";
  }): Promise<{ auditEventId: string; revokedSessionCount: number }>;
}

export class OwnerPasswordRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerPasswordRecoveryError";
  }
}

export function createOwnerPasswordRecoveryService(
  port: OwnerPasswordRecoveryPort,
  actor: "local-operator-cli" | "vps-operator-cli" = "local-operator-cli",
) {
  return {
    async recover(input: {
      expectedEmail: string;
      confirmedEmail: string;
      newPassword: string;
    }) {
      const expectedEmail = input.expectedEmail.trim().toLowerCase();
      if (
        !expectedEmail ||
        input.confirmedEmail.trim().toLowerCase() !== expectedEmail
      ) {
        throw new OwnerPasswordRecoveryError(
          "The confirmed owner email does not match the configured owner.",
        );
      }
      if (input.newPassword.length < 12 || input.newPassword.length > 128) {
        throw new OwnerPasswordRecoveryError(
          "The new password must be 12 to 128 characters.",
        );
      }
      if (/[\r\n]/.test(input.newPassword)) {
        throw new OwnerPasswordRecoveryError(
          "The new password must be one line.",
        );
      }
      return port.resetOnlyOwnerPassword({
        expectedEmail,
        newPassword: input.newPassword,
        actor,
      });
    },
  };
}
