export type RespondentSession = {
  id: string;
  surveyId: string;
  invitationId: string;
  sessionTokenHash: string;
  status: "active" | "revoked" | "expired";
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
  surveyId: string;
  surveyVersionId: string;
  slug: string;
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
    stableKey: string;
    label: string;
    value: string;
    position: number;
    settings: Record<string, unknown>;
  }>;
};
