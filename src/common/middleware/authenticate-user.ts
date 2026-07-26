import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";
import { verifyAccessToken } from "../security/access-token";
import { AuthRepository } from "../../modules/auth/auth.repository";

const getBearerToken = (request: Request): string => {
  const authorizationHeader = request.header("authorization");

  if (!authorizationHeader) {
    throw new AppError(
      ERROR_CODES.authenticationRequired,
      "A bearer token is required.",
      401
    );
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The bearer token is invalid.", 401);
  }

  return token;
};

const authRepository = new AuthRepository();

export const authenticateUser = async (
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = getBearerToken(request);
    const verifiedUser = verifyAccessToken(token);
    const activeSession = await authRepository.findActiveSessionById(verifiedUser.sessionId);

    if (!activeSession || activeSession.userId !== verifiedUser.userId) {
      throw new AppError(ERROR_CODES.authSessionExpired, "The authentication session has expired.", 401);
    }

    const authUser = {
      userId: verifiedUser.userId,
      email: verifiedUser.email,
      sessionId: verifiedUser.sessionId
    };

    request.auth = authUser;
    request.admin = authUser;

    next();
  } catch (error) {
    next(error);
  }
};
