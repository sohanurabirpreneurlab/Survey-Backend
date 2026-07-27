import { databasePool } from "../../config/database";
import type { IInvitationRepository } from "./invitation.repository.interface";
import type {
  CreateEmailDeliveryInput,
  CreateInvitationInput,
  EmailDelivery,
  RotateInvitationTokenInput,
  SurveyInvitation,
  UpdateEmailDeliveryStatusInput
} from "./invitation.types";

const mapInvitation = (row: Record<string, unknown>): SurveyInvitation => ({
  completedAt: row.completed_at ? String(row.completed_at) : null,
  createdAt: String(row.created_at),
  createdBy: String(row.created_by),
  expiresAt: row.expires_at ? String(row.expires_at) : null,
  firstOpenedAt: row.first_opened_at ? String(row.first_opened_at) : null,
  id: String(row.id),
  lastOpenedAt: row.last_opened_at ? String(row.last_opened_at) : null,
  maxResponses: Number(row.max_responses),
  metadata: (row.metadata as Record<string, unknown>) ?? {},
  recipientEmailCiphertext: row.recipient_email_ciphertext ? String(row.recipient_email_ciphertext) : null,
  recipientEmailHash: String(row.recipient_email_hash),
  responseCount: Number(row.response_count),
  revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  startedAt: row.started_at ? String(row.started_at) : null,
  status: row.status as SurveyInvitation["status"],
  surveyId: String(row.survey_id),
  surveyVersionId: String(row.survey_version_id),
  tokenHash: String(row.token_hash),
  updatedAt: String(row.updated_at)
});

const mapDelivery = (row: Record<string, unknown>): EmailDelivery => ({
  attemptCount: Number(row.attempt_count),
  bouncedAt: row.bounced_at ? String(row.bounced_at) : null,
  campaignId: row.campaign_id ? String(row.campaign_id) : null,
  createdAt: String(row.created_at),
  deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
  failedAt: row.failed_at ? String(row.failed_at) : null,
  id: String(row.id),
  invitationId: String(row.invitation_id),
  lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  provider: String(row.provider),
  providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
  providerMetadata: (row.provider_metadata as Record<string, unknown>) ?? {},
  sentAt: row.sent_at ? String(row.sent_at) : null,
  status: row.status as EmailDelivery["status"],
  updatedAt: String(row.updated_at)
});

export class InvitationRepository implements IInvitationRepository {
  public async createInvitation(input: CreateInvitationInput): Promise<SurveyInvitation> {
    const result = await databasePool.query(
      `
        insert into survey_invitations
          (survey_id, survey_version_id, recipient_email_ciphertext, recipient_email_hash, token_hash, status, max_responses, expires_at, metadata, created_by)
        values
          ($1, $2, $3, $4, $5, 'pending', $6, $7, $8::jsonb, $9)
        returning *
      `,
      [
        input.surveyId,
        input.surveyVersionId,
        input.recipientEmailCiphertext,
        input.recipientEmailHash,
        input.tokenHash,
        input.maxResponses,
        input.expiresAt,
        JSON.stringify(input.metadata),
        input.createdBy
      ]
    );

    return mapInvitation(result.rows[0] as Record<string, unknown>);
  }

  public async listSurveyInvitations(surveyId: string): Promise<SurveyInvitation[]> {
    const result = await databasePool.query(
      "select * from survey_invitations where survey_id = $1 order by created_at desc",
      [surveyId]
    );
    return result.rows.map((row: Record<string, unknown>) => mapInvitation(row));
  }

  public async findInvitationById(invitationId: string): Promise<SurveyInvitation | null> {
    const result = await databasePool.query("select * from survey_invitations where id = $1", [invitationId]);
    return result.rowCount ? mapInvitation(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findInvitationByTokenHash(tokenHash: string): Promise<SurveyInvitation | null> {
    const result = await databasePool.query(
      "select * from survey_invitations where token_hash = $1",
      [tokenHash]
    );
    return result.rowCount ? mapInvitation(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findActiveInvitationByEmailHash(
    surveyId: string,
    recipientEmailHash: string
  ): Promise<SurveyInvitation | null> {
    const result = await databasePool.query(
      `
        select *
        from survey_invitations
        where survey_id = $1
          and recipient_email_hash = $2
          and revoked_at is null
          and (expires_at is null or expires_at > now())
          and status <> 'completed'
        order by created_at desc
        limit 1
      `,
      [surveyId, recipientEmailHash]
    );

    return result.rowCount ? mapInvitation(result.rows[0] as Record<string, unknown>) : null;
  }

  public async rotateInvitationToken(input: RotateInvitationTokenInput): Promise<SurveyInvitation> {
    const result = await databasePool.query(
      `
        update survey_invitations
        set token_hash = $2,
            status = 'pending',
            updated_at = now(),
            revoked_at = null,
            completed_at = null
        where id = $1
        returning *
      `,
      [input.invitationId, input.tokenHash]
    );

    return mapInvitation(result.rows[0] as Record<string, unknown>);
  }

  public async revokeInvitation(invitationId: string): Promise<SurveyInvitation> {
    const result = await databasePool.query(
      `
        update survey_invitations
        set status = 'revoked',
            revoked_at = now(),
            updated_at = now()
        where id = $1
        returning *
      `,
      [invitationId]
    );

    return mapInvitation(result.rows[0] as Record<string, unknown>);
  }

  public async updateInvitationStatus(
    invitationId: string,
    status: SurveyInvitation["status"]
  ): Promise<SurveyInvitation> {
    const result = await databasePool.query(
      `
        update survey_invitations
        set status = $2,
            updated_at = now()
        where id = $1
        returning *
      `,
      [invitationId, status]
    );

    return mapInvitation(result.rows[0] as Record<string, unknown>);
  }

  public async markInvitationOpened(invitationId: string): Promise<void> {
    await databasePool.query(
      `
        update survey_invitations
        set status = case when status in ('pending', 'sent', 'delivered') then 'opened' else status end,
            first_opened_at = coalesce(first_opened_at, now()),
            last_opened_at = now(),
            updated_at = now()
        where id = $1
      `,
      [invitationId]
    );
  }

  public async createEmailDelivery(input: CreateEmailDeliveryInput): Promise<EmailDelivery> {
    const result = await databasePool.query(
      `
        insert into email_deliveries (invitation_id, provider, status)
        values ($1, $2, $3)
        returning *
      `,
      [input.invitationId, input.provider, input.status]
    );
    return mapDelivery(result.rows[0] as Record<string, unknown>);
  }

  public async updateEmailDeliveryStatus(
    input: UpdateEmailDeliveryStatusInput
  ): Promise<EmailDelivery> {
    const result = await databasePool.query(
      `
        update email_deliveries
        set status = $2,
            attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            provider_message_id = coalesce($3, provider_message_id),
            last_error_code = $4,
            last_error_message = $5,
            provider_metadata = coalesce($6::jsonb, provider_metadata),
            sent_at = case when $2 = 'sent' then now() else sent_at end,
            delivered_at = case when $2 = 'delivered' then now() else delivered_at end,
            bounced_at = case when $2 = 'bounced' then now() else bounced_at end,
            failed_at = case when $2 = 'failed' then now() else failed_at end,
            updated_at = now()
        where id = $1
        returning *
      `,
      [
        input.deliveryId,
        input.status,
        input.providerMessageId ?? null,
        input.lastErrorCode ?? null,
        input.lastErrorMessage ?? null,
        input.providerMetadata ? JSON.stringify(input.providerMetadata) : null
      ]
    );
    return mapDelivery(result.rows[0] as Record<string, unknown>);
  }
}
