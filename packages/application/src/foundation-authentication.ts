import { randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationActor,
  type FoundationClient,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationTokenDigest,
  requireFoundationGrant,
  type FoundationEnvironment,
} from "@commandry/domain";
import type { FoundationServiceOptions } from "./agent-foundation.js";

export type FoundationAuthenticationRequest = {
  tokenDigest: string;
  projectId: string;
  environment: FoundationEnvironment;
  correlationId: string;
};

/** Intrinsic credential metadata only. The callback receives no product-record port. */
export interface FoundationAuthenticationPort {
  withClientIdentity<T>(
    request: FoundationAuthenticationRequest,
    action: (client: FoundationClient) => Promise<T>,
  ): Promise<T>;
}

export function createFoundationAuthenticationService(
  port: FoundationAuthenticationPort,
  options: FoundationServiceOptions,
) {
  const environment = foundationActorSchema.shape.environment.parse(
    options.environment,
  );
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  return {
    async authenticate(
      token: string,
      rawProjectId: unknown,
    ): Promise<FoundationActor> {
      const projectId =
        foundationActorSchema.shape.projectId.parse(rawProjectId);
      const request = {
        tokenDigest: foundationTokenDigest(token),
        projectId,
        environment,
        correlationId:
          foundationActorSchema.shape.correlationId.parse(createId()),
      };
      return port.withClientIdentity(request, async (stored) => {
        const client = foundationClientSchema.parse(stored);
        const authorize = () => {
          const operation = client.operations[0];
          if (!operation)
            throw new FoundationError(
              "FORBIDDEN",
              "Credential has no capabilities",
            );
          // Validating its first existing grant does not exercise or add that capability.
          requireFoundationGrant(client, {
            projectId,
            environment,
            operation,
            now: now(),
          });
        };
        authorize();
        const actor = foundationActorSchema.parse({
          schemaVersion: 1,
          principalId: `foundation-client:${client.id}`,
          clientId: client.id,
          runId: null,
          projectId,
          environment,
          resourceIds: [],
          capabilities: client.operations,
          expiresAt: client.expiresAt,
          correlationId: request.correlationId,
        });
        authorize();
        return actor;
      });
    },
  };
}
