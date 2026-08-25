import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { buildPaginatedResult } from "../../common/utils/pagination";
import { createStableKey } from "../../common/utils/stable-key";
import { databasePool } from "../../config/database";
import { defaultSurveyVersionSettings } from "./survey.defaults";
import type { ISurveyRepository } from "./survey.repository.interface";
import type {
  BulkUpdateOptionScoresInput,
  CalculatedScoreTargetType,
  CreateDraftFromPublishedVersionInput,
  CreateOptionInput,
  CreateQuestionInput,
  CreateSectionInput,
  CreateSurveyInput,
  CreateSurveyResult,
  DeleteOptionInput,
  DeleteQuestionInput,
  DeleteSectionInput,
  ListSurveysInput,
  ListSurveysResult,
  PublishDraftInput,
  Question,
  QuestionOption,
  ReorderOptionsInput,
  ReorderQuestionsInput,
  ReorderSectionsInput,
  SurveyCalculatedScore,
  SurveyCalculatedScoreQuestion,
  SurveyCalculatedScoreTarget,
  Survey,
  SurveyInfo,
  SurveySection,
  SurveyVersion,
  SurveyVersionDefinition,
  UpdateCalculatedScoreInput,
  UpdateDraftVersionInput,
  UpdateOptionInput,
  UpdateQuestionInput,
  UpdateSectionInput,
  UpdateSurveyLifecycleInput,
  UpdateSurveyMetadataInput,
  UpsertCalculatedScoreInput
} from "./survey.types";

type DatabaseClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
  release?: () => void;
};

const SECTION_REORDER_TEMP_OFFSET = 1000000;

const mapSurvey = (row: Record<string, unknown>): Survey => ({
  accessMode: row.access_mode as Survey["accessMode"],
  closesAt: row.closes_at ? String(row.closes_at) : null,
  createdAt: String(row.created_at),
  createdBy: String(row.created_by),
  currentDraftVersionId: row.current_draft_version_id ? String(row.current_draft_version_id) : null,
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  id: String(row.id),
  opensAt: row.opens_at ? String(row.opens_at) : null,
  organizationId: String(row.organization_id),
  publicSlug: String(row.public_slug),
  publishedVersionId: row.published_version_id ? String(row.published_version_id) : null,
  responseLimit: row.response_limit === null ? null : Number(row.response_limit),
  slug: String(row.slug),
  status: row.status as Survey["status"],
  updatedAt: String(row.updated_at)
});

const mapSurveyVersion = (row: Record<string, unknown>): SurveyVersion => ({
  archivedAt: row.archived_at ? String(row.archived_at) : null,
  changeSummary: row.change_summary ? String(row.change_summary) : null,
  createdAt: String(row.created_at),
  createdBy: String(row.created_by),
  createdFromVersionId: row.created_from_version_id ? String(row.created_from_version_id) : null,
  description: row.description ? String(row.description) : null,
  id: String(row.id),
  publishedAt: row.published_at ? String(row.published_at) : null,
  publishedBy: row.published_by ? String(row.published_by) : null,
  settings: (row.settings as SurveyVersion["settings"]) ?? defaultSurveyVersionSettings(),
  status: row.status as SurveyVersion["status"],
  surveyId: String(row.survey_id),
  title: String(row.title),
  updatedAt: String(row.updated_at),
  versionNumber: Number(row.version_number)
});

const mapSection = (row: Record<string, unknown>): SurveySection => ({
  createdAt: String(row.created_at),
  description: row.description ? String(row.description) : null,
  id: String(row.id),
  position: Number(row.position),
  settings: (row.settings as Record<string, unknown>) ?? {},
  stableKey: String(row.stable_key),
  surveyVersionId: String(row.survey_version_id),
  title: String(row.title),
  updatedAt: String(row.updated_at)
});

const mapQuestion = (row: Record<string, unknown>): Question => ({
  createdAt: String(row.created_at),
  description: row.description ? String(row.description) : null,
  displayLogic: (row.display_logic as Question["displayLogic"]) ?? {},
  id: String(row.id),
  position: Number(row.position),
  required: Boolean(row.required),
  sectionId: String(row.section_id),
  settings: (row.settings as Question["settings"]) ?? {},
  stableKey: String(row.stable_key),
  surveyVersionId: String(row.survey_version_id),
  title: String(row.title),
  type: row.type as Question["type"],
  updatedAt: String(row.updated_at),
  validation: (row.validation as Question["validation"]) ?? {}
});

const mapOption = (row: Record<string, unknown>): QuestionOption => ({
  createdAt: String(row.created_at),
  id: String(row.id),
  label: String(row.label),
  position: Number(row.position),
  questionId: String(row.question_id),
  scoreValue: row.score_value === null || row.score_value === undefined ? null : Number(row.score_value),
  settings: (row.settings as QuestionOption["settings"]) ?? {},
  stableKey: String(row.stable_key),
  updatedAt: String(row.updated_at),
  value: String(row.value)
});

const mapCalculatedScoreQuestion = (row: Record<string, unknown>): SurveyCalculatedScoreQuestion => ({
  calculatedScoreId: String(row.calculated_score_id),
  createdAt: String(row.created_at),
  id: String(row.id),
  position: Number(row.position),
  questionId: String(row.question_id),
  weight: Number(row.weight)
});

const mapCalculatedScoreTarget = (row: Record<string, unknown>): SurveyCalculatedScoreTarget => ({
  calculatedScoreId: String(row.calculated_score_id),
  createdAt: String(row.created_at),
  id: String(row.id),
  targetId: String(row.target_id),
  targetType: row.target_type as CalculatedScoreTargetType,
  updatedAt: String(row.updated_at)
});

const mapCalculatedScore = (
  row: Record<string, unknown>,
  questions: SurveyCalculatedScoreQuestion[],
  targets: SurveyCalculatedScoreTarget[]
): SurveyCalculatedScore => ({
  calculationType: row.calculation_type as SurveyCalculatedScore["calculationType"],
  createdAt: String(row.created_at),
  decimalPlaces: Number(row.decimal_places),
  id: String(row.id),
  key: String(row.key),
  name: String(row.name),
  questions,
  requireAllAnswers: Boolean(row.require_all_answers),
  surveyVersionId: String(row.survey_version_id),
  targets,
  thresholdOperator: row.threshold_operator as SurveyCalculatedScore["thresholdOperator"],
  thresholdValue: Number(row.threshold_value),
  updatedAt: String(row.updated_at)
});

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

const loadCalculatedScoreById = async (
  client: Pick<DatabaseClient, "query">,
  calculatedScoreId: string
): Promise<SurveyCalculatedScore | null> => {
  const result = await client.query("select * from survey_calculated_scores where id = $1", [calculatedScoreId]);

  if (!("rowCount" in result ? result.rowCount : result.rows.length)) {
    return null;
  }

  const [questionsResult, targetsResult] = await Promise.all([
    client.query("select * from survey_calculated_score_questions where calculated_score_id = $1 order by position asc", [
      calculatedScoreId
    ]),
    client.query("select * from survey_score_follow_up_targets where calculated_score_id = $1 order by created_at asc", [
      calculatedScoreId
    ])
  ]);

  return mapCalculatedScore(
    result.rows[0] as Record<string, unknown>,
    (questionsResult.rows as Record<string, unknown>[]).map((row) => mapCalculatedScoreQuestion(row)),
    (targetsResult.rows as Record<string, unknown>[]).map((row) => mapCalculatedScoreTarget(row))
  );
};

const countSectionsByVersion = async (client: DatabaseClient, surveyVersionId: string): Promise<number> => {
  const result = await client.query(
    "select count(*)::int as total from survey_sections where survey_version_id = $1",
    [surveyVersionId]
  );

  return Number((result.rows[0] as { total: number }).total ?? 0);
};

const clampSectionInsertPosition = (position: number, sectionCount: number) =>
  Math.min(Math.max(position, 0), sectionCount);

const shiftSectionPositionsForInsert = async (
  client: DatabaseClient,
  surveyVersionId: string,
  targetPosition: number
): Promise<void> => {
  await client.query(
    `
      update survey_sections
      set position = position + $3::int,
          updated_at = now()
      where survey_version_id = $1
        and position >= $2
    `,
    [surveyVersionId, targetPosition, SECTION_REORDER_TEMP_OFFSET]
  );

  await client.query(
    `
      update survey_sections
      set position = position - ($3::int - 1),
          updated_at = now()
      where survey_version_id = $1
        and position >= $2::int + $3::int
    `,
    [surveyVersionId, targetPosition, SECTION_REORDER_TEMP_OFFSET]
  );
};

const shiftSectionPositionsForMoveUp = async (
  client: DatabaseClient,
  surveyVersionId: string,
  sectionId: string,
  targetPosition: number,
  currentPosition: number
): Promise<void> => {
  await client.query(
    `
      update survey_sections
      set position = position + $5::int,
          updated_at = now()
      where survey_version_id = $1
        and id <> $2
        and position >= $3
        and position < $4
    `,
    [surveyVersionId, sectionId, targetPosition, currentPosition, SECTION_REORDER_TEMP_OFFSET]
  );

  await client.query(
    `
      update survey_sections
      set position = position - ($5::int - 1),
          updated_at = now()
      where survey_version_id = $1
        and id <> $2
        and position >= $3::int + $5::int
        and position < $4::int + $5::int
    `,
    [surveyVersionId, sectionId, targetPosition, currentPosition, SECTION_REORDER_TEMP_OFFSET]
  );
};

const shiftSectionPositionsForMoveDown = async (
  client: DatabaseClient,
  surveyVersionId: string,
  sectionId: string,
  currentPosition: number,
  targetPosition: number
): Promise<void> => {
  await client.query(
    `
      update survey_sections
      set position = position + $5::int,
          updated_at = now()
      where survey_version_id = $1
        and id <> $2
        and position > $3
        and position <= $4
    `,
    [surveyVersionId, sectionId, currentPosition, targetPosition, SECTION_REORDER_TEMP_OFFSET]
  );

  await client.query(
    `
      update survey_sections
      set position = position - ($5::int + 1),
          updated_at = now()
      where survey_version_id = $1
        and id <> $2
        and position > $3::int + $5::int
        and position <= $4::int + $5::int
    `,
    [surveyVersionId, sectionId, currentPosition, targetPosition, SECTION_REORDER_TEMP_OFFSET]
  );
};

const cleanupCalculatedScoreReferencesForQuestions = async (
  client: DatabaseClient,
  questionIds: string[]
): Promise<void> => {
  if (questionIds.length === 0) {
    return;
  }

  await client.query("delete from survey_calculated_score_questions where question_id = any($1::uuid[])", [questionIds]);
  await client.query(
    `
      delete from survey_score_follow_up_targets
      where target_type = 'question'
        and target_id = any($1::uuid[])
    `,
    [questionIds]
  );
};

const clampSectionUpdatePosition = (position: number, sectionCount: number) =>
  Math.min(Math.max(position, 0), Math.max(sectionCount - 1, 0));

export class SurveyRepository implements ISurveyRepository {
  public async createSurveyWithInitialDraft(input: CreateSurveyInput): Promise<CreateSurveyResult> {
    try {
      return await withTransaction(async (client) => {
        const result = await client.query(
          "select * from create_survey_with_initial_draft($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
          [
            input.organizationId,
            input.slug,
            input.publicSlug,
            input.accessMode,
            input.opensAt,
            input.closesAt,
            input.responseLimit,
            input.createdBy,
            input.title,
            JSON.stringify({
              description: input.description,
              settings: input.settings
            })
          ]
        );

        const row = result.rows[0] as Record<string, unknown>;

        return {
          draftVersion: mapSurveyVersion({
            id: row.draft_version_id,
            survey_id: row.survey_id,
            version_number: row.version_number,
            status: "draft",
            created_from_version_id: null,
            title: input.title,
            description: input.description,
            settings: input.settings,
            change_summary: null,
            created_by: input.createdBy,
            published_by: null,
            created_at: row.created_at,
            updated_at: row.created_at,
            published_at: null,
            archived_at: null
          }),
          survey: mapSurvey({
            id: row.survey_id,
            organization_id: input.organizationId,
            slug: input.slug,
            public_slug: input.publicSlug,
            status: "draft",
            access_mode: input.accessMode,
            current_draft_version_id: row.draft_version_id,
            published_version_id: null,
            opens_at: input.opensAt,
            closes_at: input.closesAt,
            response_limit: input.responseLimit,
            created_by: input.createdBy,
            created_at: row.created_at,
            updated_at: row.created_at,
            deleted_at: null
          })
        };
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new AppError(
          ERROR_CODES.surveySlugAlreadyExists,
          "The survey slug is already in use for this organization.",
          409
        );
      }

      throw new AppError(ERROR_CODES.databaseError, "Failed to create survey.", 500);
    }
  }

  public async findSurveyById(surveyId: string): Promise<Survey | null> {
    const result = await databasePool.query(
      "select * from surveys where id = $1 and deleted_at is null",
      [surveyId]
    );
    return result.rowCount ? mapSurvey(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findSurveyByPublicSlug(publicSlug: string): Promise<Survey | null> {
    const result = await databasePool.query(
      "select * from surveys where public_slug = $1 and deleted_at is null",
      [publicSlug]
    );
    return result.rowCount ? mapSurvey(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findSurveyBySlug(organizationId: string, slug: string): Promise<Survey | null> {
    const result = await databasePool.query(
      "select * from surveys where organization_id = $1 and slug = $2 and deleted_at is null",
      [organizationId, slug]
    );
    return result.rowCount ? mapSurvey(result.rows[0] as Record<string, unknown>) : null;
  }

  public async listSurveys(input: ListSurveysInput): Promise<ListSurveysResult> {
    const offset = (input.page - 1) * input.limit;
    const filterSql = input.organizationId ? "where s.organization_id = $1 and s.deleted_at is null" : "where s.deleted_at is null";
    const params = input.organizationId ? [input.organizationId, input.limit, offset] : [input.limit, offset];
    const limitIndex = input.organizationId ? 2 : 1;
    const offsetIndex = input.organizationId ? 3 : 2;

    const rowsResult = await databasePool.query(
      `
        select
          s.*,
          dv.version_number as current_draft_version_number,
          pv.version_number as published_version_number,
          coalesce(dv.title, pv.title) as title,
          coalesce(dv.description, pv.description) as description,
          coalesce(sr.submitted_count, 0) as submitted_response_count,
          coalesce(sr.in_progress_count, 0) as in_progress_response_count
        from surveys s
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
        ${filterSql}
        order by s.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      params
    );

    const countResult = await databasePool.query(
      `select count(*)::int as total from surveys s ${filterSql}`,
      input.organizationId ? [input.organizationId] : []
    );

    const items = rowsResult.rows.map((row: Record<string, unknown>) => ({
      ...mapSurvey(row as Record<string, unknown>),
      currentDraftVersionNumber: row.current_draft_version_number === null ? null : Number(row.current_draft_version_number),
      description: row.description ? String(row.description) : null,
      inProgressResponseCount: Number(row.in_progress_response_count ?? 0),
      publishedVersionNumber: row.published_version_number === null ? null : Number(row.published_version_number),
      submittedResponseCount: Number(row.submitted_response_count ?? 0),
      title: row.title ? String(row.title) : null
    }));

    return buildPaginatedResult(items, Number(countResult.rows[0].total), {
      limit: input.limit,
      page: input.page
    });
  }

  public async getSurveyInfo(surveyId: string): Promise<SurveyInfo | null> {
    const surveyResult = await databasePool.query(
      `
        select
          s.*,
          dv.archived_at as current_draft_archived_at,
          dv.change_summary as current_draft_change_summary,
          dv.created_at as current_draft_created_at,
          dv.created_by as current_draft_created_by,
          dv.created_from_version_id as current_draft_created_from_version_id,
          dv.description as current_draft_description,
          dv.id as current_draft_id,
          dv.published_at as current_draft_published_at,
          dv.published_by as current_draft_published_by,
          dv.settings as current_draft_settings,
          dv.status as current_draft_status,
          dv.survey_id as current_draft_survey_id,
          dv.title as current_draft_title,
          dv.updated_at as current_draft_updated_at,
          dv.version_number as current_draft_version_number,
          pv.archived_at as published_version_archived_at,
          pv.change_summary as published_version_change_summary,
          pv.created_at as published_version_created_at,
          pv.created_by as published_version_created_by,
          pv.created_from_version_id as published_version_created_from_version_id,
          pv.description as published_version_description,
          pv.id as published_version_id_value,
          pv.published_at as published_version_published_at,
          pv.published_by as published_version_published_by,
          pv.settings as published_version_settings,
          pv.status as published_version_status,
          pv.survey_id as published_version_survey_id,
          pv.title as published_version_title,
          pv.updated_at as published_version_updated_at,
          pv.version_number as published_version_version_number
        from surveys s
        left join survey_versions dv on dv.id = s.current_draft_version_id
        left join survey_versions pv on pv.id = s.published_version_id
        where s.id = $1
          and s.deleted_at is null
      `,
      [surveyId]
    );

    if (!surveyResult.rowCount) {
      return null;
    }

    const surveyRow = surveyResult.rows[0] as Record<string, unknown>;
    const versionsResult = await databasePool.query(
      "select * from survey_versions where survey_id = $1 order by version_number asc",
      [surveyId]
    );

    const mapAliasedVersion = (rowPrefix: "current_draft" | "published_version"): SurveyVersion | null => {
      const idKey = rowPrefix === "current_draft" ? "current_draft_id" : "published_version_id_value";

      if (!surveyRow[idKey]) {
        return null;
      }

      return mapSurveyVersion({
        archived_at: surveyRow[`${rowPrefix}_archived_at`],
        change_summary: surveyRow[`${rowPrefix}_change_summary`],
        created_at: surveyRow[`${rowPrefix}_created_at`],
        created_by: surveyRow[`${rowPrefix}_created_by`],
        created_from_version_id: surveyRow[`${rowPrefix}_created_from_version_id`],
        description: surveyRow[`${rowPrefix}_description`],
        id: surveyRow[idKey],
        published_at: surveyRow[`${rowPrefix}_published_at`],
        published_by: surveyRow[`${rowPrefix}_published_by`],
        settings: surveyRow[`${rowPrefix}_settings`],
        status: surveyRow[`${rowPrefix}_status`],
        survey_id: surveyRow[`${rowPrefix}_survey_id`],
        title: surveyRow[`${rowPrefix}_title`],
        updated_at: surveyRow[`${rowPrefix}_updated_at`],
        version_number: surveyRow[`${rowPrefix}_version_number`]
      });
    };

    return {
      ...mapSurvey(surveyRow),
      currentDraftVersion: mapAliasedVersion("current_draft"),
      publishedVersion: mapAliasedVersion("published_version"),
      versions: versionsResult.rows.map((row: Record<string, unknown>) => mapSurveyVersion(row))
    };
  }

  public async findDraftVersion(surveyId: string): Promise<SurveyVersion | null> {
    const result = await databasePool.query(
      "select * from survey_versions where survey_id = $1 and status = 'draft'",
      [surveyId]
    );
    return result.rowCount ? mapSurveyVersion(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findPublishedVersion(surveyId: string): Promise<SurveyVersion | null> {
    const result = await databasePool.query(
      "select * from survey_versions where survey_id = $1 and status = 'published' order by version_number desc limit 1",
      [surveyId]
    );
    return result.rowCount ? mapSurveyVersion(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findVersionById(surveyId: string, versionId: string): Promise<SurveyVersion | null> {
    const result = await databasePool.query(
      "select * from survey_versions where id = $1 and survey_id = $2",
      [versionId, surveyId]
    );
    return result.rowCount ? mapSurveyVersion(result.rows[0] as Record<string, unknown>) : null;
  }

  public async listVersions(surveyId: string): Promise<SurveyVersion[]> {
    const result = await databasePool.query(
      "select * from survey_versions where survey_id = $1 order by version_number asc",
      [surveyId]
    );

    return result.rows.map((row: Record<string, unknown>) => mapSurveyVersion(row));
  }

  public async getVersionDefinition(versionId: string): Promise<SurveyVersionDefinition | null> {
    const versionResult = await databasePool.query("select * from survey_versions where id = $1", [versionId]);

    if (!versionResult.rowCount) {
      return null;
    }

    const [sectionsResult, questionsResult, optionsResult, calculatedScores] = await Promise.all([
      databasePool.query("select * from survey_sections where survey_version_id = $1 order by position asc", [versionId]),
      databasePool.query(
        `
          select q.*
          from questions q
          inner join survey_sections s on s.id = q.section_id
          where q.survey_version_id = $1
          order by s.position asc, q.position asc
        `,
        [versionId]
      ),
      databasePool.query(
        `
          select qo.*
          from question_options qo
          inner join questions q on q.id = qo.question_id
          where q.survey_version_id = $1
          order by qo.question_id, qo.position asc
        `,
        [versionId]
      ),
      this.listCalculatedScoresByVersion(versionId)
    ]);

    return {
      calculatedScores,
      options: optionsResult.rows.map((row: Record<string, unknown>) => mapOption(row)),
      questions: questionsResult.rows.map((row: Record<string, unknown>) => mapQuestion(row)),
      sections: sectionsResult.rows.map((row: Record<string, unknown>) => mapSection(row)),
      version: mapSurveyVersion(versionResult.rows[0] as Record<string, unknown>)
    };
  }

  public async createDraftFromPublishedVersion(
    input: CreateDraftFromPublishedVersionInput
  ): Promise<SurveyVersion> {
    const result = await databasePool.query(
      "select * from create_draft_from_published_version($1, $2, $3)",
      [input.surveyId, input.createdBy, input.changeSummary]
    );

    const row = result.rows[0] as Record<string, unknown>;
    const draftVersionId = String(row.draft_version_id);

    await databasePool.query(
      `
        update survey_sections new_section
        set settings = published_section.settings
        from surveys survey
        inner join survey_sections published_section
          on published_section.survey_version_id = survey.published_version_id
         and published_section.stable_key = new_section.stable_key
        where survey.id = $1
          and new_section.survey_version_id = $2
      `,
      [input.surveyId, draftVersionId]
    );

    return this.findVersionById(input.surveyId, draftVersionId) as Promise<SurveyVersion>;
  }

  public async publishDraft(input: PublishDraftInput): Promise<SurveyVersion> {
    await databasePool.query("select publish_survey_draft($1, $2, $3)", [
      input.surveyId,
      input.versionId,
      input.publishedBy
    ]);

    const version = await this.findVersionById(input.surveyId, input.versionId);

    if (!version) {
      throw new AppError(ERROR_CODES.versionNotFound, "Version was not found after publishing.", 404);
    }

    return version;
  }

  public async archiveDraft(surveyId: string, versionId: string): Promise<void> {
    await databasePool.query(
      `
        update survey_versions
        set status = 'archived',
            archived_at = now(),
            updated_at = now()
        where id = $1 and survey_id = $2 and status = 'draft'
      `,
      [versionId, surveyId]
    );

    await databasePool.query(
      `
        update surveys
        set current_draft_version_id = null,
            updated_at = now()
        where id = $1
      `,
      [surveyId]
    );
  }

  public async updateSurveyMetadata(input: UpdateSurveyMetadataInput): Promise<Survey> {
    const result = await databasePool.query(
      `
        update surveys
        set slug = $2,
            access_mode = $3,
            opens_at = $4,
            closes_at = $5,
            response_limit = $6,
            updated_at = now()
        where id = $1
        returning *
      `,
      [
        input.surveyId,
        input.slug,
        input.accessMode,
        input.opensAt,
        input.closesAt,
        input.responseLimit
      ]
    );

    return mapSurvey(result.rows[0] as Record<string, unknown>);
  }

  public async updateDraftVersion(input: UpdateDraftVersionInput): Promise<SurveyVersion> {
    const result = await databasePool.query(
      `
        update survey_versions
        set title = $2,
            description = $3,
            settings = $4::jsonb,
            change_summary = $5,
            updated_at = now()
        where id = $1
          and status = 'draft'
        returning *
      `,
      [
        input.surveyVersionId,
        input.title,
        input.description,
        JSON.stringify(input.settings),
        input.changeSummary
      ]
    );

    return mapSurveyVersion(result.rows[0] as Record<string, unknown>);
  }

  public async closeSurvey(input: UpdateSurveyLifecycleInput): Promise<Survey> {
    const result = await databasePool.query(
      "update surveys set status = 'closed', updated_at = now() where id = $1 returning *",
      [input.surveyId]
    );
    return mapSurvey(result.rows[0] as Record<string, unknown>);
  }

  public async reopenSurvey(input: UpdateSurveyLifecycleInput): Promise<Survey> {
    const result = await databasePool.query(
      "update surveys set status = 'published', updated_at = now() where id = $1 returning *",
      [input.surveyId]
    );
    return mapSurvey(result.rows[0] as Record<string, unknown>);
  }

  public async createSection(input: CreateSectionInput): Promise<SurveySection> {
    return withTransaction(async (client) => {
      const sectionCount = await countSectionsByVersion(client, input.surveyVersionId);
      const targetPosition = clampSectionInsertPosition(input.position, sectionCount);

      await shiftSectionPositionsForInsert(client, input.surveyVersionId, targetPosition);

      const result = await client.query(
        `
          insert into survey_sections (survey_version_id, stable_key, title, description, position, settings)
          values ($1, $2, $3, $4, $5, $6)
          returning *
        `,
        [
          input.surveyVersionId,
          createStableKey("sec"),
          input.title,
          input.description,
          targetPosition,
          JSON.stringify(input.settings)
        ]
      );

      return mapSection(result.rows[0] as Record<string, unknown>);
    });
  }

  public async updateSection(input: UpdateSectionInput): Promise<SurveySection> {
    return withTransaction(async (client) => {
      const existingResult = await client.query("select * from survey_sections where id = $1", [
        input.sectionId
      ]);
      const existingSection = existingResult.rows[0] as Record<string, unknown> | undefined;

      if (!existingSection) {
        throw new AppError(ERROR_CODES.sectionNotFound, "Section was not found.", 404);
      }

      const surveyVersionId = String(existingSection.survey_version_id);
      const currentPosition = Number(existingSection.position);
      const sectionCount = await countSectionsByVersion(client, surveyVersionId);
      const targetPosition = clampSectionUpdatePosition(input.position, sectionCount);

      if (targetPosition < currentPosition) {
        await shiftSectionPositionsForMoveUp(
          client,
          surveyVersionId,
          input.sectionId,
          targetPosition,
          currentPosition
        );
      } else if (targetPosition > currentPosition) {
        await shiftSectionPositionsForMoveDown(
          client,
          surveyVersionId,
          input.sectionId,
          currentPosition,
          targetPosition
        );
      }

      const result = await client.query(
        `
          update survey_sections
          set title = $2, description = $3, position = $4, settings = $5, updated_at = now()
          where id = $1
          returning *
        `,
        [input.sectionId, input.title, input.description, targetPosition, JSON.stringify(input.settings)]
      );

      return mapSection(result.rows[0] as Record<string, unknown>);
    });
  }

  public async deleteSection(input: DeleteSectionInput): Promise<void> {
    await withTransaction(async (client) => {
      const sectionResult = await client.query("select * from survey_sections where id = $1", [input.sectionId]);
      const section = sectionResult.rows[0] as Record<string, unknown> | undefined;

      if (!section) {
        return;
      }

      const questionsResult = await client.query("select id from questions where section_id = $1", [input.sectionId]);
      const questionIds = (questionsResult.rows as Array<{ id: string }>).map((row) => String(row.id));

      await cleanupCalculatedScoreReferencesForQuestions(client, questionIds);
      await client.query(
        `
          delete from survey_score_follow_up_targets
          where target_type = 'section'
            and target_id = $1
        `,
        [input.sectionId]
      );
      await client.query("delete from survey_sections where id = $1", [input.sectionId]);
    });
  }

  public async reorderSections(input: ReorderSectionsInput): Promise<SurveySection[]> {
    await withTransaction(async (client) => {
      for (const [index, item] of input.items.entries()) {
        await client.query(
          `
            update survey_sections
            set position = $2, updated_at = now()
            where id = $1 and survey_version_id = $3
          `,
          [item.sectionId, SECTION_REORDER_TEMP_OFFSET + index, input.surveyVersionId]
        );
      }

      for (const item of input.items) {
        await client.query(
          `
            update survey_sections
            set position = $2, updated_at = now()
            where id = $1 and survey_version_id = $3
          `,
          [item.sectionId, item.position, input.surveyVersionId]
        );
      }
    });

    return this.listSectionsByVersion(input.surveyVersionId);
  }

  public async createQuestion(input: CreateQuestionInput): Promise<Question> {
    return withTransaction(async (client) => {
      const questionResult = await client.query(
        `
          insert into questions
            (survey_version_id, section_id, stable_key, type, title, description, required, position, validation, display_logic, settings)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
          returning *
        `,
        [
          input.surveyVersionId,
          input.sectionId,
          createStableKey("q"),
          input.questionType,
          input.title,
          input.description,
          input.required,
          input.position,
          JSON.stringify(input.validation),
          JSON.stringify(input.displayLogic),
          JSON.stringify(input.settings)
        ]
      );

      const question = mapQuestion(questionResult.rows[0] as Record<string, unknown>);

      for (const option of input.options) {
        await client.query(
          `
            insert into question_options (question_id, stable_key, label, value, position, settings)
            values ($1, $2, $3, $4, $5, $6::jsonb)
          `,
          [
            question.id,
            createStableKey("opt"),
            option.label,
            option.value,
            option.position,
            JSON.stringify(option.settings)
          ]
        );
      }

      return question;
    });
  }

  public async updateQuestion(input: UpdateQuestionInput): Promise<Question> {
    const result = await databasePool.query(
      `
        update questions
        set type = $2,
            title = $3,
            description = $4,
            required = $5,
            position = $6,
            validation = $7::jsonb,
            display_logic = $8::jsonb,
            settings = $9::jsonb,
            updated_at = now()
        where id = $1
        returning *
      `,
      [
        input.questionId,
        input.questionType,
        input.title,
        input.description,
        input.required,
        input.position,
        JSON.stringify(input.validation),
        JSON.stringify(input.displayLogic),
        JSON.stringify(input.settings)
      ]
    );

    return mapQuestion(result.rows[0] as Record<string, unknown>);
  }

  public async deleteQuestion(input: DeleteQuestionInput): Promise<void> {
    await withTransaction(async (client) => {
      const questionResult = await client.query("select * from questions where id = $1", [input.questionId]);
      const question = questionResult.rows[0] as Record<string, unknown> | undefined;

      if (!question) {
        return;
      }

      await cleanupCalculatedScoreReferencesForQuestions(client, [input.questionId]);
      await client.query(
        `
          delete from survey_score_follow_up_targets
          where target_type = 'question'
            and target_id = $1
        `,
        [input.questionId]
      );
      await client.query("delete from questions where id = $1", [input.questionId]);
    });
  }

  public async reorderQuestions(input: ReorderQuestionsInput): Promise<Question[]> {
    await withTransaction(async (client) => {
      for (const item of input.items) {
        await client.query(
          "update questions set position = $2, updated_at = now() where id = $1 and section_id = $3",
          [item.questionId, item.position, input.sectionId]
        );
      }
    });

    const result = await databasePool.query(
      "select * from questions where section_id = $1 order by position asc",
      [input.sectionId]
    );

    return result.rows.map((row: Record<string, unknown>) => mapQuestion(row));
  }

  public async createOption(input: CreateOptionInput): Promise<QuestionOption> {
    const result = await databasePool.query(
      `
        insert into question_options (question_id, stable_key, label, value, score_value, position, settings)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb)
        returning *
      `,
      [
        input.questionId,
        createStableKey("opt"),
        input.label,
        input.value,
        null,
        input.position,
        JSON.stringify(input.settings)
      ]
    );

    return mapOption(result.rows[0] as Record<string, unknown>);
  }

  public async updateOption(input: UpdateOptionInput): Promise<QuestionOption> {
    const result = await databasePool.query(
      `
        update question_options
        set label = $2, value = $3, position = $4, score_value = $5, settings = $6::jsonb, updated_at = now()
        where id = $1
        returning *
      `,
      [input.optionId, input.label, input.value, input.position, input.scoreValue, JSON.stringify(input.settings)]
    );

    return mapOption(result.rows[0] as Record<string, unknown>);
  }

  public async bulkUpdateOptionScores(input: BulkUpdateOptionScoresInput): Promise<QuestionOption[]> {
    await withTransaction(async (client) => {
      for (const option of input.options) {
        await client.query(
          `
            update question_options
            set score_value = $2,
                updated_at = now()
            where id = $1
              and question_id = $3
          `,
          [option.optionId, option.scoreValue, input.questionId]
        );
      }
    });

    return this.listOptionsByQuestion(input.questionId);
  }

  public async deleteOption(input: DeleteOptionInput): Promise<void> {
    await databasePool.query("delete from question_options where id = $1", [input.optionId]);
  }

  public async reorderOptions(input: ReorderOptionsInput): Promise<QuestionOption[]> {
    await withTransaction(async (client) => {
      for (const item of input.items) {
        await client.query(
          "update question_options set position = $2, updated_at = now() where id = $1 and question_id = $3",
          [item.optionId, item.position, input.questionId]
        );
      }
    });

    return this.listOptionsByQuestion(input.questionId);
  }

  public async findSectionById(sectionId: string): Promise<SurveySection | null> {
    const result = await databasePool.query("select * from survey_sections where id = $1", [sectionId]);
    return result.rowCount ? mapSection(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findQuestionById(questionId: string): Promise<Question | null> {
    const result = await databasePool.query("select * from questions where id = $1", [questionId]);
    return result.rowCount ? mapQuestion(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findOptionById(optionId: string): Promise<QuestionOption | null> {
    const result = await databasePool.query("select * from question_options where id = $1", [optionId]);
    return result.rowCount ? mapOption(result.rows[0] as Record<string, unknown>) : null;
  }

  public async listSectionsByVersion(versionId: string): Promise<SurveySection[]> {
    const result = await databasePool.query(
      "select * from survey_sections where survey_version_id = $1 order by position asc",
      [versionId]
    );
    return result.rows.map((row: Record<string, unknown>) => mapSection(row));
  }

  public async listQuestionsByVersion(versionId: string): Promise<Question[]> {
    const result = await databasePool.query(
      "select * from questions where survey_version_id = $1 order by section_id, position asc",
      [versionId]
    );
    return result.rows.map((row: Record<string, unknown>) => mapQuestion(row));
  }

  public async listOptionsByQuestion(questionId: string): Promise<QuestionOption[]> {
    const result = await databasePool.query(
      "select * from question_options where question_id = $1 order by position asc",
      [questionId]
    );
    return result.rows.map((row: Record<string, unknown>) => mapOption(row));
  }

  public async listOptionsByQuestionIds(questionIds: string[]): Promise<QuestionOption[]> {
    if (questionIds.length === 0) {
      return [];
    }

    const result = await databasePool.query(
      "select * from question_options where question_id = any($1::uuid[]) order by question_id asc, position asc",
      [questionIds]
    );
    return result.rows.map((row: Record<string, unknown>) => mapOption(row));
  }

  public async createCalculatedScore(input: UpsertCalculatedScoreInput): Promise<SurveyCalculatedScore> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `
          insert into survey_calculated_scores (
            survey_version_id,
            name,
            key,
            calculation_type,
            threshold_operator,
            threshold_value,
            require_all_answers,
            decimal_places
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning *
        `,
        [
          input.surveyVersionId,
          input.name,
          input.key,
          input.calculationType,
          input.thresholdOperator,
          input.thresholdValue,
          input.requireAllAnswers,
          input.decimalPlaces
        ]
      );

      const calculatedScoreId = String((result.rows[0] as Record<string, unknown>).id);

      for (const [index, questionId] of input.sourceQuestionIds.entries()) {
        await client.query(
          `
            insert into survey_calculated_score_questions (calculated_score_id, question_id, weight, position)
            values ($1, $2, $3, $4)
          `,
          [calculatedScoreId, questionId, 1, index]
        );
      }

      for (const target of input.targets) {
        await client.query(
          `
            insert into survey_score_follow_up_targets (calculated_score_id, target_type, target_id)
            values ($1, $2, $3)
          `,
          [calculatedScoreId, target.targetType, target.targetId]
        );
      }

      const created = await loadCalculatedScoreById(client, calculatedScoreId);

      if (!created) {
        throw new AppError(ERROR_CODES.resourceNotFound, "Calculated score was not found after creation.", 404);
      }

      return created;
    });
  }

  public async updateCalculatedScore(input: UpdateCalculatedScoreInput): Promise<SurveyCalculatedScore> {
    return withTransaction(async (client) => {
      await client.query(
        `
          update survey_calculated_scores
          set name = $2,
              key = $3,
              calculation_type = $4,
              threshold_operator = $5,
              threshold_value = $6,
              require_all_answers = $7,
              decimal_places = $8,
              updated_at = now()
          where id = $1
        `,
        [
          input.calculatedScoreId,
          input.name,
          input.key,
          input.calculationType,
          input.thresholdOperator,
          input.thresholdValue,
          input.requireAllAnswers,
          input.decimalPlaces
        ]
      );

      await client.query("delete from survey_calculated_score_questions where calculated_score_id = $1", [input.calculatedScoreId]);
      await client.query("delete from survey_score_follow_up_targets where calculated_score_id = $1", [input.calculatedScoreId]);

      for (const [index, questionId] of input.sourceQuestionIds.entries()) {
        await client.query(
          `
            insert into survey_calculated_score_questions (calculated_score_id, question_id, weight, position)
            values ($1, $2, $3, $4)
          `,
          [input.calculatedScoreId, questionId, 1, index]
        );
      }

      for (const target of input.targets) {
        await client.query(
          `
            insert into survey_score_follow_up_targets (calculated_score_id, target_type, target_id)
            values ($1, $2, $3)
          `,
          [input.calculatedScoreId, target.targetType, target.targetId]
        );
      }

      const updated = await loadCalculatedScoreById(client, input.calculatedScoreId);

      if (!updated) {
        throw new AppError(ERROR_CODES.resourceNotFound, "Calculated score was not found after update.", 404);
      }

      return updated;
    });
  }

  public async deleteCalculatedScore(calculatedScoreId: string): Promise<void> {
    await databasePool.query("delete from survey_calculated_scores where id = $1", [calculatedScoreId]);
  }

  public async findCalculatedScoreById(calculatedScoreId: string): Promise<SurveyCalculatedScore | null> {
    return loadCalculatedScoreById(databasePool, calculatedScoreId);
  }

  public async listCalculatedScoresByVersion(versionId: string): Promise<SurveyCalculatedScore[]> {
    const [scoresResult, questionsResult, targetsResult] = await Promise.all([
      databasePool.query(
        "select * from survey_calculated_scores where survey_version_id = $1 order by created_at asc",
        [versionId]
      ),
      databasePool.query(
        `
          select question_map.*
          from survey_calculated_score_questions question_map
          inner join survey_calculated_scores score on score.id = question_map.calculated_score_id
          where score.survey_version_id = $1
          order by question_map.calculated_score_id asc, question_map.position asc
        `,
        [versionId]
      ),
      databasePool.query(
        `
          select target.*
          from survey_score_follow_up_targets target
          inner join survey_calculated_scores score on score.id = target.calculated_score_id
          where score.survey_version_id = $1
          order by target.calculated_score_id asc, target.created_at asc
        `,
        [versionId]
      )
    ]);

    const questionsByScoreId = new Map<string, SurveyCalculatedScoreQuestion[]>();
    const targetsByScoreId = new Map<string, SurveyCalculatedScoreTarget[]>();

    for (const row of questionsResult.rows as Record<string, unknown>[]) {
      const question = mapCalculatedScoreQuestion(row);
      const items = questionsByScoreId.get(question.calculatedScoreId) ?? [];
      items.push(question);
      questionsByScoreId.set(question.calculatedScoreId, items);
    }

    for (const row of targetsResult.rows as Record<string, unknown>[]) {
      const target = mapCalculatedScoreTarget(row);
      const items = targetsByScoreId.get(target.calculatedScoreId) ?? [];
      items.push(target);
      targetsByScoreId.set(target.calculatedScoreId, items);
    }

    return scoresResult.rows.map((row: unknown) =>
      mapCalculatedScore(
        row as Record<string, unknown>,
        questionsByScoreId.get(String((row as Record<string, unknown>).id)) ?? [],
        targetsByScoreId.get(String((row as Record<string, unknown>).id)) ?? []
      )
    );
  }
}
