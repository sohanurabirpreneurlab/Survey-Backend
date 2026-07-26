import { databasePool } from "../../config/database";
import type { IResultRepository } from "./result.repository.interface";

export class ResultRepository implements IResultRepository {
  public async getSurveyResponseSummary(surveyId: string): Promise<{
    inProgressCount: number;
    submittedCount: number;
    surveyId: string;
  }> {
    const result = await databasePool.query(
      `
        select
          count(*) filter (where status = 'in_progress')::int as in_progress_count,
          count(*) filter (where status = 'submitted')::int as submitted_count
        from survey_responses
        where survey_id = $1
      `,
      [surveyId]
    );

    return {
      inProgressCount: Number((result.rows[0] as Record<string, unknown>).in_progress_count),
      submittedCount: Number((result.rows[0] as Record<string, unknown>).submitted_count),
      surveyId
    };
  }

  public async getChoiceQuestionResults(questionId: string): Promise<{
    options: Array<{ label: string; optionId: string; percentage: number; voteCount: number }>;
    questionId: string;
    totalVotes: number;
  }> {
    const result = await databasePool.query(
      `
        select
          qo.id as option_id,
          qo.label,
          count(ac.option_id)::int as vote_count
        from question_options qo
        left join answer_choices ac on ac.option_id = qo.id
        left join answers a on a.id = ac.answer_id
        left join survey_responses sr on sr.id = a.response_id and sr.status = 'submitted'
        where qo.question_id = $1
        group by qo.id, qo.label
        order by qo.position asc
      `,
      [questionId]
    );

    const rows = result.rows as Array<Record<string, unknown>>;
    const totalVotes = rows.reduce((sum, row) => sum + Number(row.vote_count), 0);

    return {
      options: rows.map((row) => ({
        label: String(row.label),
        optionId: String(row.option_id),
        percentage: totalVotes === 0 ? 0 : Number(((Number(row.vote_count) / totalVotes) * 100).toFixed(2)),
        voteCount: Number(row.vote_count)
      })),
      questionId,
      totalVotes
    };
  }
}
