import type {
  ChangeNotificationStateRequest,
  Notification,
  NotificationAuditEvent,
} from "@commandry/contracts";

type PageQuery = { limit: number; cursor?: string | undefined };

export interface NotificationPort {
  list(
    query: PageQuery & {
      view: "active" | "all";
      projectId?: string | undefined;
    },
  ): Promise<{
    items: Notification[];
    nextCursor: string | null;
  }>;
  getById(id: string): Promise<Notification | null>;
  changeState(
    id: string,
    input: ChangeNotificationStateRequest,
  ): Promise<Notification>;
  listAudit(
    id: string,
    query: PageQuery,
  ): Promise<{
    items: NotificationAuditEvent[];
    nextCursor: string | null;
  }>;
}

export function createNotificationService(port: NotificationPort) {
  return {
    list: port.list,
    getById: port.getById,
    changeState: port.changeState,
    listAudit: port.listAudit,
  };
}
