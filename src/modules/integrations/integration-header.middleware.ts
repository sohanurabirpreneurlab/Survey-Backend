import type { NextFunction, Request, Response } from "express";

import { AuthRepository } from "../auth/auth.repository";

const INTEGRATION_USER_ID_HEADER = "x-integration-user-id";
const LEGACY_INTEGRATION_USER_ID_HEADER = "integration_user_id";
const FALLBACK_INTEGRATION_USER_ID = "ebbdb2b8-8b91-433f-994b-f1da9ebddbf0";

/** Launch-mode integration auth using the integration user ID header. */
export const authenticateIntegrationByHeader = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  const requestedUserId = (request.header(INTEGRATION_USER_ID_HEADER) ?? request.header(LEGACY_INTEGRATION_USER_ID_HEADER))?.trim();


  void (async () => {
    const requestedUser = requestedUserId
      ? await new AuthRepository().findUserByUserId(requestedUserId)
      : null;
    const userId = requestedUser?.profile.accountStatus === "approved"
      ? requestedUserId!
      : FALLBACK_INTEGRATION_USER_ID;

    request.integration = {
      issuer: "salthub",
      jwtId: null,
      scopes: [],
      userId
    };

    next();
  })().catch(next);
};
