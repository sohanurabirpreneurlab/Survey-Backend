import type { Request, Response } from "express";

export const notFound = (request: Request, response: Response): void => {
  response.status(404).json({
    success: false,
    error: {
      code: "RESOURCE_NOT_FOUND",
      message: `Route ${request.method} ${request.originalUrl} was not found.`,
      details: null
    },
    meta: {
      requestId: request.requestId ?? null
    }
  });
};
