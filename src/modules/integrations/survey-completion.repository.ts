import { databasePool } from "../../config/database";

export type SurveyCompletionRecord = {
  emailHash: string;
  completedAt: string | null;
  lastInvitationEmailSentAt: string | null;
};

export class SurveyCompletionRepository {
  public async findByEmailHashes(surveyId: string, emailHashes: string[]): Promise<SurveyCompletionRecord[]> {
    const result = await databasePool.query(
      `
        with matching_invitations as materialized (
          select id, recipient_email_hash
          from survey_invitations
          where survey_id = $1 and recipient_email_hash = any($2::text[])
        ), completions as (
          select si.recipient_email_hash, min(sr.submitted_at) as completed_at
          from matching_invitations si
          join survey_responses sr on sr.invitation_id = si.id
          where sr.status = 'submitted'
          group by si.recipient_email_hash
        ), sends as (
          select si.recipient_email_hash, max(ed.sent_at) as last_sent_at
          from matching_invitations si
          join email_deliveries ed on ed.invitation_id = si.id
          where ed.sent_at is not null
          group by si.recipient_email_hash
        )
        select requested.email_hash, c.completed_at, s.last_sent_at
        from unnest($2::text[]) as requested(email_hash)
        left join completions c on c.recipient_email_hash = requested.email_hash
        left join sends s on s.recipient_email_hash = requested.email_hash
      `,
      [surveyId, emailHashes]
    );

    return result.rows.map((row: { email_hash: string; completed_at: Date | string | null; last_sent_at: Date | string | null }) => ({
      emailHash: String(row.email_hash),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      lastInvitationEmailSentAt: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null
    }));
  }
}
