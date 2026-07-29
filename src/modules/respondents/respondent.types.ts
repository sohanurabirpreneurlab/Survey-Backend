export type RespondentSession = {
  id: string;
  surveyId: string;
  surveyVersionId: string;
  invitationId: string | null;
  sessionTokenHash: string;
  status: "active" | "submitted" | "revoked" | "expired";
  expiresAt: string;
  lastSeenAt: string;
  createdAt: string;
  revokedAt: string | null;
};

export type PublicSurveyQuestion = {
  id: string;
  sectionId: string;
  stableKey: string;
  type: string;
  title: string;
  description: string | null;
  required: boolean;
  position: number;
  validation: Record<string, unknown>;
  displayLogic: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type PublicSurvey = {
  calculatedScores: Array<{
    calculationType: string;
    decimalPlaces: number;
    id: string;
    key: string;
    name: string;
    questions: Array<{
      id: string;
      position: number;
      questionId: string;
      weight: number;
    }>;
    requireAllAnswers: boolean;
    targets: Array<{
      id: string;
      targetId: string;
      targetType: "question" | "section";
    }>;
    thresholdOperator: string;
    thresholdValue: number;
  }>;
  publicSlug: string;
  title: string;
  description: string | null;
  settings: Record<string, unknown>;
  sections: Array<{
    id: string;
    stableKey: string;
    title: string;
    description: string | null;
    position: number;
  }>;
  questions: PublicSurveyQuestion[];
  options: Array<{
    id: string;
    questionId: string;
    scoreValue: number | null;
    stableKey: string;
    label: string;
    value: string;
    position: number;
    settings: Record<string, unknown>;
  }>;
};
