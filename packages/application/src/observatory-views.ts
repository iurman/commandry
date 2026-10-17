import {
  observatoryViewCreateSchema,
  observatoryViewUpdateSchema,
  observatoryViewDeleteSchema,
  observatoryViewReadSchema,
  observatoryViewPageQuerySchema,
  observatoryViewSchema,
  observatoryViewDeletedSchema,
  observatoryViewPageSchema,
} from "../../contracts/src/observatory-views";
import type {
  ObservatoryView,
  ObservatoryViewCreate,
  ObservatoryViewUpdate,
  ObservatoryViewDelete,
  ObservatoryViewRead,
  ObservatoryViewPageQuery,
  ObservatoryViewPage,
  ObservatoryViewDeleted,
} from "../../contracts/src/observatory-views";
import type { ObservatoryOwnerIdentity } from "./observatory-management";

export const OBSERVATORY_VIEW_POLICIES = Object.freeze({
  create: {
    scope: "owner",
    projectScope: "optional_project",
    risk: "reversible",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.view.create",
    concurrency: "expected_version",
  },
  update: {
    scope: "owner",
    projectScope: "optional_project",
    risk: "reversible",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.view.update",
    concurrency: "expected_version",
  },
  delete: {
    scope: "owner",
    projectScope: "optional_project",
    risk: "reversible",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.view.delete",
    concurrency: "expected_version",
  },
  read: {
    scope: "owner",
    projectScope: "optional_project",
    risk: "read_only",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.view.read",
    concurrency: "session_bound",
  },
});
export interface ObservatoryViewRecords {
  create(input: ObservatoryViewCreate): Promise<ObservatoryView>;
  update(input: ObservatoryViewUpdate): Promise<ObservatoryView>;
  delete(input: ObservatoryViewDelete): Promise<ObservatoryViewDeleted>;
  read(input: ObservatoryViewRead): Promise<ObservatoryView>;
  page(input: ObservatoryViewPageQuery): Promise<ObservatoryViewPage>;
}
export interface ObservatoryViewsPort {
  /** Authenticate and lock the actual canonical session through data, audit and commit. */
  withOwner<T>(
    owner: ObservatoryOwnerIdentity,
    operation: (records: ObservatoryViewRecords) => Promise<T>,
  ): Promise<T>;
}
/** Canonical views are owner-private presentation records. Resource references do
 * not grant resource access or mutate mappings. Machine tools cannot reuse this
 * owner port with a JSON identity marker or a project read capability.
 */
export function createObservatoryViewsService(port: ObservatoryViewsPort) {
  return {
    async create(owner: ObservatoryOwnerIdentity, input: unknown) {
      const value = observatoryViewCreateSchema.parse(input);
      return observatoryViewSchema.parse(
        await port.withOwner(owner, (records) => records.create(value)),
      );
    },
    async update(owner: ObservatoryOwnerIdentity, input: unknown) {
      const value = observatoryViewUpdateSchema.parse(input);
      return observatoryViewSchema.parse(
        await port.withOwner(owner, (records) => records.update(value)),
      );
    },
    async delete(owner: ObservatoryOwnerIdentity, input: unknown) {
      const value = observatoryViewDeleteSchema.parse(input);
      return observatoryViewDeletedSchema.parse(
        await port.withOwner(owner, (records) => records.delete(value)),
      );
    },
    async read(owner: ObservatoryOwnerIdentity, input: unknown) {
      const value = observatoryViewReadSchema.parse(input);
      return observatoryViewSchema.parse(
        await port.withOwner(owner, (records) => records.read(value)),
      );
    },
    async page(owner: ObservatoryOwnerIdentity, input: unknown = {}) {
      const value = observatoryViewPageQuerySchema.parse(input);
      return observatoryViewPageSchema.parse(
        await port.withOwner(owner, (records) => records.page(value)),
      );
    },
  };
}
