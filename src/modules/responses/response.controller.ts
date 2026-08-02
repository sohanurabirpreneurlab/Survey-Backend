import type { Request, Response } from "express";

import { sendCreated, sendSuccess } from "../../common/http/api-response";
import { ResponseService } from "./response.service";

const responseService = new ResponseService();
const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value ?? "");

export const createOrResumeResponse = async (request: Request, response: Response): Promise<void> => {
  const result = await responseService.startOrResumeResponse({
    invitationId: request.respondent!.invitationId,
    sessionId: request.respondent!.sessionId,
    surveyId: request.respondent!.surveyId,
    surveyVersionId: request.respondent!.surveyVersionId
  });
  sendCreated(response, "Response prepared successfully.", result);
};

export const getCurrentResponse = async (request: Request, response: Response): Promise<void> => {
  const result = await responseService.getCurrentResponse(request.respondent!.sessionId);
  sendSuccess(response, "Current response retrieved successfully.", result);
};

export const saveAnswer = async (request: Request, response: Response): Promise<void> => {
  const result = await responseService.saveAnswer({
    expectedRevision: Number(request.body.expectedRevision),
    questionId: getParam(request.params.questionId),
    responseId: getParam(request.params.responseId),
    sessionId: request.respondent!.sessionId,
    value: request.body.value
  });
  sendSuccess(response, "Answer saved successfully.", result);
};

export const submitResponse = async (request: Request, response: Response): Promise<void> => {
  const result = await responseService.submitResponse({
    idempotencyKey: request.header("Idempotency-Key") ?? undefined,
    responseId: getParam(request.params.responseId),
    sessionId: request.respondent!.sessionId
  });

  sendSuccess(
    response,
    result.replayed ? "Submission replayed successfully." : "Response submitted successfully.",
    result.value
  );
};

export const submitResponseWithAnswers = async (request: Request, response: Response): Promise<void> => {
  const answers = Array.isArray(request.body.answers)
    ? request.body.answers.map((answer: { questionId: string; value: unknown }) => ({
        questionId: answer.questionId,
        value: answer.value
      }))
    : [];

  const result = await responseService.submitResponseWithAnswers({
    answers,
    idempotencyKey: request.header("Idempotency-Key") ?? undefined,
    invitationId: request.respondent!.invitationId,
    sessionId: request.respondent!.sessionId,
    surveyId: request.respondent!.surveyId,
    surveyVersionId: request.respondent!.surveyVersionId
  });

  sendSuccess(
    response,
    result.replayed ? "Submission replayed successfully." : "Response submitted successfully.",
    result.value
  );
};
