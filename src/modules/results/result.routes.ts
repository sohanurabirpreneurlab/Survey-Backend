import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { validateRequest } from "../../common/middleware/validate-request";
import { getQuestionResults, getSurveyResults } from "./result.controller";
import { param } from "express-validator";

const resultRouter = Router({ mergeParams: true });
const surveyIdValidator = [param("surveyId").isUUID().withMessage("surveyId must be a valid UUID.")];
const questionIdValidator = [
  ...surveyIdValidator,
  param("questionId").isUUID().withMessage("questionId must be a valid UUID.")
];

resultRouter.get("/", surveyIdValidator, validateRequest, asyncHandler(getSurveyResults));
resultRouter.get("/questions/:questionId", questionIdValidator, validateRequest, asyncHandler(getQuestionResults));

export { resultRouter };
