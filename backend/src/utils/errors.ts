export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    options?: { isOperational?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
  }
}
