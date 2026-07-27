import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";

const buckets = new Map<string, { count: number; resetAt: number }>();

export const createSimpleRateLimit = (input: {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
}) => {
  return (request: Request, _response: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${input.keyPrefix}:${request.ip ?? "unknown"}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + input.windowMs });
      next();
      return;
    }

    if (existing.count >= input.maxRequests) {
      next(new AppError(ERROR_CODES.forbidden, "Too many requests. Please try again later.", 429));
      return;
    }

    existing.count += 1;
    buckets.set(key, existing);
    next();
  };
};
