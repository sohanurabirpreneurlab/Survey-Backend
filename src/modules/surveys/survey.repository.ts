import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { buildPaginatedResult } from "../../common/utils/pagination";
import { createStableKey } from "../../common/utils/stable-key";
import { databasePool } from "../../config/database";
import { defaultSurveyVersionSettings } from "./survey.defaults";
import type { ISurveyRepository } from "./survey.repository.interface";
import type {
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
  Survey,
  SurveySection,
  SurveyVersion,
  SurveyVersionDefinition,
  UpdateDraftVersionInput,
  UpdateOptionInput,
  UpdateQuestionInput,
  UpdateSectionInput,
  UpdateSurveyLifecycleInput,
  UpdateSurveyMetadataInput
} from "./survey.types";

type DatabaseClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
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
  settings: (row.settings as QuestionOption["settings"]) ?? {},
  stableKey: String(row.stable_key),
  updatedAt: String(row.updated_at),
  value: String(row.value)
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

const countSectionsByVersion = async (client: DatabaseClient, surveyVersionId: string): Promise<number> => {
  const result = await client.query(
    "select count(*)::int as total from survey_sections where survey_version_id = $1",
    [surveyVersionId]
  );

  return Number((result.rows[0] as { total: number }).total ?? 0);
};

const clampSectionInsertPosition = (position: number, sectionCount: number) =>
  Math.min(Math.max(position, 0), sectionCount);

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

    const [sectionsResult, questionsResult, optionsResult] = await Promise.all([
      databasePool.query("select * from survey_sections where survey_version_id = $1 order by position asc", [versionId]),
      databasePool.query("select * from questions where survey_version_id = $1 order by section_id, position asc", [versionId]),
      databasePool.query(
        `
          select qo.*
          from question_options qo
          inner join questions q on q.id = qo.question_id
          where q.survey_version_id = $1
          order by qo.question_id, qo.position asc
        `,
        [versionId]
      )
    ]);

    return {
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
    return this.findVersionById(input.surveyId, String(row.draft_version_id)) as Promise<SurveyVersion>;
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

      await client.query(
        `
          update survey_sections
          set position = position + 1,
              updated_at = now()
          where survey_version_id = $1
            and position >= $2
        `,
        [input.surveyVersionId, targetPosition]
      );

      const result = await client.query(
        `
          insert into survey_sections (survey_version_id, stable_key, title, description, position)
          values ($1, $2, $3, $4, $5)
          returning *
        `,
        [
          input.surveyVersionId,
          createStableKey("sec"),
          input.title,
          input.description,
          targetPosition
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
        await client.query(
          `
            update survey_sections
            set position = position + 1,
                updated_at = now()
            where survey_version_id = $1
              and id <> $2
              and position >= $3
              and position < $4
          `,
          [surveyVersionId, input.sectionId, targetPosition, currentPosition]
        );
      } else if (targetPosition > currentPosition) {
        await client.query(
          `
            update survey_sections
            set position = position - 1,
                updated_at = now()
            where survey_version_id = $1
              and id <> $2
              and position > $3
              and position <= $4
          `,
          [surveyVersionId, input.sectionId, currentPosition, targetPosition]
        );
      }

      const result = await client.query(
        `
          update survey_sections
          set title = $2, description = $3, position = $4, updated_at = now()
          where id = $1
          returning *
        `,
        [input.sectionId, input.title, input.description, targetPosition]
      );

      return mapSection(result.rows[0] as Record<string, unknown>);
    });
  }

  public async deleteSection(input: DeleteSectionInput): Promise<void> {
    await databasePool.query("delete from survey_sections where id = $1", [input.sectionId]);
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
    await databasePool.query("delete from questions where id = $1", [input.questionId]);
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
        insert into question_options (question_id, stable_key, label, value, position, settings)
        values ($1, $2, $3, $4, $5, $6::jsonb)
        returning *
      `,
      [
        input.questionId,
        createStableKey("opt"),
        input.label,
        input.value,
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
        set label = $2, value = $3, position = $4, settings = $5::jsonb, updated_at = now()
        where id = $1
        returning *
      `,
      [input.optionId, input.label, input.value, input.position, JSON.stringify(input.settings)]
    );

    return mapOption(result.rows[0] as Record<string, unknown>);
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
}
