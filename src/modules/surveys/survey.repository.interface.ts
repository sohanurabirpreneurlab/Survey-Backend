import type {
  BulkUpdateOptionScoresInput,
  CreateSurveyResult,
  CreateSurveyInput,
  DeleteOptionInput,
  DeleteQuestionInput,
  DeleteSectionInput,
  CreateDraftFromPublishedVersionInput,
  Question,
  QuestionOption,
  ReorderOptionsInput,
  ReorderQuestionsInput,
  ReorderSectionsInput,
  Survey,
  SurveyCalculatedScore,
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
  UpsertCalculatedScoreInput,
  CreateOptionInput,
  CreateQuestionInput,
  CreateSectionInput,
  ListSurveysInput,
  ListSurveysResult,
  PublishDraftInput,
  SurveyInfo,
} from "./survey.types";

export interface ISurveyRepository {
  createSurveyWithInitialDraft(input: CreateSurveyInput): Promise<CreateSurveyResult>;
  findSurveyById(surveyId: string): Promise<Survey | null>;
  findSurveyByPublicSlug(publicSlug: string): Promise<Survey | null>;
  findSurveyBySlug(organizationId: string, slug: string): Promise<Survey | null>;
  listSurveys(input: ListSurveysInput): Promise<ListSurveysResult>;
  getSurveyInfo(surveyId: string): Promise<SurveyInfo | null>;
  findDraftVersion(surveyId: string): Promise<SurveyVersion | null>;
  findPublishedVersion(surveyId: string): Promise<SurveyVersion | null>;
  findVersionById(surveyId: string, versionId: string): Promise<SurveyVersion | null>;
  listVersions(surveyId: string): Promise<SurveyVersion[]>;
  getVersionDefinition(versionId: string): Promise<SurveyVersionDefinition | null>;
  createDraftFromPublishedVersion(input: CreateDraftFromPublishedVersionInput): Promise<SurveyVersion>;
  publishDraft(input: PublishDraftInput): Promise<SurveyVersion>;
  archiveDraft(surveyId: string, versionId: string): Promise<void>;
  updateSurveyMetadata(input: UpdateSurveyMetadataInput): Promise<Survey>;
  updateDraftVersion(input: UpdateDraftVersionInput): Promise<SurveyVersion>;
  closeSurvey(input: UpdateSurveyLifecycleInput): Promise<Survey>;
  reopenSurvey(input: UpdateSurveyLifecycleInput): Promise<Survey>;
  createSection(input: CreateSectionInput): Promise<SurveySection>;
  updateSection(input: UpdateSectionInput): Promise<SurveySection>;
  deleteSection(input: DeleteSectionInput): Promise<void>;
  reorderSections(input: ReorderSectionsInput): Promise<SurveySection[]>;
  createQuestion(input: CreateQuestionInput): Promise<Question>;
  updateQuestion(input: UpdateQuestionInput): Promise<Question>;
  deleteQuestion(input: DeleteQuestionInput): Promise<void>;
  reorderQuestions(input: ReorderQuestionsInput): Promise<Question[]>;
  createOption(input: CreateOptionInput): Promise<QuestionOption>;
  updateOption(input: UpdateOptionInput): Promise<QuestionOption>;
  bulkUpdateOptionScores(input: BulkUpdateOptionScoresInput): Promise<QuestionOption[]>;
  deleteOption(input: DeleteOptionInput): Promise<void>;
  reorderOptions(input: ReorderOptionsInput): Promise<QuestionOption[]>;
  createCalculatedScore(input: UpsertCalculatedScoreInput): Promise<SurveyCalculatedScore>;
  updateCalculatedScore(input: UpdateCalculatedScoreInput): Promise<SurveyCalculatedScore>;
  deleteCalculatedScore(calculatedScoreId: string): Promise<void>;
  findCalculatedScoreById(calculatedScoreId: string): Promise<SurveyCalculatedScore | null>;
  listCalculatedScoresByVersion(versionId: string): Promise<SurveyCalculatedScore[]>;
  findSectionById(sectionId: string): Promise<SurveySection | null>;
  findQuestionById(questionId: string): Promise<Question | null>;
  findOptionById(optionId: string): Promise<QuestionOption | null>;
  listSectionsByVersion(versionId: string): Promise<SurveySection[]>;
  listQuestionsByVersion(versionId: string): Promise<Question[]>;
  listOptionsByQuestion(questionId: string): Promise<QuestionOption[]>;
  listOptionsByQuestionIds(questionIds: string[]): Promise<QuestionOption[]>;
}
