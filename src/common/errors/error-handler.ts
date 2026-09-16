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

const databaseConnectionErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "57P01",
  "57P02",
  "57P03"
]);

const isDatabaseConnectionError = (error: unknown): error is Error & { code?: string } => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error.message.toLowerCase();

  return (
    databaseConnectionErrorCodes.has(code) ||
    message.includes("connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("timeout expired")
  );
};

const logServerError = (error: unknown, request: Request, requestId: string | null) => {
  const errorRecord = error instanceof Error
    ? {
        code: "code" in error ? error.code : undefined,
        message: error.message,
        name: error.name,
        stack: env.nodeEnv === "production" ? undefined : error.stack
      }
    : error;

  console.error("Request failed", {
    error: errorRecord,
    method: request.method,
    path: request.safeLogPath ?? request.originalUrl,
    requestId
  });
};

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

  if (isDatabaseConnectionError(error)) {
    logServerError(error, request, requestId);
    response.status(503).json({
      success: false,
      error: {
        code: ERROR_CODES.databaseError,
        message: "The database is temporarily unavailable. Please retry the request.",
        details: null
      },
      meta: {
        requestId
      }
    });
    return;
  }

  const normalizedError = normalizeErrorResponse(error, requestId);

  if (normalizedError) {
    if (normalizedError.statusCode >= 500) {
      logServerError(error, request, requestId);
    }
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
