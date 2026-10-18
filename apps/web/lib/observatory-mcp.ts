import { randomUUID } from "node:crypto";
import type {
  createObservatoryReadService,
  FoundationMachineRequest,
} from "@commandry/application";
import {
  foundationTokenDigest,
  type FoundationEnvironment,
} from "@commandry/domain";
import type { ObservatorySignalEvidenceQuery } from "@commandry/contracts";

type Service = ReturnType<
  typeof createObservatoryReadService<FoundationMachineRequest>
>;
type Operation =
  | "observatory.read"
  | "observatory.signals.read"
  | "observatory.security.read"
  | "observatory.providers.read"
  | "work.read";
export type ObservatoryMcpReads = {
  [K in keyof Service]: (
    input: Record<string, unknown>,
  ) => ReturnType<Service[K]>;
};
/** Bound only by the authenticated HTTP adapter. No identity, project, grant or
 * environment is accepted in tool arguments; each call rechecks the live grant. */
export function createObservatoryMcpReads(
  service: (operation: Operation) => Service,
  token: string,
  context: { projectId: string; environment: FoundationEnvironment },
): ObservatoryMcpReads {
  const request = (operation: Operation): FoundationMachineRequest => ({
    operation,
    ...context,
    targetId: null,
    correlationId: randomUUID(),
    tokenDigest: foundationTokenDigest(token),
  });
  const query = (input: Record<string, unknown>) => ({
    ...input,
    projectId: context.projectId,
  });
  return {
    catalogue: (input) => {
      const operation: Operation =
        input.kind === "provider"
          ? "observatory.providers.read"
          : "observatory.read";
      return service(operation).catalogue(request(operation), query(input));
    },
    providerFeed: (input) =>
      service("observatory.providers.read").providerFeed(
        request("observatory.providers.read"),
        query(input),
      ),
    operationalEvidence: (input) => {
      const operation: Operation =
        input.facet === "security"
          ? "observatory.security.read"
          : input.facet === "pull_requests"
            ? "work.read"
            : "observatory.signals.read";
      return service(operation).operationalEvidence(
        request(operation),
        query(input),
      );
    },
    scene: (input) =>
      service("observatory.read").scene(
        request("observatory.read"),
        query(input),
      ),
    logo: (input) =>
      service("observatory.read").logo(
        request("observatory.read"),
        query(input),
      ),
    members: (input) =>
      service("observatory.read").members(
        request("observatory.read"),
        query(input),
      ),
    relations: (input) =>
      service("observatory.read").relations(
        request("observatory.read"),
        query(input),
      ),
    signalEvidence: (input) => {
      const facet = input.facet as ObservatorySignalEvidenceQuery["facet"];
      const operation: Operation =
        facet === "security"
          ? "observatory.security.read"
          : facet === "provider"
            ? "observatory.providers.read"
            : facet === "work"
              ? "work.read"
              : "observatory.signals.read";
      return service(operation).signalEvidence(
        request(operation),
        query(input),
      );
    },
    providerExplanation: (input) =>
      service("observatory.providers.read").providerExplanation(
        request("observatory.providers.read"),
        query(input),
      ),
  };
}
