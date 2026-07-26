import type { NextFunction, Request, Response } from "express";

import { authenticateUser } from "./authenticate-user";
import { requireApprovedAccount } from "./require-approved-account";
import { requireAdminAccount } from "./require-admin-account";

export const authenticateAdmin = async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  await authenticateUser(request, response, async (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }

    await requireApprovedAccount(request, response, (approvalError?: unknown) => {
      if (approvalError) {
        next(approvalError);
        return;
      }

      requireAdminAccount(request, response, next);
    });
  });
};
