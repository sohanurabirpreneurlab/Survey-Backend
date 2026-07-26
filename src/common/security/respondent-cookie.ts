import type { CookieOptions, Response } from "express";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";
import { env } from "../../config/env";

const buildCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: env.nodeEnv === "production"
});

const getRespondentCookieConfig = () => {
  if (!env.respondentCookieName || !env.respondentSessionTtlMinutes) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      "Respondent session cookies are not configured.",
      503
    );
  }

  return {
    cookieName: env.respondentCookieName,
    sessionTtlMinutes: env.respondentSessionTtlMinutes
  };
};

export const setRespondentSessionCookie = (response: Response, rawSessionToken: string): void => {
  const config = getRespondentCookieConfig();

  response.cookie(config.cookieName, rawSessionToken, {
    ...buildCookieOptions(),
    maxAge: config.sessionTtlMinutes * 60 * 1000
  });
};

export const clearRespondentSessionCookie = (response: Response): void => {
  response.clearCookie(getRespondentCookieConfig().cookieName, buildCookieOptions());
};
