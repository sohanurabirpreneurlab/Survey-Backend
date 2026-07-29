import type { SurveyResponse } from "./response.types";
import type { AnswerRecord, ResponseScoreRecord } from "./response.types";

export interface IResponseRepository {
  findCurrentInProgress(sessionId: string): Promise<SurveyResponse | null>;
  createResponse(input: {
    invitationId: string | null;
    respondentSessionId: string;
    surveyId: string;
    surveyVersionId: string;
  }): Promise<SurveyResponse>;
  findResponseById(responseId: string): Promise<SurveyResponse | null>;
  saveAnswerWithRevision(input: {
    expectedRevision: number;
    optionIds: string[];
    questionId: string;
    questionStableKey: string;
    responseId: string;
    scoreSnapshot: number | null;
    valueBoolean: boolean | null;
    valueJson: unknown;
    valueNumber: number | null;
    valueText: string | null;
    valueTimestamp: string | null;
  }): Promise<SurveyResponse | null>;
  listAnswersForResponse(responseId: string): Promise<AnswerRecord[]>;
  submitResponse(
    responseId: string,
    sessionId: string,
    input?: {
      hiddenQuestionIds?: string[];
      responseScores?: ResponseScoreRecord[];
      visibleRequiredQuestionIds?: string[];
    }
  ): Promise<SurveyResponse>;
}
