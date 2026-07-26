import type { SurveyResponse } from "./response.types";

export interface IResponseRepository {
  findCurrentInProgress(sessionId: string): Promise<SurveyResponse | null>;
  createResponse(input: {
    invitationId: string;
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
    valueBoolean: boolean | null;
    valueJson: unknown;
    valueNumber: number | null;
    valueText: string | null;
    valueTimestamp: string | null;
  }): Promise<SurveyResponse | null>;
  submitResponse(responseId: string, sessionId: string): Promise<SurveyResponse>;
}
