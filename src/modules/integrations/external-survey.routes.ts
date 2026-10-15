import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { validateRequest } from "../../common/middleware/validate-request";
import { createSimpleRateLimit } from "../../common/middleware/simple-rate-limit";
import { env } from "../../config/env";
import { getSurveyInfo, getSurveyCompletionStatus, resolveSurveyInvitation, sendSurveyInvitationEmail } from "./external-survey.controller";
import {
  getExternalSurveyInfoValidators,
  getSurveyCompletionStatusValidators,
  sendSurveyInvitationEmailValidators,
  resolveExternalSurveyInvitationValidators
} from "./external-survey.validators";
import { authenticateIntegrationByHeader } from "./integration-header.middleware";

const externalSurveyRouter = Router();

externalSurveyRouter.post(
  "/survey-invitations/send",
  createSimpleRateLimit({
    keyPrefix: "integration-survey-send",
    maxRequests: env.integrationResolveRateLimitMaxRequests,
    windowMs: env.integrationResolveRateLimitWindowMs
  }),
  authenticateIntegrationByHeader,
  sendSurveyInvitationEmailValidators,
  validateRequest,
  asyncHandler(sendSurveyInvitationEmail)
);

externalSurveyRouter.post(
  "/survey-completion-status",
  createSimpleRateLimit({
    keyPrefix: "integration-survey-completion",
    maxRequests: env.integrationResolveRateLimitMaxRequests,
    windowMs: env.integrationResolveRateLimitWindowMs
  }),
  authenticateIntegrationByHeader,
  getSurveyCompletionStatusValidators,
  validateRequest,
  asyncHandler(getSurveyCompletionStatus)
);

externalSurveyRouter.post(
  "/survey-invitations/resolve",
  createSimpleRateLimit({
    keyPrefix: "integration-survey-resolve",
    maxRequests: env.integrationResolveRateLimitMaxRequests,
    windowMs: env.integrationResolveRateLimitWindowMs
  }),
  authenticateIntegrationByHeader,
  resolveExternalSurveyInvitationValidators,
  validateRequest,
  asyncHandler(resolveSurveyInvitation)
);

externalSurveyRouter.post(
  "/getSurveyInfo",
  createSimpleRateLimit({
    keyPrefix: "integration-survey-info",
    maxRequests: env.integrationResolveRateLimitMaxRequests,
    windowMs: env.integrationResolveRateLimitWindowMs
  }),
  authenticateIntegrationByHeader,
  getExternalSurveyInfoValidators,
  validateRequest,
  asyncHandler(getSurveyInfo)
);

export { externalSurveyRouter };
