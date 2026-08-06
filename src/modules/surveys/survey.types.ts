import type { PaginatedResult } from "../../common/utils/pagination";

export const SURVEY_STATUSES = ["draft", "published", "closed", "archived"] as const;
export const SURVEY_VERSION_STATUSES = ["draft", "published", "archived"] as const;
export const SURVEY_ACCESS_MODES = [
  "public",
  "invite_only",
  "authenticated",
  "organization_only"
] as const;
export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "yes_no",
  "rating",
  "vote"
] as const;

export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
export type SurveyVersionStatus = (typeof SURVEY_VERSION_STATUSES)[number];
export type SurveyAccessMode = (typeof SURVEY_ACCESS_MODES)[number];
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type SurveyVersionSettings = {
  showProgressBar: boolean;
  showQuestionNumbers: boolean;
  oneQuestionPerPage: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowBackNavigation: boolean;
  showConfirmationPage: boolean;
  confirmationMessage: string;
  redirectUrl: string | null;
  theme: {
    primaryColor: string | null;
    logoUrl: string | null;
  };
};

export type Survey = {
  id: string;
  organizationId: string;
  slug: string;
  publicSlug: string;
  status: SurveyStatus;
  accessMode: SurveyAccessMode;
  currentDraftVersionId: string | null;
  publishedVersionId: string | null;
  opensAt: string | null;
  closesAt: string | null;
  responseLimit: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SurveyAccessInfo = {
  canEdit: boolean;
  canRead: boolean;
  isCrossOrganizationPreview: boolean;
  message: string | null;
  reason: "admin" | "organization_edit" | "organization_read_only" | "cross_organization_preview";
};

export type SurveyWithAccess = Survey & {
  access: SurveyAccessInfo;
};

export type SurveyVersion = {
  id: string;
  surveyId: string;
  versionNumber: number;
  status: SurveyVersionStatus;
  createdFromVersionId: string | null;
  title: string;
  description: string | null;
  settings: SurveyVersionSettings;
  changeSummary: string | null;
  createdBy: string;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

export type SurveySection = {
  id: string;
  surveyVersionId: string;
  stableKey: string;
  title: string;
  description: string | null;
  position: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type QuestionValidation =
  | { maxLength: number; minLength: number; pattern: string | null }
  | { maxLength: number; minLength: number }
  | { maximumSelections: number; minimumSelections: number }
  | { maximum: number; minimum: number; step: number }
  | Record<string, never>;

export type QuestionDisplayLogic = {
  conditions?: Array<{
    operator: string;
    questionStableKey: string;
    value: unknown;
  }>;
};

export type Question = {
  id: string;
  surveyVersionId: string;
  sectionId: string;
  stableKey: string;
  type: QuestionType;
  title: string;
  description: string | null;
  required: boolean;
  position: number;
  validation: QuestionValidation;
  displayLogic: QuestionDisplayLogic;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type QuestionOption = {
  id: string;
  questionId: string;
  scoreValue: number | null;
  stableKey: string;
  label: string;
  value: string;
  position: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export const CALCULATED_SCORE_CALCULATION_TYPES = ["average"] as const;
export const CALCULATED_SCORE_THRESHOLD_OPERATORS = [
  "less_than",
  "less_than_or_equal",
  "equal",
  "greater_than_or_equal",
  "greater_than"
] as const;
export const CALCULATED_SCORE_TARGET_TYPES = ["question", "section"] as const;

export type CalculatedScoreCalculationType = (typeof CALCULATED_SCORE_CALCULATION_TYPES)[number];
export type CalculatedScoreThresholdOperator = (typeof CALCULATED_SCORE_THRESHOLD_OPERATORS)[number];
export type CalculatedScoreTargetType = (typeof CALCULATED_SCORE_TARGET_TYPES)[number];

export type SurveyCalculatedScoreQuestion = {
  calculatedScoreId: string;
  createdAt: string;
  id: string;
  position: number;
  questionId: string;
  weight: number;
};

export type SurveyCalculatedScoreTarget = {
  calculatedScoreId: string;
  createdAt: string;
  id: string;
  targetId: string;
  targetType: CalculatedScoreTargetType;
  updatedAt: string;
};

export type SurveyCalculatedScore = {
  calculationType: CalculatedScoreCalculationType;
  createdAt: string;
  decimalPlaces: number;
  id: string;
  key: string;
  name: string;
  questions: SurveyCalculatedScoreQuestion[];
  requireAllAnswers: boolean;
  surveyVersionId: string;
  targets: SurveyCalculatedScoreTarget[];
  thresholdOperator: CalculatedScoreThresholdOperator;
  thresholdValue: number;
  updatedAt: string;
};

export type SurveyVersionDefinition = {
  calculatedScores: SurveyCalculatedScore[];
  version: SurveyVersion;
  sections: SurveySection[];
  questions: Question[];
  options: QuestionOption[];
};

export type CreateSurveyInput = {
  organizationId: string;
  slug: string;
  publicSlug?: string;
  title: string;
  description: string | null;
  accessMode: SurveyAccessMode;
  opensAt: string | null;
  closesAt: string | null;
  responseLimit: number | null;
  settings: SurveyVersionSettings;
  createdBy: string;
};

export type CreateSurveyResult = {
  survey: Survey;
  draftVersion: SurveyVersion;
};

export type SurveySummary = Survey & {
  currentDraftVersionNumber: number | null;
  description: string | null;
  publishedVersionNumber: number | null;
  submittedResponseCount: number;
  title: string | null;
  inProgressResponseCount: number;
};

export type SurveySummaryWithAccess = SurveySummary & {
  access: SurveyAccessInfo;
};

export type SurveyShareInfo = {
  accessMode: SurveyAccessMode;
  publicSlug: string;
  publicUrl: string;
  surveyId: string;
  title: string | null;
};

export type ListSurveysInput = {
  limit: number;
  organizationId?: string;
  page: number;
};

export type ListSurveysResult = PaginatedResult<SurveySummary>;

export type UpdateSurveyMetadataInput = {
  accessMode: SurveyAccessMode;
  closesAt: string | null;
  opensAt: string | null;
  responseLimit: number | null;
  slug: string;
  surveyId: string;
};

export type UpdateDraftVersionInput = {
  changeSummary: string | null;
  description: string | null;
  settings: SurveyVersionSettings;
  surveyVersionId: string;
  title: string;
};

export type CreateDraftFromPublishedVersionInput = {
  changeSummary: string | null;
  createdBy: string;
  surveyId: string;
};

export type PublishDraftInput = {
  publishedBy: string;
  surveyId: string;
  versionId: string;
};

export type UpdateSurveyLifecycleInput = {
  surveyId: string;
  updatedBy: string;
};

export type CreateSectionInput = {
  description: string | null;
  position: number;
  settings: Record<string, unknown>;
  surveyVersionId: string;
  title: string;
};

export type UpdateSectionInput = {
  description: string | null;
  position: number;
  sectionId: string;
  settings: Record<string, unknown>;
  title: string;
};

export type DeleteSectionInput = {
  sectionId: string;
};

export type ReorderSectionsInput = {
  items: Array<{ position: number; sectionId: string }>;
  surveyVersionId: string;
};

export type CreateQuestionInput = {
  description: string | null;
  displayLogic: QuestionDisplayLogic;
  options: Array<Omit<CreateOptionInput, "questionId">>;
  position: number;
  questionType: QuestionType;
  required: boolean;
  sectionId: string;
  settings: Record<string, unknown>;
  surveyVersionId: string;
  title: string;
  validation: QuestionValidation;
};

export type UpdateQuestionInput = {
  confirmRemoveOptions: boolean;
  description: string | null;
  displayLogic: QuestionDisplayLogic;
  position: number;
  questionId: string;
  questionType: QuestionType;
  required: boolean;
  settings: Record<string, unknown>;
  title: string;
  validation: QuestionValidation;
};

export type DeleteQuestionInput = {
  questionId: string;
};

export type ReorderQuestionsInput = {
  items: Array<{ position: number; questionId: string }>;
  sectionId: string;
};

export type CreateOptionInput = {
  label: string;
  position: number;
  questionId: string;
  settings: Record<string, unknown>;
  value: string;
};

export type UpdateOptionInput = {
  label: string;
  optionId: string;
  position: number;
  scoreValue: number | null;
  settings: Record<string, unknown>;
  value: string;
};

export type DeleteOptionInput = {
  optionId: string;
};

export type ReorderOptionsInput = {
  items: Array<{ optionId: string; position: number }>;
  questionId: string;
};

export type UpsertCalculatedScoreInput = {
  calculationType: CalculatedScoreCalculationType;
  decimalPlaces: number;
  key: string;
  name: string;
  requireAllAnswers: boolean;
  sourceQuestionIds: string[];
  surveyVersionId: string;
  targets: Array<{
    targetId: string;
    targetType: CalculatedScoreTargetType;
  }>;
  thresholdOperator: CalculatedScoreThresholdOperator;
  thresholdValue: number;
};

export type UpdateCalculatedScoreInput = UpsertCalculatedScoreInput & {
  calculatedScoreId: string;
};

export type BulkUpdateOptionScoresInput = {
  options: Array<{
    optionId: string;
    scoreValue: number | null;
  }>;
  questionId: string;
};
