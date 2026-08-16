import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { validateRequest } from "../../common/middleware/validate-request";
import { createSimpleRateLimit } from "../../common/middleware/simple-rate-limit";
import { env } from "../../config/env";
import { resolveSurveyInvitation } from "./external-survey.controller";
import { resolveExternalSurveyInvitationValidators } from "./external-survey.validators";
import { authenticateIntegration } from "./integration-auth.middleware";

const externalSurveyRouter = Router();

externalSurveyRouter.post(
  "/survey-invitations/resolve",
  createSimpleRateLimit({
    keyPrefix: "integration-survey-resolve",
    maxRequests: env.integrationResolveRateLimitMaxRequests,
    windowMs: env.integrationResolveRateLimitWindowMs
  }),
  authenticateIntegration,
  resolveExternalSurveyInvitationValidators,
  validateRequest,
  asyncHandler(resolveSurveyInvitation)
);

export { externalSurveyRouter };
