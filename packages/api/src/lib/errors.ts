export const ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
}

export function validationError(message = "Validation failed"): AppError {
  return new AppError(ERROR_CODES.VALIDATION_ERROR, message, 400);
}

export function internalError(message = "Internal server error"): AppError {
  return new AppError(ERROR_CODES.INTERNAL_ERROR, message, 500);
}
