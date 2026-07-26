import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";
import { UserProfileRepository } from "../../modules/auth/user-profile.repository";

const userProfileRepository = new UserProfileRepository();

export const requireApprovedAccount = async (
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!request.auth) {
      throw new AppError(
        ERROR_CODES.authenticationRequired,
        "Authentication is required.",
        401
      );
    }

    const profile = await userProfileRepository.findByUserId(request.auth.userId);

    if (!profile) {
      throw new AppError(
        ERROR_CODES.userProfileNotFound,
        "Account profile is missing.",
        403
      );
    }

    request.account = {
      accountStatus: profile.accountStatus,
      approvedAt: profile.approvedAt,
      fullName: profile.fullName,
      rejectedAt: profile.rejectedAt,
      role: profile.role,
      suspendedAt: profile.suspendedAt,
      userId: profile.userId
    };

    if (profile.accountStatus === "approved") {
      next();
      return;
    }

    if (profile.accountStatus === "pending") {
      throw new AppError(
        ERROR_CODES.accountPendingApproval,
        "Your account is waiting for approval.",
        403
      );
    }

    if (profile.accountStatus === "rejected") {
      throw new AppError(
        ERROR_CODES.accountRejected,
        "Your account has been rejected.",
        403
      );
    }

    throw new AppError(
      ERROR_CODES.accountSuspended,
      "Your account has been suspended.",
      403
    );
  } catch (error) {
    next(error);
  }
};
