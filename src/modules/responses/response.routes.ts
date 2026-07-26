import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { validateRequest } from "../../common/middleware/validate-request";
import { authenticateRespondent } from "../respondents/authenticate-respondent";
import { createOrResumeResponse, getCurrentResponse, saveAnswer, submitResponse } from "./response.controller";
import { saveAnswerValidators, submitResponseValidators } from "./response.validators";

const responseRouter = Router();

responseRouter.use(authenticateRespondent);
responseRouter.post("/", asyncHandler(createOrResumeResponse));
responseRouter.get("/current", asyncHandler(getCurrentResponse));
responseRouter.put("/:responseId/answers/:questionId", saveAnswerValidators, validateRequest, asyncHandler(saveAnswer));
responseRouter.post("/:responseId/submit", submitResponseValidators, validateRequest, asyncHandler(submitResponse));

export { responseRouter };
