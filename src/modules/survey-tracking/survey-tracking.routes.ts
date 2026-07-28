import { Router } from "express";
import { param, query } from "express-validator";

import { asyncHandler } from "../../common/http/async-handler";
import { authenticateUser } from "../../common/middleware/authenticate-user";
import { requireApprovedAccount } from "../../common/middleware/require-approved-account";
import { validateRequest } from "../../common/middleware/validate-request";
import {
  getTrackingResponsePreview,
  listTrackedSurveys,
  listTrackingRecipients,
  listTrackingResponses
} from "./survey-tracking.controller";

const surveyTrackingRouter = Router();

const listValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100.")
];

const surveyIdValidator = [param("surveyId").isUUID().withMessage("surveyId must be a valid UUID.")];
const responseIdValidator = [
  ...surveyIdValidator,
  param("responseId").isUUID().withMessage("responseId must be a valid UUID.")
];

surveyTrackingRouter.use(authenticateUser);
surveyTrackingRouter.use(requireApprovedAccount);

surveyTrackingRouter.get("/surveys", listValidators, validateRequest, asyncHandler(listTrackedSurveys));
surveyTrackingRouter.get(
  "/surveys/:surveyId/recipients",
  surveyIdValidator,
  validateRequest,
  asyncHandler(listTrackingRecipients)
);
surveyTrackingRouter.get(
  "/surveys/:surveyId/responses",
  surveyIdValidator,
  validateRequest,
  asyncHandler(listTrackingResponses)
);
surveyTrackingRouter.get(
  "/surveys/:surveyId/responses/:responseId",
  responseIdValidator,
  validateRequest,
  asyncHandler(getTrackingResponsePreview)
);

export { surveyTrackingRouter };
