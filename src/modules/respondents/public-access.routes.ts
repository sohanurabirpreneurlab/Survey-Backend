import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { createSimpleRateLimit } from "../../common/middleware/simple-rate-limit";
import { getInvitationSurveyByToken, getPublicSurveyBySlug } from "./public-access.controller";

const publicAccessRouter = Router();
const publicRateLimit = createSimpleRateLimit({
  keyPrefix: "public-share",
  maxRequests: 60,
  windowMs: 60_000
});

publicAccessRouter.get("/s/:publicSlug", publicRateLimit, asyncHandler(getPublicSurveyBySlug));
publicAccessRouter.get("/i/:token", publicRateLimit, asyncHandler(getInvitationSurveyByToken));

export { publicAccessRouter };
