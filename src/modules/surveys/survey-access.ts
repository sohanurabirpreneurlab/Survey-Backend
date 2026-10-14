import type { Question, SurveyVersionDefinition } from "./survey.types";

export const SURVEY_ACCESS_ROLES = ["admin", "business_owner", "super_admin"] as const;
export type SurveyAccessRole = (typeof SURVEY_ACCESS_ROLES)[number];

export const isSurveyAccessRole = (value: unknown): value is SurveyAccessRole =>
  typeof value === "string" && (SURVEY_ACCESS_ROLES as readonly string[]).includes(value);

export const getQuestionAccessRoles = (question: Question): SurveyAccessRole[] => {
  const access = question.settings?.access;
  const roles = access && typeof access === "object" && !Array.isArray(access)
    ? (access as { roles?: unknown }).roles
    : undefined;

  return Array.isArray(roles) ? roles.filter(isSurveyAccessRole) : [];
};

export const getRoleFromMetadata = (metadata: Record<string, unknown> | null | undefined): SurveyAccessRole | null => {
  const role = metadata?.userRole;
  return isSurveyAccessRole(role) ? role : null;
};

export const canAccessQuestion = (question: Question, role: SurveyAccessRole | null): boolean => {
  const roles = getQuestionAccessRoles(question);
  return roles.length === 0 || (role !== null && roles.includes(role));
};

export const filterDefinitionForRole = (
  definition: SurveyVersionDefinition,
  role: SurveyAccessRole | null
): SurveyVersionDefinition => {
  const questions = definition.questions.filter((question) => canAccessQuestion(question, role));
  const questionIds = new Set(questions.map((question) => question.id));

  return {
    ...definition,
    questions,
    options: definition.options.filter((option) => questionIds.has(option.questionId)),
    calculatedScores: definition.calculatedScores.map((score) => ({
      ...score,
      questions: score.questions.filter((question) => questionIds.has(question.questionId))
    }))
  };
};
