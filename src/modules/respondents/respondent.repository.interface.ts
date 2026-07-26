import type { Survey } from "../surveys/survey.types";
import type { RespondentSession } from "./respondent.types";

export interface IRespondentRepository {
  createSession(input: {
    expiresAt: string;
    invitationId: string;
    sessionTokenHash: string;
    surveyId: string;
  }): Promise<RespondentSession>;
  findSessionByTokenHash(sessionTokenHash: string): Promise<RespondentSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  touchSession(sessionId: string): Promise<void>;
}
