import type { NextFunction, Request, Response } from "express";
import { validationResult, type ValidationError } from "express-validator";

const getIssuePath = (issue: ValidationError): string => {
  if ("path" in issue && typeof issue.path === "string") {
    return issue.path;
  }

  return "_error";
};

export const validateRequest = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const result = validationResult(request);

  if (result.isEmpty()) {
    next();
    return;
  }

  response.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "The request payload is invalid.",
      details: result.array({ onlyFirstError: true }).map((issue) => ({
        location: issue.type,
        message: issue.msg,
        path: getIssuePath(issue)
      }))
    },
    meta: {
      requestId: request.requestId ?? null
    }
  });
};
