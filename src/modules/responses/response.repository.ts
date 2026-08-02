import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { databasePool } from "../../config/database";
import type { IResponseRepository } from "./response.repository.interface";
import type { AnswerRecord, PreparedAnswerInput, ResponseScoreRecord, SurveyResponse } from "./response.types";

type DatabaseClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rowCount?: number; rows: unknown[] }>;
  release: () => void;
};

const withTransaction = async <T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> => {
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const mapResponse = (row: Record<string, unknown>): SurveyResponse => ({
  createdAt: String(row.created_at),
  id: String(row.id),
  invitationId: row.invitation_id ? String(row.invitation_id) : null,
  lastSavedAt: String(row.last_saved_at),
  metadata: (row.metadata as Record<string, unknown>) ?? {},
  respondentSessionId: String(row.respondent_session_id),
  revision: Number(row.revision),
  startedAt: String(row.started_at),
  status: row.status as SurveyResponse["status"],
  submittedAt: row.submitted_at ? String(row.submitted_at) : null,
  surveyId: String(row.survey_id),
  surveyVersionId: String(row.survey_version_id),
  updatedAt: String(row.updated_at)
});

export class ResponseRepository implements IResponseRepository {
  private async upsertPreparedAnswer(client: DatabaseClient, responseId: string, answer: PreparedAnswerInput): Promise<void> {
    const answerResult = await client.query(
      `
        insert into answers (
          response_id,
          question_id,
          question_stable_key,
          value_text,
          value_number,
          value_boolean,
          value_timestamp,
          value_json,
          score_snapshot
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        on conflict (response_id, question_id)
        do update
          set question_stable_key = excluded.question_stable_key,
              value_text = excluded.value_text,
              value_number = excluded.value_number,
              value_boolean = excluded.value_boolean,
              value_timestamp = excluded.value_timestamp,
              value_json = excluded.value_json,
              score_snapshot = excluded.score_snapshot,
              updated_at = now()
        returning *
      `,
      [
        responseId,
        answer.questionId,
        answer.questionStableKey,
        answer.valueText,
        answer.valueNumber,
        answer.valueBoolean,
        answer.valueTimestamp,
        JSON.stringify(answer.valueJson),
        answer.scoreSnapshot
      ]
    );

    const answerId = String((answerResult.rows[0] as Record<string, unknown>).id);
    await client.query("delete from answer_choices where answer_id = $1", [answerId]);

    for (const optionId of answer.optionIds) {
      await client.query("insert into answer_choices (answer_id, option_id) values ($1, $2)", [answerId, optionId]);
    }
  }

  public async listAnswersForResponse(responseId: string): Promise<AnswerRecord[]> {
    const result = await databasePool.query(
      `
        select
          a.*,
          coalesce(array_agg(ac.option_id order by ac.option_id) filter (where ac.option_id is not null), '{}'::uuid[]) as option_ids
        from answers a
        left join answer_choices ac on ac.answer_id = a.id
        where a.response_id = $1
        group by a.id
        order by a.created_at asc
      `,
      [responseId]
    );

    return result.rows.map((row: unknown) => {
      const value = row as Record<string, unknown>;

      return {
        createdAt: String(value.created_at),
        id: String(value.id),
        optionIds: Array.isArray(value.option_ids) ? value.option_ids.map((item) => String(item)) : [],
        questionId: String(value.question_id),
        questionStableKey: String(value.question_stable_key),
        responseId: String(value.response_id),
        scoreSnapshot: value.score_snapshot === null || value.score_snapshot === undefined ? null : Number(value.score_snapshot),
        updatedAt: String(value.updated_at),
        valueBoolean: value.value_boolean === null ? null : Boolean(value.value_boolean),
        valueDate: value.value_date ? String(value.value_date) : null,
        valueJson: value.value_json ?? null,
        valueNumber: value.value_number === null || value.value_number === undefined ? null : Number(value.value_number),
        valueText: value.value_text ? String(value.value_text) : null,
        valueTimestamp: value.value_timestamp ? String(value.value_timestamp) : null
      };
    });
  }

  public async findCurrentInProgress(sessionId: string): Promise<SurveyResponse | null> {
    const result = await databasePool.query(
      `
        select *
        from survey_responses
        where respondent_session_id = $1
          and status = 'in_progress'
        order by created_at desc
        limit 1
      `,
      [sessionId]
    );
    return result.rowCount ? mapResponse(result.rows[0] as Record<string, unknown>) : null;
  }

  public async createResponse(input: {
    invitationId: string | null;
    respondentSessionId: string;
    surveyId: string;
    surveyVersionId: string;
  }): Promise<SurveyResponse> {
    const result = await databasePool.query(
      `
        insert into survey_responses (survey_id, survey_version_id, invitation_id, respondent_session_id, status)
        values ($1, $2, $3, $4, 'in_progress')
        returning *
      `,
      [input.surveyId, input.surveyVersionId, input.invitationId, input.respondentSessionId]
    );
    return mapResponse(result.rows[0] as Record<string, unknown>);
  }

  public async findResponseById(responseId: string): Promise<SurveyResponse | null> {
    const result = await databasePool.query("select * from survey_responses where id = $1", [responseId]);
    return result.rowCount ? mapResponse(result.rows[0] as Record<string, unknown>) : null;
  }

  public async saveAnswerWithRevision(input: {
    expectedRevision: number;
    optionIds: string[];
    questionId: string;
    questionStableKey: string;
    responseId: string;
    scoreSnapshot: number | null;
    valueBoolean: boolean | null;
    valueJson: unknown;
    valueNumber: number | null;
    valueText: string | null;
    valueTimestamp: string | null;
  }): Promise<SurveyResponse | null> {
    return withTransaction(async (client) => {
      const responseResult = await client.query(
        `
          select *
          from survey_responses
          where id = $1
          for update
        `,
        [input.responseId]
      );

      if (!responseResult.rowCount) {
        return null;
      }

      const response = mapResponse(responseResult.rows[0] as Record<string, unknown>);

      if (response.revision !== input.expectedRevision) {
        return null;
      }

      await this.upsertPreparedAnswer(client, input.responseId, input);

      const updatedResponseResult = await client.query(
        `
          update survey_responses
          set revision = revision + 1,
              last_saved_at = now(),
              updated_at = now()
          where id = $1
          returning *
        `,
        [input.responseId]
      );

      return mapResponse(updatedResponseResult.rows[0] as Record<string, unknown>);
    });
  }

  public async submitResponse(
    responseId: string,
    sessionId: string,
    input?: {
      preparedAnswers?: PreparedAnswerInput[];
      hiddenQuestionIds?: string[];
      replaceQuestionIds?: string[];
      responseScores?: ResponseScoreRecord[];
      visibleRequiredQuestionIds?: string[];
    }
  ): Promise<SurveyResponse> {
    return withTransaction(async (client) => {
      const responseResult = await client.query(
        `
          select *
          from survey_responses
          where id = $1
          for update
        `,
        [responseId]
      );

      if (!responseResult.rowCount) {
        throw new AppError(ERROR_CODES.responseNotFound, "Response was not found.", 404);
      }

      const response = mapResponse(responseResult.rows[0] as Record<string, unknown>);

      if (response.respondentSessionId !== sessionId) {
        throw new AppError(ERROR_CODES.respondentAccessDenied, "Response does not belong to this session.", 403);
      }

      if (response.status === "submitted") {
        return response;
      }

      const sessionResult = await client.query(
        `
          select *
          from respondent_sessions
          where id = $1
          for update
        `,
        [sessionId]
      );

      if (!sessionResult.rowCount) {
        throw new AppError(ERROR_CODES.respondentSessionInvalid, "Respondent session was not found.", 401);
      }

      const session = sessionResult.rows[0] as Record<string, unknown>;

      if (String(session.status) === "revoked" || session.revoked_at) {
        throw new AppError(ERROR_CODES.respondentSessionRevoked, "Respondent session was revoked.", 401);
      }

      if (new Date(String(session.expires_at)).getTime() <= Date.now()) {
        throw new AppError(ERROR_CODES.respondentSessionExpired, "Respondent session expired.", 401);
      }

      let invitation: Record<string, unknown> | null = null;

      if (response.invitationId) {
        const invitationResult = await client.query(
          `
            select *
            from survey_invitations
            where id = $1
            for update
          `,
          [response.invitationId]
        );

        if (!invitationResult.rowCount) {
          throw new AppError(ERROR_CODES.invitationNotFound, "Invitation was not found.", 404);
        }

        invitation = invitationResult.rows[0] as Record<string, unknown>;

        if (invitation.revoked_at) {
          throw new AppError(ERROR_CODES.invitationRevoked, "Invitation was revoked.", 403);
        }

        if (invitation.expires_at && new Date(String(invitation.expires_at)).getTime() <= Date.now()) {
          throw new AppError(ERROR_CODES.invitationExpired, "Invitation expired.", 403);
        }

        if (Number(invitation.response_count) >= Number(invitation.max_responses)) {
          throw new AppError(ERROR_CODES.invitationLimitReached, "Invitation response limit reached.", 403);
        }
      }

      const replaceQuestionIds = input?.replaceQuestionIds ?? [];

      if (replaceQuestionIds.length > 0) {
        await client.query(
          `
            delete from answer_choices
            where answer_id in (
              select id
              from answers
              where response_id = $1
                and question_id = any($2::uuid[])
                and not (question_id = any($3::uuid[]))
            )
          `,
          [response.id, replaceQuestionIds, (input?.preparedAnswers ?? []).map((answer) => answer.questionId)]
        );

        await client.query(
          `
            delete from answers
            where response_id = $1
              and question_id = any($2::uuid[])
              and not (question_id = any($3::uuid[]))
          `,
          [response.id, replaceQuestionIds, (input?.preparedAnswers ?? []).map((answer) => answer.questionId)]
        );
      }

      for (const preparedAnswer of input?.preparedAnswers ?? []) {
        await this.upsertPreparedAnswer(client, response.id, preparedAnswer);
      }

      if ((input?.hiddenQuestionIds ?? []).length > 0) {
        await client.query(
          `
            delete from answer_choices
            where answer_id in (
              select id
              from answers
              where response_id = $1
                and question_id = any($2::uuid[])
            )
          `,
          [response.id, input?.hiddenQuestionIds ?? []]
        );

        await client.query(
          `
            delete from answers
            where response_id = $1
              and question_id = any($2::uuid[])
          `,
          [response.id, input?.hiddenQuestionIds ?? []]
        );
      }

      const visibleRequiredQuestionIds = input?.visibleRequiredQuestionIds ?? [];
      const requiredQuestionsTotal = visibleRequiredQuestionIds.length;

      const answeredRequiredQuestionsResult = await client.query(
        `
          select count(distinct q.id)::int as total
          from questions q
          join answers a
            on a.question_id = q.id
           and a.response_id = $1
          where q.id = any($2::uuid[])
            and (
              a.value_text is not null
              or a.value_number is not null
              or a.value_boolean is not null
              or a.value_date is not null
              or a.value_timestamp is not null
              or a.value_json is not null
              or exists (select 1 from answer_choices ac where ac.answer_id = a.id)
            )
        `,
        [response.id, visibleRequiredQuestionIds]
      );

      if (
        requiredQuestionsTotal !==
        Number((answeredRequiredQuestionsResult.rows[0] as Record<string, unknown>).total ?? 0)
      ) {
        throw new AppError(ERROR_CODES.answerRequired, "Required answers are missing.", 400);
      }

      for (const responseScore of input?.responseScores ?? []) {
        await client.query(
          `
            insert into survey_response_scores (response_id, calculated_score_id, score_value, threshold_matched)
            values ($1, $2, $3, $4)
            on conflict (response_id, calculated_score_id)
            do update
              set score_value = excluded.score_value,
                  threshold_matched = excluded.threshold_matched,
                  updated_at = now()
          `,
          [
            responseScore.responseId,
            responseScore.calculatedScoreId,
            responseScore.scoreValue,
            responseScore.thresholdMatched
          ]
        );
      }

      const submittedResponseResult = await client.query(
        `
          update survey_responses
          set status = 'submitted',
              submitted_at = now(),
              updated_at = now(),
              last_saved_at = now()
          where id = $1
          returning *
        `,
        [response.id]
      );

      if (response.invitationId && invitation) {
        await client.query(
          `
            update survey_invitations
            set response_count = response_count + 1,
                status = case
                  when response_count + 1 >= max_responses then 'completed'
                  else 'started'
                end,
                completed_at = case
                  when response_count + 1 >= max_responses then now()
                  else completed_at
                end,
                started_at = coalesce(started_at, now()),
                updated_at = now()
            where id = $1
          `,
          [response.invitationId]
        );
      }

      await client.query(
        `
          update respondent_sessions
          set status = 'submitted',
              last_seen_at = now()
          where id = $1
        `,
        [sessionId]
      );

      return mapResponse(submittedResponseResult.rows[0] as Record<string, unknown>);
    });
  }
}
