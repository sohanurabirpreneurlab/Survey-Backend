import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { ExternalSurveyService } from "./external-survey.service";

const externalSurveyService = new ExternalSurveyService();

/**
 * SaltHub: POST /api/v1/integrations/survey-invitations/send
 * Body: { surveyId: UUID, email: string }; Authorization: Bearer <integration JWT>.
 * 200: { success: true, message: string, data: { surveyId, email, invitationId, status: "sent" }, meta: { requestId } }
 * Error example (502):
 * { success: false, error: { code: "INVITATION_SEND_FAILED",
 *   message: "The invitation email could not be sent.", details: null }, meta: { requestId: "..." } }
 * Show error.message in SaltHub; use error.code for logic, not message matching.
 * 400 VALIDATION_ERROR: error.details is [{ location, message, path }].
 * 401 AUTHENTICATION_REQUIRED / INVALID_AUTH_TOKEN.
 * 403 INTEGRATION_SCOPE_REQUIRED / INTEGRATION_IDENTITY_INACTIVE /
 *     ORGANIZATION_MEMBERSHIP_REQUIRED / INSUFFICIENT_ORGANIZATION_ROLE.
 * 404 SURVEY_NOT_FOUND; 409 INVITATION_ALREADY_COMPLETED / SURVEY_CLOSED /
 *     SURVEY_NOT_PUBLISHED / SURVEY_NOT_OPEN_YET / SURVEY_INVITE_ONLY_REQUIRED /
 *     SURVEY_NOT_ACCEPTING_RESPONSES; 429 FORBIDDEN (rate limit).
 * Sent means provider acceptance, not inbox delivery. Repeated calls send reminders.
 */
export const sendSurveyInvitationEmail = async (request: Request, response: Response): Promise<void> => {
  const result = await externalSurveyService.sendInvitationEmail({
    surveyId: request.body.surveyId,
    email: request.body.email,
    userId: request.integration!.userId
  });
  sendSuccess(response, "Survey invitation email sent successfully.", result);
};

export const getSurveyCompletionStatus = async (request: Request, response: Response): Promise<void> => {
  const result = await externalSurveyService.getCompletionStatus({
    surveyId: request.body.surveyId,
    emails: request.body.emails,
    userId: request.integration!.userId
  });
  sendSuccess(response, "Survey completion status fetched successfully.", result);
};

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
