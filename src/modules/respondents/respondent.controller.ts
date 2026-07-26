import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { clearRespondentSessionCookie, setRespondentSessionCookie } from "../../common/security/respondent-cookie";
import { RespondentService } from "./respondent.service";

const respondentService = new RespondentService();

export const accessSurvey = async (request: Request, response: Response): Promise<void> => {
  const result = await respondentService.grantAccessByInvitationToken(String(request.body.token));
  setRespondentSessionCookie(response, result.rawSessionToken);
  sendSuccess(response, "Respondent access granted.", {
    publicSurveyPath: result.publicSurveyPath
  });
};

export const logoutRespondent = async (request: Request, response: Response): Promise<void> => {
  await respondentService.logout(request.respondent!.sessionId);
  clearRespondentSessionCookie(response);
  sendSuccess(response, "Respondent logged out successfully.", null);
};

export const getRespondentSurvey = async (request: Request, response: Response): Promise<void> => {
  const survey = await respondentService.getPublicSurvey(request.respondent!.surveyId);
  sendSuccess(response, "Survey retrieved successfully.", survey);
};
