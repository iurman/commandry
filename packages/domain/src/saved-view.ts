export class SavedViewError extends Error {
  constructor(
    public readonly code:
      | "SAVED_VIEW_NOT_FOUND"
      | "SAVED_VIEW_ARCHIVED"
      | "SAVED_VIEW_CONFLICT"
      | "SAVED_VIEW_SURFACE_IMMUTABLE"
      | "PROJECT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "SavedViewError";
  }
}
