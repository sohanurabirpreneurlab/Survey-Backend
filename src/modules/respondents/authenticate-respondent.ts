import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { hashToken } from "../../common/security/token-hash";
import { env } from "../../config/env";
import { RespondentRepository } from "./respondent.repository";

const respondentRepository = new RespondentRepository();

export const authenticateRespondent = async (
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!env.respondentCookieName) {
      throw new AppError(
        ERROR_CODES.internalServerError,
        "Respondent sessions are not configured.",
        503
      );
    }

    const rawSessionToken = request.cookies?.[env.respondentCookieName];

    if (!rawSessionToken || typeof rawSessionToken !== "string") {
      throw new AppError(
        ERROR_CODES.respondentSessionInvalid,
        "A valid respondent session is required.",
        401
      );
    }

    const session = await respondentRepository.findSessionByTokenHash(hashToken(rawSessionToken));

    if (!session) {
      throw new AppError(ERROR_CODES.respondentSessionInvalid, "Respondent session was not found.", 401);
    }

    if (session.status === "revoked" || session.revokedAt) {
      throw new AppError(ERROR_CODES.respondentSessionRevoked, "Respondent session was revoked.", 401);
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new AppError(ERROR_CODES.respondentSessionExpired, "Respondent session expired.", 401);
    }

    request.respondent = {
      invitationId: session.invitationId,
      sessionId: session.id,
      surveyId: session.surveyId,
      surveyVersionId: session.surveyVersionId
    };

    await respondentRepository.touchSession(session.id);
    next();
  } catch (error) {
    next(error);
  }
};
