import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";

export const requireAdminAccount = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  try {
    if (!request.account) {
      throw new AppError(
        ERROR_CODES.authenticationRequired,
        "Authentication is required.",
        401
      );
    }

    if (request.account.role !== "admin") {
      throw new AppError(
        ERROR_CODES.forbidden,
        "An admin account is required.",
        403
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
