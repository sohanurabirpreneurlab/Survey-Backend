import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { createSimpleRateLimit } from "../../common/middleware/simple-rate-limit";
import { validateRequest } from "../../common/middleware/validate-request";
import { accessSurvey, getRespondentSurvey, logoutRespondent } from "./respondent.controller";
import { authenticateRespondent } from "./authenticate-respondent";
import { respondentAccessValidators } from "./respondent.validators";

const respondentRouter = Router();
const respondentAccessRateLimit = createSimpleRateLimit({
  keyPrefix: "respondent-access",
  maxRequests: 30,
  windowMs: 60_000
});

respondentRouter.post("/access", respondentAccessRateLimit, respondentAccessValidators, validateRequest, asyncHandler(accessSurvey));
respondentRouter.post("/logout", authenticateRespondent, asyncHandler(logoutRespondent));
respondentRouter.get("/survey", authenticateRespondent, asyncHandler(getRespondentSurvey));

export { respondentRouter };
