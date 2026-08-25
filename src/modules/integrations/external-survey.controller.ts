import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { ExternalSurveyService } from "./external-survey.service";

const externalSurveyService = new ExternalSurveyService();

export const resolveSurveyInvitation = async (request: Request, response: Response): Promise<void> => {
  const results = await Promise.all(
    (request.body.surveyIds as string[]).map((surveyId) =>
      externalSurveyService.resolveInvitation({
        createdBy: request.integration!.userId,
        email: request.body.email,
        requestId: request.requestId ?? null,
        surveyId
      })
    )
  );

  sendSuccess(response, "Survey invitations resolved successfully.", results);
};

export const getSurveyInfo = async (request: Request, response: Response): Promise<void> => {
  const result = await externalSurveyService.getSurveyInfo({
    surveyId: request.body.surveyId,
    userId: request.integration!.userId,
    ...(request.requestId ? { requestId: request.requestId } : {})
  });

  sendSuccess(response, "Survey info fetched successfully.", result);
};
