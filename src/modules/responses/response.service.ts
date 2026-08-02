import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import type { Question, QuestionOption } from "../surveys/survey.types";
import { validateAnswerValue } from "./answer-validator";
import { IdempotencyService } from "./idempotency.service";
import { ResponseRepository } from "./response.repository";
import type { IResponseRepository } from "./response.repository.interface";
import type { AnswerRecord, PreparedAnswerInput } from "./response.types";
import { ScoreCalculationService } from "./score-calculation.service";
import { SurveyVisibilityService } from "./survey-visibility.service";

export class ResponseService {
  public constructor(
    private readonly responseRepository: IResponseRepository = new ResponseRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository(),
    private readonly idempotencyService = new IdempotencyService(),
    private readonly scoreCalculationService = new ScoreCalculationService(),
    private readonly surveyVisibilityService = new SurveyVisibilityService()
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
    const scoreSnapshot = this.resolveAnswerScoreSnapshot(question.type, normalizedAnswer.optionIds, normalizedAnswer.valueNumber, options);

    const savedResponse = await this.responseRepository.saveAnswerWithRevision({
      expectedRevision: input.expectedRevision,
      optionIds: normalizedAnswer.optionIds,
      questionId: question.id,
      questionStableKey: question.stableKey,
      responseId: response.id,
      scoreSnapshot,
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

    const definition = await this.surveyRepository.getVersionDefinition(response.surveyVersionId);

    if (!definition) {
      throw new AppError(ERROR_CODES.versionNotFound, "Survey version was not found.", 404);
    }

    const answers = await this.responseRepository.listAnswersForResponse(response.id);
    const initialScores = this.scoreCalculationService.calculate(definition, answers);
    const initialVisibility = this.surveyVisibilityService.resolve(definition, initialScores);
    const visibleAnswers = answers.filter((answer) => initialVisibility.visibleQuestionIds.includes(answer.questionId));
    const responseScores = this.scoreCalculationService.calculate(definition, visibleAnswers);
    const visibility = this.surveyVisibilityService.resolve(definition, responseScores);
    const visibleRequiredQuestionIds = definition.questions
      .filter((question) => question.required && visibility.visibleQuestionIds.includes(question.id))
      .map((question) => question.id);

    return this.idempotencyService.run({
      action: async () =>
        this.responseRepository.submitResponse(response.id, input.sessionId, {
          hiddenQuestionIds: visibility.hiddenQuestionIds,
          responseScores: responseScores.map((score) => ({
            calculatedScoreId: score.calculatedScoreId,
            responseId: response.id,
            scoreValue: score.scoreValue,
            thresholdMatched: score.thresholdMatched
          })),
          visibleRequiredQuestionIds
        }),
      idempotencyKey: input.idempotencyKey,
      requestPayload: { responseId: response.id, sessionId: input.sessionId },
      resourceId: response.id,
      responseStatus: 200,
      scope: `survey-submit:${response.id}`
    });
  }

  public async submitResponseWithAnswers(input: {
    answers: Array<{
      questionId: string;
      value: unknown;
    }>;
    idempotencyKey: string | undefined;
    invitationId: string | null;
    sessionId: string;
    surveyId: string;
    surveyVersionId: string;
  }) {
    const response = await this.startOrResumeResponse({
      invitationId: input.invitationId,
      sessionId: input.sessionId,
      surveyId: input.surveyId,
      surveyVersionId: input.surveyVersionId
    });

    const definition = await this.surveyRepository.getVersionDefinition(response.surveyVersionId);

    if (!definition) {
      throw new AppError(ERROR_CODES.versionNotFound, "Survey version was not found.", 404);
    }

    const preparedAnswers = this.prepareSubmittedAnswers(definition.questions, definition.options, input.answers);
    const initialScores = this.scoreCalculationService.calculate(definition, preparedAnswers);
    const initialVisibility = this.surveyVisibilityService.resolve(definition, initialScores);
    const visibleAnswers = preparedAnswers.filter((answer) => initialVisibility.visibleQuestionIds.includes(answer.questionId));
    const responseScores = this.scoreCalculationService.calculate(definition, visibleAnswers);
    const visibility = this.surveyVisibilityService.resolve(definition, responseScores);
    const visibleRequiredQuestionIds = definition.questions
      .filter((question) => question.required && visibility.visibleQuestionIds.includes(question.id))
      .map((question) => question.id);
    const finalVisibleAnswers = visibleAnswers.filter((answer) => visibility.visibleQuestionIds.includes(answer.questionId));

    return this.idempotencyService.run({
      action: async () =>
        this.responseRepository.submitResponse(response.id, input.sessionId, {
          hiddenQuestionIds: visibility.hiddenQuestionIds,
          preparedAnswers: finalVisibleAnswers.map(
            (answer): PreparedAnswerInput => ({
              optionIds: answer.optionIds,
              questionId: answer.questionId,
              questionStableKey: answer.questionStableKey,
              scoreSnapshot: answer.scoreSnapshot,
              valueBoolean: answer.valueBoolean,
              valueJson: answer.valueJson,
              valueNumber: answer.valueNumber,
              valueText: answer.valueText,
              valueTimestamp: answer.valueTimestamp
            })
          ),
          replaceQuestionIds: visibility.visibleQuestionIds,
          responseScores: responseScores.map((score) => ({
            calculatedScoreId: score.calculatedScoreId,
            responseId: response.id,
            scoreValue: score.scoreValue,
            thresholdMatched: score.thresholdMatched
          })),
          visibleRequiredQuestionIds
        }),
      idempotencyKey: input.idempotencyKey,
      requestPayload: {
        answers: input.answers,
        responseId: response.id,
        sessionId: input.sessionId
      },
      resourceId: response.id,
      responseStatus: 200,
      scope: `survey-submit:${response.id}`
    });
  }

  private resolveAnswerScoreSnapshot(
    questionType: string,
    optionIds: string[],
    valueNumber: number | null,
    options: QuestionOption[]
  ): number | null {
    if (questionType === "rating") {
      return valueNumber;
    }

    if ((questionType === "single_choice" || questionType === "vote") && optionIds.length === 1) {
      return options.find((option) => option.id === optionIds[0])?.scoreValue ?? null;
    }

    return null;
  }

  private prepareSubmittedAnswers(
    questions: Question[],
    options: QuestionOption[],
    answers: Array<{ questionId: string; value: unknown }>
  ): AnswerRecord[] {
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const optionsByQuestionId = new Map<string, QuestionOption[]>();

    for (const option of options) {
      const current = optionsByQuestionId.get(option.questionId) ?? [];
      current.push(option);
      optionsByQuestionId.set(option.questionId, current);
    }

    return answers.map((answer) => {
      const question = questionMap.get(answer.questionId);

      if (!question) {
        throw new AppError(
          ERROR_CODES.questionNotInResponseVersion,
          "Question does not belong to the response version.",
          400
        );
      }

      const normalizedAnswer = validateAnswerValue(question, [], optionsByQuestionId.get(question.id) ?? [], answer.value);
      const scoreSnapshot = this.resolveAnswerScoreSnapshot(
        question.type,
        normalizedAnswer.optionIds,
        normalizedAnswer.valueNumber,
        optionsByQuestionId.get(question.id) ?? []
      );

      return {
        createdAt: "",
        id: "",
        optionIds: normalizedAnswer.optionIds,
        questionId: question.id,
        questionStableKey: question.stableKey,
        responseId: "",
        scoreSnapshot,
        updatedAt: "",
        valueBoolean: normalizedAnswer.valueBoolean,
        valueDate: null,
        valueJson: normalizedAnswer.valueJson,
        valueNumber: normalizedAnswer.valueNumber,
        valueText: normalizedAnswer.valueText,
        valueTimestamp: normalizedAnswer.valueTimestamp
      };
    });
  }
}
