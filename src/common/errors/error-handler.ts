import type { NextFunction, Request, Response } from "express";

import { env } from "../../config/env";
import { AppError } from "./app-error";
import { ERROR_CODES } from "./error-codes";

type ErrorResponseBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
  meta: {
    requestId: string | null;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const buildUnexpectedErrorResponse = (requestId: string | null): ErrorResponseBody => ({
  success: false,
  error: {
    code: ERROR_CODES.internalServerError,
    message: "An unexpected error occurred.",
    details: env.nodeEnv === "production" ? null : "Check server logs for details."
  },
  meta: {
    requestId
  }
});

const normalizeErrorResponse = (
  error: unknown,
  requestId: string | null
): { body: ErrorResponseBody; statusCode: number } | null => {
  if (error instanceof AppError) {
    return {
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null
        },
        meta: {
          requestId
        }
      },
      statusCode: error.statusCode
    };
  }

  if (error instanceof Error) {
    const errorRecord = error as Error & { code?: string; details?: unknown; status?: number; statusCode?: number };

    return {
      body: {
        success: false,
        error: {
          code:
            typeof errorRecord.code === "string" && errorRecord.code.trim().length > 0
              ? errorRecord.code
              : ERROR_CODES.internalServerError,
          message: error.message || "An unexpected error occurred.",
          details: errorRecord.details ?? null
        },
        meta: {
          requestId
        }
      },
      statusCode:
        typeof errorRecord.statusCode === "number"
          ? errorRecord.statusCode
          : typeof errorRecord.status === "number"
            ? errorRecord.status
            : 500
    };
  }

  if (isRecord(error) && typeof error.message === "string" && error.message.trim().length > 0) {
    return {
      body: {
        success: false,
        error: {
          code:
            typeof error.code === "string" && error.code.trim().length > 0
              ? error.code
              : ERROR_CODES.internalServerError,
          message: error.message,
          details: "details" in error ? error.details ?? null : null
        },
        meta: {
          requestId
        }
      },
      statusCode:
        typeof error.statusCode === "number"
          ? error.statusCode
          : typeof error.status === "number"
            ? error.status
            : 500
    };
  }

  return null;
};

export const errorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void => {
  const requestId = request.requestId ?? null;
  const normalizedError = normalizeErrorResponse(error, requestId);

  if (normalizedError) {
    response.status(normalizedError.statusCode).json(normalizedError.body);
    return;
  }

  console.error("Unhandled error", {
    requestId,
    method: request.method,
    path: request.originalUrl,
    error
  });

  response.status(500).json(buildUnexpectedErrorResponse(requestId));
};
