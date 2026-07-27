import { databasePool } from "../../config/database";
import type { IRespondentRepository } from "./respondent.repository.interface";
import type { RespondentSession } from "./respondent.types";

const mapSession = (row: Record<string, unknown>): RespondentSession => ({
  createdAt: String(row.created_at),
  expiresAt: String(row.expires_at),
  id: String(row.id),
  invitationId: row.invitation_id ? String(row.invitation_id) : null,
  lastSeenAt: String(row.last_seen_at),
  revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  sessionTokenHash: String(row.session_token_hash),
  status: row.status as RespondentSession["status"],
  surveyId: String(row.survey_id)
  ,
  surveyVersionId: String(row.survey_version_id)
});

export class RespondentRepository implements IRespondentRepository {
  public async createSession(input: {
    expiresAt: string;
    invitationId: string | null;
    sessionTokenHash: string;
    surveyId: string;
    surveyVersionId: string;
  }): Promise<RespondentSession> {
    const result = await databasePool.query(
      `
        insert into respondent_sessions (survey_id, survey_version_id, invitation_id, session_token_hash, status, expires_at)
        values ($1, $2, $3, $4, 'active', $5)
        returning *
      `,
      [input.surveyId, input.surveyVersionId, input.invitationId, input.sessionTokenHash, input.expiresAt]
    );
    return mapSession(result.rows[0] as Record<string, unknown>);
  }

  public async findSessionById(sessionId: string): Promise<RespondentSession | null> {
    const result = await databasePool.query("select * from respondent_sessions where id = $1", [sessionId]);
    return result.rowCount ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findSessionByTokenHash(sessionTokenHash: string): Promise<RespondentSession | null> {
    const result = await databasePool.query(
      "select * from respondent_sessions where session_token_hash = $1",
      [sessionTokenHash]
    );
    return result.rowCount ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  public async revokeSession(sessionId: string): Promise<void> {
    await databasePool.query(
      `
        update respondent_sessions
        set status = 'revoked',
            revoked_at = now()
        where id = $1
      `,
      [sessionId]
    );
  }

  public async markSessionSubmitted(sessionId: string): Promise<void> {
    await databasePool.query(
      `
        update respondent_sessions
        set status = 'submitted',
            last_seen_at = now()
        where id = $1
      `,
      [sessionId]
    );
  }

  public async touchSession(sessionId: string): Promise<void> {
    await databasePool.query(
      "update respondent_sessions set last_seen_at = now() where id = $1",
      [sessionId]
    );
  }
}
