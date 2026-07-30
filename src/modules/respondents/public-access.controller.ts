import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { setRespondentSessionCookie } from "../../common/security/respondent-cookie";
import { RespondentService } from "./respondent.service";

const respondentService = new RespondentService();

const setRespondentAccessHeaders = (response: Response) => {
  response.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
};

export const getPublicSurveyBySlug = async (request: Request, response: Response): Promise<void> => {
  const result = await respondentService.grantAccessByPublicSlug(String(request.params.publicSlug));
  setRespondentAccessHeaders(response);
  setRespondentSessionCookie(response, result.rawSessionToken);
  sendSuccess(response, "Survey retrieved successfully.", {
    ...result.survey,
    respondentSessionToken: result.rawSessionToken
  });
};

export const getInvitationSurveyByToken = async (request: Request, response: Response): Promise<void> => {
  const result = await respondentService.grantAccessByInvitationToken(String(request.params.token));
  setRespondentAccessHeaders(response);
  setRespondentSessionCookie(response, result.rawSessionToken);
  sendSuccess(response, "Survey retrieved successfully.", {
    ...result.survey,
    respondentSessionToken: result.rawSessionToken
  });
};
