import type { Survey } from "../surveys/survey.types";
import type { RespondentSession } from "./respondent.types";

export interface IRespondentRepository {
  createSession(input: {
    expiresAt: string;
    invitationId: string | null;
    sessionTokenHash: string;
    surveyId: string;
    surveyVersionId: string;
  }): Promise<RespondentSession>;
  findSessionById(sessionId: string): Promise<RespondentSession | null>;
  findSessionByTokenHash(sessionTokenHash: string): Promise<RespondentSession | null>;
  markSessionSubmitted(sessionId: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  touchSession(sessionId: string): Promise<void>;
}
