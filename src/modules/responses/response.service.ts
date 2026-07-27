import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import { validateAnswerValue } from "./answer-validator";
import { IdempotencyService } from "./idempotency.service";
import { ResponseRepository } from "./response.repository";
import type { IResponseRepository } from "./response.repository.interface";

export class ResponseService {
  public constructor(
    private readonly responseRepository: IResponseRepository = new ResponseRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository(),
    private readonly idempotencyService = new IdempotencyService()
  ) {}

  public async startOrResumeResponse(context: {
    invitationId: string | null;
    sessionId: string;
    surveyId: string;
    surveyVersionId: string;
  }) {
    const existingResponse = await this.responseRepository.findCurrentInProgress(context.sessionId);

    if (existingResponse) {
      return existingResponse;
    }

    return this.responseRepository.createResponse({
      invitationId: context.invitationId,
      respondentSessionId: context.sessionId,
      surveyId: context.surveyId,
      surveyVersionId: context.surveyVersionId
    });
  }

  public async getCurrentResponse(sessionId: string) {
    return this.responseRepository.findCurrentInProgress(sessionId);
  }

  public async saveAnswer(input: {
    expectedRevision: number;
    questionId: string;
    responseId: string;
    sessionId: string;
    value: unknown;
  }) {
    const response = await this.responseRepository.findResponseById(input.responseId);

    if (!response) {
      throw new AppError(ERROR_CODES.responseNotFound, "Response was not found.", 404);
    }

    if (response.respondentSessionId !== input.sessionId) {
      throw new AppError(ERROR_CODES.respondentAccessDenied, "Response does not belong to this session.", 403);
    }

    if (response.status !== "in_progress") {
      throw new AppError(ERROR_CODES.responseNotEditable, "Response can no longer be edited.", 409);
    }

    const question = await this.surveyRepository.findQuestionById(input.questionId);

    if (!question || question.surveyVersionId !== response.surveyVersionId) {
      throw new AppError(
        ERROR_CODES.questionNotInResponseVersion,
        "Question does not belong to the response version.",
        400
      );
    }

    const options = await this.surveyRepository.listOptionsByQuestion(question.id);
    const normalizedAnswer = validateAnswerValue(question, [], options, input.value);

    const savedResponse = await this.responseRepository.saveAnswerWithRevision({
      expectedRevision: input.expectedRevision,
      optionIds: normalizedAnswer.optionIds,
      questionId: question.id,
      questionStableKey: question.stableKey,
      responseId: response.id,
      valueBoolean: normalizedAnswer.valueBoolean,
      valueJson: normalizedAnswer.valueJson,
      valueNumber: normalizedAnswer.valueNumber,
      valueText: normalizedAnswer.valueText,
      valueTimestamp: normalizedAnswer.valueTimestamp
    });

    if (!savedResponse) {
      throw new AppError(
        ERROR_CODES.responseRevisionConflict,
        "This response was updated from another session.",
        409,
        {
          currentRevision: response.revision,
          expectedRevision: input.expectedRevision
        }
      );
    }

    return savedResponse;
  }

  public async submitResponse(input: {
    idempotencyKey: string | undefined;
    responseId: string;
    sessionId: string;
  }) {
    const response = await this.responseRepository.findResponseById(input.responseId);

    if (!response) {
      throw new AppError(ERROR_CODES.responseNotFound, "Response was not found.", 404);
    }

    if (response.respondentSessionId !== input.sessionId) {
      throw new AppError(ERROR_CODES.respondentAccessDenied, "Response does not belong to this session.", 403);
    }

    return this.idempotencyService.run({
      action: async () => this.responseRepository.submitResponse(response.id, input.sessionId),
      idempotencyKey: input.idempotencyKey,
      requestPayload: { responseId: response.id, sessionId: input.sessionId },
      resourceId: response.id,
      responseStatus: 200,
      scope: `survey-submit:${response.id}`
    });
  }
}
