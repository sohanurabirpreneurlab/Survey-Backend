import { buildPaginatedResult } from "../../common/utils/pagination";
import { databasePool } from "../../config/database";
import type { ISurveyTrackingRepository } from "./survey-tracking.repository.interface";
import type {
  SurveyTrackingInvitationRecipient,
  SurveyTrackingResponseItem,
  SurveyTrackingResponsePreview,
  SurveyTrackingSummary
} from "./survey-tracking.types";

const mapSummary = (row: Record<string, unknown>): SurveyTrackingSummary => ({
  accessMode: row.access_mode as SurveyTrackingSummary["accessMode"],
  createdAt: String(row.created_at),
  id: String(row.id),
  inProgressResponseCount: Number(row.in_progress_response_count ?? 0),
  invitationCompletedCount: Number(row.invitation_completed_count ?? 0),
  invitationCount: Number(row.invitation_count ?? 0),
  invitationOpenedCount: Number(row.invitation_opened_count ?? 0),
  invitationSentCount: Number(row.invitation_sent_count ?? 0),
  isPrivate: row.access_mode === "invite_only",
  organizationId: String(row.organization_id),
  organizationName: String(row.organization_name),
  status: row.status as SurveyTrackingSummary["status"],
  submittedResponseCount: Number(row.submitted_response_count ?? 0),
  title: row.title ? String(row.title) : null,
  updatedAt: String(row.updated_at)
});

const mapInvitationRecipient = (row: Record<string, unknown>): SurveyTrackingInvitationRecipient => ({
  completedAt: row.completed_at ? String(row.completed_at) : null,
  createdAt: String(row.created_at),
  email: row.recipient_email_ciphertext ? String(row.recipient_email_ciphertext) : null,
  expiresAt: row.expires_at ? String(row.expires_at) : null,
  firstOpenedAt: row.first_opened_at ? String(row.first_opened_at) : null,
  id: String(row.id),
  lastOpenedAt: row.last_opened_at ? String(row.last_opened_at) : null,
  responseCount: Number(row.response_count ?? 0),
  startedAt: row.started_at ? String(row.started_at) : null,
  status: String(row.status),
  surveyId: String(row.survey_id),
  updatedAt: String(row.updated_at)
});

const mapResponse = (row: Record<string, unknown>): SurveyTrackingResponseItem => ({
  accessSource: row.invitation_id ? "invitation" : "public",
  invitationId: row.invitation_id ? String(row.invitation_id) : null,
  lastSavedAt: String(row.last_saved_at),
  respondentEmail: row.recipient_email_ciphertext ? String(row.recipient_email_ciphertext) : null,
  responseId: String(row.response_id),
  responseStatus: row.response_status as SurveyTrackingResponseItem["responseStatus"],
  sessionCreatedAt: String(row.session_created_at),
  sessionId: String(row.session_id),
  sessionStatus: row.session_status as SurveyTrackingResponseItem["sessionStatus"],
  submittedAt: row.submitted_at ? String(row.submitted_at) : null,
  surveyId: String(row.survey_id),
  surveyVersionId: String(row.survey_version_id)
});

export class SurveyTrackingRepository implements ISurveyTrackingRepository {
  public async listTrackedSurveys(input: {
    limit: number;
    organizationIds?: string[];
    page: number;
  }): Promise<import("./survey-tracking.types").SurveyTrackingSummaryList> {
    const offset = (input.page - 1) * input.limit;
    const hasScope = Array.isArray(input.organizationIds);
    const scopedIds = input.organizationIds ?? [];

    if (hasScope && scopedIds.length === 0) {
      return buildPaginatedResult<SurveyTrackingSummary>([], 0, { limit: input.limit, page: input.page });
    }

    const filterSql = hasScope ? "where s.organization_id = any($1::uuid[]) and s.deleted_at is null" : "where s.deleted_at is null";
    const params = hasScope ? [scopedIds, input.limit, offset] : [input.limit, offset];
    const limitIndex = hasScope ? 2 : 1;
    const offsetIndex = hasScope ? 3 : 2;

    const rowsResult = await databasePool.query(
      `
        select
          s.*,
          o.name as organization_name,
          coalesce(dv.title, pv.title) as title,
          coalesce(sr.submitted_count, 0) as submitted_response_count,
          coalesce(sr.in_progress_count, 0) as in_progress_response_count,
          coalesce(inv.invitation_count, 0) as invitation_count,
          coalesce(inv.sent_count, 0) as invitation_sent_count,
          coalesce(inv.opened_count, 0) as invitation_opened_count,
          coalesce(inv.completed_count, 0) as invitation_completed_count
        from surveys s
        inner join organizations o on o.id = s.organization_id
        left join survey_versions dv on dv.id = s.current_draft_version_id
        left join survey_versions pv on pv.id = s.published_version_id
        left join (
          select
            survey_id,
            count(*) filter (where status = 'submitted')::int as submitted_count,
            count(*) filter (where status = 'in_progress')::int as in_progress_count
          from survey_responses
          group by survey_id
        ) sr on sr.survey_id = s.id
        left join (
          select
            survey_id,
            count(*)::int as invitation_count,
            count(*) filter (where status in ('sent', 'delivered', 'opened', 'started', 'completed'))::int as sent_count,
            count(*) filter (where first_opened_at is not null)::int as opened_count,
            count(*) filter (where completed_at is not null)::int as completed_count
          from survey_invitations
          group by survey_id
        ) inv on inv.survey_id = s.id
        ${filterSql}
        order by s.updated_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      params
    );

    const countResult = await databasePool.query(
      `select count(*)::int as total from surveys s ${filterSql}`,
      hasScope ? [scopedIds] : []
    );

    return buildPaginatedResult<SurveyTrackingSummary>(
      rowsResult.rows.map((row: Record<string, unknown>) => mapSummary(row)),
      Number((countResult.rows[0] as Record<string, unknown>).total ?? 0),
      { limit: input.limit, page: input.page }
    );
  }

  public async listInvitationRecipients(surveyId: string): Promise<SurveyTrackingInvitationRecipient[]> {
    const result = await databasePool.query(
      `
        select *
        from survey_invitations
        where survey_id = $1
          and status <> 'failed'
        order by created_at desc
      `,
      [surveyId]
    );

    return result.rows.map((row: Record<string, unknown>) => mapInvitationRecipient(row));
  }

  public async listSurveyResponses(surveyId: string): Promise<SurveyTrackingResponseItem[]> {
    const result = await databasePool.query(
      `
        select
          sr.id as response_id,
          sr.survey_id,
          sr.survey_version_id,
          sr.invitation_id,
          sr.status as response_status,
          sr.last_saved_at,
          sr.submitted_at,
          rs.id as session_id,
          rs.status as session_status,
          rs.created_at as session_created_at,
          si.recipient_email_ciphertext
        from survey_responses sr
        inner join respondent_sessions rs on rs.id = sr.respondent_session_id
        left join survey_invitations si on si.id = sr.invitation_id
        where sr.survey_id = $1
        order by coalesce(sr.submitted_at, sr.last_saved_at, sr.created_at) desc
      `,
      [surveyId]
    );

    return result.rows.map((row: Record<string, unknown>) => mapResponse(row));
  }

  public async getResponsePreview(surveyId: string, responseId: string) {
    const responseResult = await databasePool.query(
      `
        select
          sr.id as response_id,
          sr.survey_id,
          sr.survey_version_id,
          sr.invitation_id,
          sr.status as response_status,
          sr.last_saved_at,
          sr.submitted_at,
          rs.id as session_id,
          rs.status as session_status,
          rs.created_at as session_created_at,
          si.recipient_email_ciphertext,
          s.organization_id,
          s.access_mode,
          s.status as survey_status,
          coalesce(dv.title, pv.title) as title
        from survey_responses sr
        inner join respondent_sessions rs on rs.id = sr.respondent_session_id
        inner join surveys s on s.id = sr.survey_id
        left join survey_invitations si on si.id = sr.invitation_id
        left join survey_versions dv on dv.id = s.current_draft_version_id
        left join survey_versions pv on pv.id = s.published_version_id
        where sr.survey_id = $1
          and sr.id = $2
        limit 1
      `,
      [surveyId, responseId]
    );

    if (!responseResult.rowCount) {
      return null;
    }

    const row = responseResult.rows[0] as Record<string, unknown>;
    const answersResult = await databasePool.query(
      `
        select
          a.question_id,
          a.question_stable_key,
          a.value_text,
          a.value_number,
          a.value_boolean,
          a.value_date,
          a.value_timestamp,
          a.value_json,
          coalesce(array_agg(ac.option_id order by ac.option_id) filter (where ac.option_id is not null), '{}'::uuid[]) as option_ids
        from answers a
        left join answer_choices ac on ac.answer_id = a.id
        where a.response_id = $1
        group by a.id
        order by a.created_at asc
      `,
      [responseId]
    );

    return {
      answers: answersResult.rows.map((answerRow: Record<string, unknown>) => ({
        optionIds: Array.isArray(answerRow.option_ids) ? answerRow.option_ids.map((value) => String(value)) : [],
        questionId: String(answerRow.question_id),
        questionStableKey: String(answerRow.question_stable_key),
        valueBoolean: answerRow.value_boolean === null ? null : Boolean(answerRow.value_boolean),
        valueDate: answerRow.value_date ? String(answerRow.value_date) : null,
        valueJson: answerRow.value_json ?? null,
        valueNumber:
          answerRow.value_number === null || answerRow.value_number === undefined
            ? null
            : Number(answerRow.value_number),
        valueText: answerRow.value_text ? String(answerRow.value_text) : null,
        valueTimestamp: answerRow.value_timestamp ? String(answerRow.value_timestamp) : null
      })),
      response: mapResponse(row),
      survey: {
        accessMode: row.access_mode as SurveyTrackingResponsePreview["survey"]["accessMode"],
        id: String(row.survey_id),
        organizationId: String(row.organization_id),
        status: row.survey_status as SurveyTrackingResponsePreview["survey"]["status"],
        title: row.title ? String(row.title) : null
      }
    };
  }
}
