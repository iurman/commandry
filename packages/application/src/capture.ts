import type {
  Capture,
  CreateCaptureRequest,
  FileCaptureResponse,
  KnowledgeItem,
  SearchResult,
  WorkItem,
  WorkspaceKnowledgeItem,
  WorkspaceWorkItem,
} from "@commandry/contracts";
import {
  CaptureError,
  KnowledgeLinkError,
  manualFilingContent,
  safeKnowledgeLinkUrl,
  validateOriginalCaptureContent,
  validateWorkFilingType,
} from "@commandry/domain";

export type CapturePage<T> = { items: T[]; nextCursor: string | null };
export type CapturePageQuery = { limit: number; cursor?: string | undefined };
export type CaptureSearchQuery = CapturePageQuery & {
  q: string;
  projectId?: string | undefined;
};
export type WorkspaceRecordQuery = CapturePageQuery & {
  projectId?: string | undefined;
};
export type WorkspaceWorkQuery = WorkspaceRecordQuery & {
  status?: "open" | "done" | undefined;
};

export interface CaptureRepository {
  projectExists(projectId: string): Promise<boolean>;
  createCapture(input: CreateCaptureRequest & { id: string }): Promise<Capture>;
  getCapture(id: string): Promise<Capture | null>;
  listCaptures(query: CapturePageQuery): Promise<CapturePage<Capture>>;
  fileAsTask(input: {
    captureId: string;
    recordId: string;
    projectId: string;
    title: string;
    description: string;
    workType?: "task" | "initiative" | undefined;
  }): Promise<FileCaptureResponse>;
  fileAsNote(input: {
    captureId: string;
    recordId: string;
    projectId: string;
    title: string;
    content: string;
  }): Promise<FileCaptureResponse>;
  fileAsLink(input: {
    captureId: string;
    recordId: string;
    projectId: string;
    title: string;
    content: string;
    url: string;
  }): Promise<FileCaptureResponse>;
  fileAsDocument(input: {
    captureId: string;
    recordId: string;
    projectId: string;
    title: string;
    content: string;
  }): Promise<FileCaptureResponse>;
  listProjectWork(
    projectId: string,
    query: CapturePageQuery,
  ): Promise<CapturePage<WorkItem>>;
  listProjectKnowledge(
    projectId: string,
    query: CapturePageQuery,
  ): Promise<CapturePage<KnowledgeItem>>;
  listWork(query: WorkspaceWorkQuery): Promise<CapturePage<WorkspaceWorkItem>>;
  listKnowledge(
    query: WorkspaceRecordQuery,
  ): Promise<CapturePage<WorkspaceKnowledgeItem>>;
  search(query: CaptureSearchQuery): Promise<CapturePage<SearchResult>>;
}

export function createCaptureService(repository: CaptureRepository) {
  async function requireProject(projectId: string): Promise<void> {
    if (!(await repository.projectExists(projectId))) {
      throw new CaptureError("PROJECT_NOT_FOUND", "Project not found");
    }
  }

  return {
    async createCapture(input: CreateCaptureRequest) {
      validateOriginalCaptureContent(input.inputType, input.originalContent);
      if (input.projectId) await requireProject(input.projectId);
      return repository.createCapture({ ...input, id: crypto.randomUUID() });
    },
    getCapture(id: string) {
      return repository.getCapture(id);
    },
    listCaptures(query: CapturePageQuery) {
      return repository.listCaptures(query);
    },
    async fileCapture(
      captureId: string,
      input: {
        projectId: string;
        kind: "task" | "note" | "link" | "document";
        workType?: "task" | "initiative" | undefined;
        title: string;
        body?: string | undefined;
      },
    ) {
      const capture = await repository.getCapture(captureId);
      if (!capture) {
        throw new CaptureError("CAPTURE_NOT_FOUND", "Capture not found");
      }
      if (capture.state === "filed") {
        throw new CaptureError(
          "CAPTURE_ALREADY_FILED",
          "Capture is already filed",
        );
      }
      await requireProject(input.projectId);
      const workType = validateWorkFilingType(input.kind, input.workType);
      if (capture.inputType === "file" && input.kind !== "document")
        throw new CaptureError(
          "CAPTURE_KIND_INVALID",
          "A file capture can only be filed as a document",
        );
      if (capture.inputType !== "file" && input.kind === "document")
        throw new CaptureError(
          "CAPTURE_KIND_INVALID",
          "Only a file capture can become a document",
        );
      if (input.kind === "document")
        return repository.fileAsDocument({
          captureId,
          recordId: crypto.randomUUID(),
          projectId: input.projectId,
          title: input.title,
          content: input.body?.trim() ?? "",
        });
      const content = manualFilingContent(capture.originalContent, input.body);
      const recordId = crypto.randomUUID();
      if (input.kind === "task") {
        return repository.fileAsTask({
          captureId,
          recordId,
          projectId: input.projectId,
          title: input.title,
          description: content,
          workType,
        });
      }
      if (input.kind === "link") {
        if (capture.inputType !== "url")
          throw new KnowledgeLinkError(
            "CAPTURE_NOT_URL",
            "Only an original URL capture can be filed as a knowledge link",
          );
        return repository.fileAsLink({
          captureId,
          recordId,
          projectId: input.projectId,
          title: input.title,
          content: input.body?.trim() ?? "",
          url: safeKnowledgeLinkUrl(capture.originalContent),
        });
      }
      return repository.fileAsNote({
        captureId,
        recordId,
        projectId: input.projectId,
        title: input.title,
        content,
      });
    },
    async listProjectWork(projectId: string, query: CapturePageQuery) {
      await requireProject(projectId);
      return repository.listProjectWork(projectId, query);
    },
    async listProjectKnowledge(projectId: string, query: CapturePageQuery) {
      await requireProject(projectId);
      return repository.listProjectKnowledge(projectId, query);
    },
    listWork(query: WorkspaceWorkQuery) {
      return repository.listWork(query);
    },
    listKnowledge(query: WorkspaceRecordQuery) {
      return repository.listKnowledge(query);
    },
    search(query: CaptureSearchQuery) {
      return repository.search(query);
    },
  };
}
