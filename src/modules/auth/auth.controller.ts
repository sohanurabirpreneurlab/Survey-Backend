import type { Request, Response } from "express";

import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { sendCreated, sendSuccess } from "../../common/http/api-response";
import { AuthService } from "./auth.service";

const authService = new AuthService();

export const register = async (request: Request, response: Response): Promise<void> => {
  const result = await authService.register({
    email: request.body.email,
    fullName: request.body.fullName,
    password: request.body.password
  });

  sendCreated(
    response,
    "Registration completed. Your account is waiting for approval.",
    result
  );
};

export const login = async (request: Request, response: Response): Promise<void> => {
  const result = await authService.login({
    email: request.body.email,
    password: request.body.password
  });

  sendSuccess(
    response,
    result.accessState === "approved"
      ? "Login successful."
      : result.accessState === "pending_approval"
        ? "Your account is waiting for approval."
        : result.accessState === "rejected"
          ? "Your account has been rejected."
          : "Your account has been suspended.",
    result
  );
};

export const getCurrentUser = async (request: Request, response: Response): Promise<void> => {
  const result = await authService.getCurrentUser(
    request.auth!.userId,
    request.auth!.email
  );
  sendSuccess(response, "Current user retrieved successfully.", result);
};

export const logout = async (_request: Request, response: Response): Promise<void> => {
  if (_request.auth?.sessionId) {
    await authService.logout(_request.auth.sessionId);
  }

  sendSuccess(response, "Logout successful.", null);
};

export const refresh = async (request: Request, response: Response): Promise<void> => {
  const result = await authService.refresh(String(request.body.refreshToken));
  sendSuccess(response, "Session refreshed successfully.", result);
};

export const forgotPassword = async (request: Request, response: Response): Promise<void> => {
  try {
    await authService.requestPasswordReset(String(request.body.email));
  } catch {
    // Keep the response generic so the endpoint does not reveal account existence.
  }

  sendSuccess(
    response,
    "If an eligible account exists, password reset instructions have been sent.",
    null
  );
};

export const resetPassword = async (request: Request, response: Response): Promise<void> => {
  const authorizationHeader = request.header("authorization");
  const token = authorizationHeader?.split(" ")[1];

  if (!token) {
    throw new AppError(
      ERROR_CODES.authenticationRequired,
      "A bearer token is required.",
      401
    );
  }

  await authService.resetPassword(token, String(request.body.newPassword));
  sendSuccess(response, "Password reset successful.", null);
};
