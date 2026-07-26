import { databasePool } from "../../config/database";
import type { IResponseRepository } from "./response.repository.interface";
import type { SurveyResponse } from "./response.types";

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
  invitationId: String(row.invitation_id),
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
    invitationId: string;
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
            value_json
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          on conflict (response_id, question_id)
          do update
            set question_stable_key = excluded.question_stable_key,
                value_text = excluded.value_text,
                value_number = excluded.value_number,
                value_boolean = excluded.value_boolean,
                value_timestamp = excluded.value_timestamp,
                value_json = excluded.value_json,
                updated_at = now()
          returning *
        `,
        [
          input.responseId,
          input.questionId,
          input.questionStableKey,
          input.valueText,
          input.valueNumber,
          input.valueBoolean,
          input.valueTimestamp,
          JSON.stringify(input.valueJson)
        ]
      );

      const answerId = String((answerResult.rows[0] as Record<string, unknown>).id);

      await client.query("delete from answer_choices where answer_id = $1", [answerId]);

      for (const optionId of input.optionIds) {
        await client.query(
          "insert into answer_choices (answer_id, option_id) values ($1, $2)",
          [answerId, optionId]
        );
      }

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

  public async submitResponse(responseId: string, sessionId: string): Promise<SurveyResponse> {
    await databasePool.query("select * from submit_survey_response($1, $2)", [responseId, sessionId]);
    const response = await this.findResponseById(responseId);
    return response as SurveyResponse;
  }
}
