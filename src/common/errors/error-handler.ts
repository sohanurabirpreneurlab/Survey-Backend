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

export const errorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void => {
  const requestId = request.requestId ?? null;

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      },
      meta: {
        requestId
      }
    });
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
