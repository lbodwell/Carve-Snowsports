export type ApplicationErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "VERSION_CONFLICT"
  | "INVALID_STATE";

export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, Array<string>>,
    readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
