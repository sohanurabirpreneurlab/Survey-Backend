import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { validateRequest } from "../../common/middleware/validate-request";
import { accessSurvey, getRespondentSurvey, logoutRespondent } from "./respondent.controller";
import { authenticateRespondent } from "./authenticate-respondent";
import { respondentAccessValidators } from "./respondent.validators";

const respondentRouter = Router();

respondentRouter.post("/access", respondentAccessValidators, validateRequest, asyncHandler(accessSurvey));
respondentRouter.post("/logout", authenticateRespondent, asyncHandler(logoutRespondent));
respondentRouter.get("/survey", authenticateRespondent, asyncHandler(getRespondentSurvey));

export { respondentRouter };
