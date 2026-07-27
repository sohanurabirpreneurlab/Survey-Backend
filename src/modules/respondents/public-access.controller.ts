import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { setRespondentSessionCookie } from "../../common/security/respondent-cookie";
import { RespondentService } from "./respondent.service";

const respondentService = new RespondentService();

export const getPublicSurveyBySlug = async (request: Request, response: Response): Promise<void> => {
  const result = await respondentService.grantAccessByPublicSlug(String(request.params.publicSlug));
  setRespondentSessionCookie(response, result.rawSessionToken);
  sendSuccess(response, "Survey retrieved successfully.", result.survey);
};

export const getInvitationSurveyByToken = async (request: Request, response: Response): Promise<void> => {
  const result = await respondentService.grantAccessByInvitationToken(String(request.params.token));
  setRespondentSessionCookie(response, result.rawSessionToken);
  sendSuccess(response, "Survey retrieved successfully.", result.survey);
};
