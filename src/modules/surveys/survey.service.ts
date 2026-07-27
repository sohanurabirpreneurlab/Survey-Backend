import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { createSecureToken, hashToken } from "../../common/security/token-hash";
import { env } from "../../config/env";
import { defaultSurveyVersionSettings } from "./survey.defaults";
import { OrganizationService } from "../organizations/organization.service";
import { compareSurveyVersions } from "./survey-version-diff.service";
import { SurveyRepository } from "./survey.repository";
import type { ISurveyRepository } from "./survey.repository.interface";
import { validateDraftForPublishing } from "./survey-publish.validator";
import type {
  CreateOptionInput,
  CreateQuestionInput,
  CreateSectionInput,
  CreateSurveyInput,
  DeleteOptionInput,
  DeleteQuestionInput,
  DeleteSectionInput,
  Question,
  ReorderOptionsInput,
  ReorderQuestionsInput,
  ReorderSectionsInput,
  Survey,
  SurveyShareInfo,
  SurveySection,
  SurveyVersion,
  SurveyVersionSettings,
  UpdateOptionInput,
  UpdateDraftVersionInput,
  UpdateQuestionInput,
  UpdateSectionInput,
  UpdateSurveyMetadataInput
} from "./survey.types";

type EditableDraftContext = {
  draftVersion: SurveyVersion;
  membership: Awaited<ReturnType<OrganizationService["requireOrganizationMembership"]>>;
  survey: Survey;
};

const questionSupportsOptions = (questionType: Question["type"]): boolean =>
  ["single_choice", "multiple_choice", "yes_no", "vote"].includes(questionType);

export class SurveyService {
  public constructor(
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository(),
    private readonly organizationService = new OrganizationService()
  ) {}

  public async createSurvey(input: CreateSurveyInput) {
    const membership = await this.organizationService.requireOrganizationMembership(
      input.organizationId,
      input.createdBy
    );
    this.organizationService.requireSurveyCreatePermission(membership);

    const existingSurvey = await this.surveyRepository.findSurveyBySlug(input.organizationId, input.slug);

    if (existingSurvey) {
      throw new AppError(
        ERROR_CODES.surveySlugAlreadyExists,
        "The survey slug is already in use for this organization.",
        409
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const publicSlug = `s_${hashToken(createSecureToken()).slice(0, 18)}`;
      const existingPublicSlug = await this.surveyRepository.findSurveyByPublicSlug(publicSlug);

      if (existingPublicSlug) {
        continue;
      }

      return this.surveyRepository.createSurveyWithInitialDraft({
        ...input,
        publicSlug,
        settings: {
          ...defaultSurveyVersionSettings(),
          ...input.settings
        }
      });
    }

    throw new AppError(ERROR_CODES.databaseConflict, "Failed to allocate a public survey link.", 409);
  }

  public async listSurveys(userId: string, organizationId?: string, page = 1, limit = 20) {
    if (organizationId) {
      const membership = await this.organizationService.requireOrganizationMembership(organizationId, userId);
      this.organizationService.requireSurveyReadPermission(membership);
    }

    return this.surveyRepository.listSurveys({ limit, organizationId, page });
  }

  public async getSurvey(surveyId: string, userId: string): Promise<Survey> {
    const survey = await this.requireSurvey(surveyId);
    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyReadPermission(membership);
    return survey;
  }

  public async getSurveyShareInfo(surveyId: string, userId: string): Promise<SurveyShareInfo> {
    const survey = await this.getSurvey(surveyId, userId);
    const preferredVersionId = survey.currentDraftVersionId ?? survey.publishedVersionId;
    const version = preferredVersionId
      ? await this.surveyRepository.findVersionById(survey.id, preferredVersionId)
      : null;

    return {
      accessMode: survey.accessMode,
      publicSlug: survey.publicSlug,
      publicUrl: `${env.appBaseUrl}/s/${survey.publicSlug}`,
      surveyId: survey.id,
      title: version?.title ?? null
    };
  }

  public async updateSurveyMetadata(input: UpdateSurveyMetadataInput, userId: string): Promise<Survey> {
    const survey = await this.requireSurvey(input.surveyId);
    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyEditPermission(membership);
    return this.surveyRepository.updateSurveyMetadata(input);
  }

  public async updateDraftVersion(
    input: UpdateDraftVersionInput,
    surveyId: string,
    userId: string
  ): Promise<SurveyVersion> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const defaultSettings = defaultSurveyVersionSettings();

    return this.surveyRepository.updateDraftVersion({
      changeSummary: input.changeSummary,
      description: input.description,
      settings: {
        ...defaultSettings,
        ...input.settings,
        theme: {
          ...defaultSettings.theme,
          ...((input.settings.theme ?? {}) as SurveyVersionSettings["theme"])
        }
      },
      surveyVersionId: context.draftVersion.id,
      title: input.title
    });
  }

  public async createDraftFromPublishedVersion(
    surveyId: string,
    userId: string,
    changeSummary: string | null
  ): Promise<SurveyVersion> {
    const survey = await this.requireSurvey(surveyId);
    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyEditPermission(membership);

    if (survey.currentDraftVersionId) {
      const existingDraft = await this.surveyRepository.findDraftVersion(survey.id);

      if (!existingDraft) {
        throw new AppError(ERROR_CODES.draftNotFound, "Draft pointer exists but draft record is missing.", 404);
      }

      return existingDraft;
    }

    if (!survey.publishedVersionId) {
      throw new AppError(
        ERROR_CODES.surveyNotPublished,
        "Only published surveys can be cloned into a new draft.",
        400
      );
    }

    return this.surveyRepository.createDraftFromPublishedVersion({
      changeSummary,
      createdBy: userId,
      surveyId
    });
  }

  public async discardDraft(surveyId: string, userId: string): Promise<void> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    await this.surveyRepository.archiveDraft(context.survey.id, context.draftVersion.id);
  }

  public async publishDraft(surveyId: string, userId: string): Promise<SurveyVersion> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    this.organizationService.requireSurveyPublishPermission(context.membership);

    const definition = await this.surveyRepository.getVersionDefinition(context.draftVersion.id);

    if (!definition) {
      throw new AppError(ERROR_CODES.versionNotFound, "Draft version definition was not found.", 404);
    }

    const validation = validateDraftForPublishing(definition);

    if (!validation.isValid) {
      throw new AppError(
        ERROR_CODES.invalidSurveyStructure,
        "The draft survey is not ready to publish.",
        400,
        validation.errors
      );
    }

    return this.surveyRepository.publishDraft({
      publishedBy: userId,
      surveyId,
      versionId: context.draftVersion.id
    });
  }

  public async closeSurvey(surveyId: string, userId: string): Promise<Survey> {
    const survey = await this.requireSurvey(surveyId);
    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyLifecyclePermission(membership);

    if (survey.status === "closed") {
      throw new AppError(ERROR_CODES.surveyAlreadyClosed, "The survey is already closed.", 400);
    }

    return this.surveyRepository.closeSurvey({ surveyId, updatedBy: userId });
  }

  public async reopenSurvey(surveyId: string, userId: string): Promise<Survey> {
    const survey = await this.requireSurvey(surveyId);
    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyLifecyclePermission(membership);

    if (!survey.publishedVersionId) {
      throw new AppError(ERROR_CODES.surveyNotPublished, "Only published surveys can be reopened.", 400);
    }

    return this.surveyRepository.reopenSurvey({ surveyId, updatedBy: userId });
  }

  public async listVersions(surveyId: string, userId: string): Promise<SurveyVersion[]> {
    const survey = await this.getSurvey(surveyId, userId);
    return this.surveyRepository.listVersions(survey.id);
  }

  public async getVersion(surveyId: string, versionId: string, userId: string) {
    const survey = await this.getSurvey(surveyId, userId);
    const version = await this.surveyRepository.findVersionById(survey.id, versionId);

    if (!version) {
      throw new AppError(ERROR_CODES.versionNotFound, "Survey version was not found.", 404);
    }

    return this.surveyRepository.getVersionDefinition(version.id);
  }

  public async compareVersions(
    surveyId: string,
    fromVersionId: string,
    toVersionId: string,
    userId: string
  ) {
    await this.getSurvey(surveyId, userId);
    const [fromDefinition, toDefinition] = await Promise.all([
      this.surveyRepository.getVersionDefinition(fromVersionId),
      this.surveyRepository.getVersionDefinition(toVersionId)
    ]);

    if (!fromDefinition || !toDefinition) {
      throw new AppError(
        ERROR_CODES.versionComparisonInvalid,
        "Both versions must exist to compare them.",
        400
      );
    }

    return compareSurveyVersions(fromDefinition, toDefinition);
  }

  public async createSection(input: CreateSectionInput, surveyId: string, userId: string): Promise<SurveySection> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    return this.surveyRepository.createSection({
      ...input,
      surveyVersionId: context.draftVersion.id
    });
  }

  public async updateSection(input: UpdateSectionInput, surveyId: string, userId: string): Promise<SurveySection> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const section = await this.surveyRepository.findSectionById(input.sectionId);

    if (!section) {
      throw new AppError(ERROR_CODES.sectionNotFound, "Section was not found.", 404);
    }

    if (section.surveyVersionId !== context.draftVersion.id) {
      throw new AppError(ERROR_CODES.publishedVersionImmutable, "Only the current draft may be edited.", 409);
    }

    return this.surveyRepository.updateSection(input);
  }

  public async deleteSection(input: DeleteSectionInput, surveyId: string, userId: string): Promise<void> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const section = await this.surveyRepository.findSectionById(input.sectionId);

    if (!section) {
      throw new AppError(ERROR_CODES.sectionNotFound, "Section was not found.", 404);
    }

    if (section.surveyVersionId !== context.draftVersion.id) {
      throw new AppError(ERROR_CODES.publishedVersionImmutable, "Only the current draft may be edited.", 409);
    }

    await this.surveyRepository.deleteSection(input);
  }

  public async reorderSections(
    input: ReorderSectionsInput,
    surveyId: string,
    userId: string
  ): Promise<SurveySection[]> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const sections = await this.surveyRepository.listSectionsByVersion(context.draftVersion.id);
    this.assertExactReorderSet(
      sections.map((section) => section.id),
      input.items.map((item) => item.sectionId),
      "sections"
    );
    return this.surveyRepository.reorderSections({ ...input, surveyVersionId: context.draftVersion.id });
  }

  public async createQuestion(
    input: CreateQuestionInput,
    surveyId: string,
    userId: string
  ): Promise<Question> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const section = await this.surveyRepository.findSectionById(input.sectionId);

    if (!section) {
      throw new AppError(ERROR_CODES.sectionNotFound, "Section was not found.", 404);
    }

    if (section.surveyVersionId !== context.draftVersion.id) {
      throw new AppError(ERROR_CODES.surveyNotEditable, "The section does not belong to the editable draft.", 409);
    }

    this.validateQuestionOptions(input.questionType, input.options);
    return this.surveyRepository.createQuestion({
      ...input,
      surveyVersionId: context.draftVersion.id
    });
  }

  public async updateQuestion(
    input: UpdateQuestionInput,
    surveyId: string,
    userId: string
  ): Promise<Question> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const question = await this.surveyRepository.findQuestionById(input.questionId);

    if (!question) {
      throw new AppError(ERROR_CODES.questionNotFound, "Question was not found.", 404);
    }

    if (question.surveyVersionId !== context.draftVersion.id) {
      throw new AppError(ERROR_CODES.publishedVersionImmutable, "Only the current draft may be edited.", 409);
    }

    const existingOptions = await this.surveyRepository.listOptionsByQuestion(question.id);

    if (!questionSupportsOptions(input.questionType) && existingOptions.length > 0 && !input.confirmRemoveOptions) {
      throw new AppError(
        ERROR_CODES.invalidSurveyStructure,
        "Changing this question type would remove existing options. Set confirmRemoveOptions to true to continue.",
        400
      );
    }

    if (!questionSupportsOptions(input.questionType) && existingOptions.length > 0 && input.confirmRemoveOptions) {
      for (const option of existingOptions) {
        await this.surveyRepository.deleteOption({ optionId: option.id });
      }
    }

    return this.surveyRepository.updateQuestion(input);
  }

  public async deleteQuestion(input: DeleteQuestionInput, surveyId: string, userId: string): Promise<void> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const question = await this.surveyRepository.findQuestionById(input.questionId);

    if (!question) {
      throw new AppError(ERROR_CODES.questionNotFound, "Question was not found.", 404);
    }

    if (question.surveyVersionId !== context.draftVersion.id) {
      throw new AppError(ERROR_CODES.publishedVersionImmutable, "Only the current draft may be edited.", 409);
    }

    await this.surveyRepository.deleteQuestion(input);
  }

  public async reorderQuestions(
    input: ReorderQuestionsInput,
    surveyId: string,
    userId: string
  ): Promise<Question[]> {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const section = await this.surveyRepository.findSectionById(input.sectionId);

    if (!section || section.surveyVersionId !== context.draftVersion.id) {
      throw new AppError(ERROR_CODES.sectionNotFound, "Section was not found in the current draft.", 404);
    }

    const allQuestions = await this.surveyRepository.listQuestionsByVersion(context.draftVersion.id);
    const sectionQuestions = allQuestions.filter((question) => question.sectionId === input.sectionId);
    this.assertExactReorderSet(
      sectionQuestions.map((question) => question.id),
      input.items.map((item) => item.questionId),
      "questions"
    );
    return this.surveyRepository.reorderQuestions(input);
  }

  public async createOption(input: CreateOptionInput, surveyId: string, userId: string) {
    const context = await this.getEditableDraftContext(surveyId, userId);
    const question = await this.surveyRepository.findQuestionById(input.questionId);

    if (!question) {
      throw new AppError(ERROR_CODES.questionNotFound, "Question was not found.", 404);
    }

    if (question.surveyVersionId !== context.draftVersion.id) {
      throw new AppError(ERROR_CODES.publishedVersionImmutable, "Only the current draft may be edited.", 409);
    }

    if (!questionSupportsOptions(question.type)) {
      throw new AppError(ERROR_CODES.invalidSurveyStructure, "This question type does not support options.", 400);
    }

    return this.surveyRepository.createOption(input);
  }

  public async updateOption(input: UpdateOptionInput, surveyId: string, userId: string) {
    await this.getEditableDraftContext(surveyId, userId);
    const option = await this.surveyRepository.findOptionById(input.optionId);

    if (!option) {
      throw new AppError(ERROR_CODES.optionNotFound, "Option was not found.", 404);
    }

    const question = await this.surveyRepository.findQuestionById(option.questionId);

    if (!question) {
      throw new AppError(ERROR_CODES.questionNotFound, "Question was not found.", 404);
    }

    if (!questionSupportsOptions(question.type)) {
      throw new AppError(ERROR_CODES.invalidSurveyStructure, "This question type does not support options.", 400);
    }

    return this.surveyRepository.updateOption(input);
  }

  public async deleteOption(input: DeleteOptionInput, surveyId: string, userId: string): Promise<void> {
    await this.getEditableDraftContext(surveyId, userId);
    const option = await this.surveyRepository.findOptionById(input.optionId);

    if (!option) {
      throw new AppError(ERROR_CODES.optionNotFound, "Option was not found.", 404);
    }

    await this.surveyRepository.deleteOption(input);
  }

  public async reorderOptions(input: ReorderOptionsInput, surveyId: string, userId: string) {
    await this.getEditableDraftContext(surveyId, userId);
    const question = await this.surveyRepository.findQuestionById(input.questionId);

    if (!question) {
      throw new AppError(ERROR_CODES.questionNotFound, "Question was not found.", 404);
    }

    const options = await this.surveyRepository.listOptionsByQuestion(input.questionId);
    this.assertExactReorderSet(
      options.map((option) => option.id),
      input.items.map((item) => item.optionId),
      "options"
    );
    return this.surveyRepository.reorderOptions(input);
  }

  private async requireSurvey(surveyId: string): Promise<Survey> {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    return survey;
  }

  private async getEditableDraftContext(surveyId: string, userId: string): Promise<EditableDraftContext> {
    const survey = await this.requireSurvey(surveyId);
    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyEditPermission(membership);

    if (!survey.currentDraftVersionId) {
      throw new AppError(ERROR_CODES.draftNotFound, "This survey does not have an active draft.", 404);
    }

    const draftVersion = await this.surveyRepository.findDraftVersion(survey.id);

    if (!draftVersion || draftVersion.id !== survey.currentDraftVersionId) {
      throw new AppError(ERROR_CODES.draftNotFound, "The active draft was not found.", 404);
    }

    // Respondents must continue using the published version while admins edit
    // the draft. That separation is why all mutations are forced through the
    // current draft pointer rather than any arbitrary version ID.
    return {
      draftVersion,
      membership,
      survey
    };
  }

  private validateQuestionOptions(
    questionType: Question["type"],
    options: Array<Omit<CreateOptionInput, "questionId">>
  ): void {
    if (questionSupportsOptions(questionType) && options.length < 2) {
      throw new AppError(
        ERROR_CODES.invalidSurveyStructure,
        "Choice questions must include at least two options.",
        400
      );
    }

    if (!questionSupportsOptions(questionType) && options.length > 0) {
      throw new AppError(
        ERROR_CODES.invalidSurveyStructure,
        "This question type does not support options.",
        400
      );
    }
  }

  private assertExactReorderSet(
    expectedIds: string[],
    receivedIds: string[],
    entityName: string
  ): void {
    const expectedSet = new Set(expectedIds);
    const receivedSet = new Set(receivedIds);

    if (receivedIds.length !== receivedSet.size) {
      throw new AppError(ERROR_CODES.validationError, `Duplicate ${entityName} were provided.`, 400);
    }

    if (expectedSet.size !== receivedSet.size) {
      throw new AppError(
        ERROR_CODES.validationError,
        `Reordering ${entityName} requires the full current list.`,
        400
      );
    }

    for (const id of expectedSet) {
      if (!receivedSet.has(id)) {
        throw new AppError(
          ERROR_CODES.validationError,
          `Reordering ${entityName} requires the full current list.`,
          400
        );
      }
    }
  }
}
