export type SurveyResponse = {
  id: string;
  surveyId: string;
  surveyVersionId: string;
  invitationId: string;
  respondentSessionId: string;
  status: "in_progress" | "submitted" | "invalidated" | "deleted";
  revision: number;
  startedAt: string;
  lastSavedAt: string;
  submittedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AnswerRecord = {
  id: string;
  responseId: string;
  questionId: string;
  questionStableKey: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueTimestamp: string | null;
  valueJson: unknown;
  createdAt: string;
  updatedAt: string;
  optionIds: string[];
};

export type SaveAnswerInput = {
  expectedRevision: number;
  questionId: string;
  responseId: string;
  sessionId: string;
  value: unknown;
};
