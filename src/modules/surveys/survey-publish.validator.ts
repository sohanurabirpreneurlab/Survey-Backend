import type { Question, QuestionOption, SurveySection, SurveyVersionDefinition } from "./survey.types";

type ValidationIssue = {
  field: string;
  message: string;
};

export type PublishValidationResult = {
  errors: ValidationIssue[];
  isValid: boolean;
};

const validateUniquePositions = (
  items: Array<{ position: number }>,
  field: string,
  errors: ValidationIssue[]
): void => {
  const seen = new Set<number>();

  for (const item of items) {
    if (item.position < 0) {
      errors.push({ field, message: "Positions must be zero or greater." });
    }

    if (seen.has(item.position)) {
      errors.push({ field, message: "Positions must be unique." });
      continue;
    }

    seen.add(item.position);
  }
};

const validateOptions = (
  question: Question,
  options: QuestionOption[],
  errors: ValidationIssue[]
): void => {
  const optionValues = new Set<string>();
  validateUniquePositions(options, `question:${question.id}:options`, errors);

  for (const option of options) {
    if (optionValues.has(option.value)) {
      errors.push({
        field: `question:${question.id}:options`,
        message: "Option values must be unique within a question."
      });
    }

    optionValues.add(option.value);
  }

  if (["single_choice", "multiple_choice", "vote", "yes_no"].includes(question.type) && options.length < 2) {
    errors.push({
      field: `question:${question.id}:options`,
      message: "Choice questions must have at least two options."
    });
  }
};

export const validateDraftForPublishing = (
  definition: SurveyVersionDefinition
): PublishValidationResult => {
  const errors: ValidationIssue[] = [];
  const sectionsById = new Map<string, SurveySection>();
  const questionStableKeys = new Set<string>();

  if (!definition.version.title.trim()) {
    errors.push({ field: "title", message: "Title is required." });
  }

  if (definition.sections.length === 0) {
    errors.push({ field: "sections", message: "At least one section is required." });
  }

  if (definition.questions.length === 0) {
    errors.push({ field: "questions", message: "At least one question is required." });
  }

  validateUniquePositions(definition.sections, "sections", errors);

  for (const section of definition.sections) {
    sectionsById.set(section.id, section);
  }

  const questionsBySection = new Map<string, Question[]>();

  for (const question of definition.questions) {
    questionStableKeys.add(question.stableKey);

    if (!sectionsById.has(question.sectionId)) {
      errors.push({
        field: `question:${question.id}:sectionId`,
        message: "Every question must belong to a valid section."
      });
    }

    const questions = questionsBySection.get(question.sectionId) ?? [];
    questions.push(question);
    questionsBySection.set(question.sectionId, questions);
  }

  for (const questions of questionsBySection.values()) {
    validateUniquePositions(questions, "questions", errors);
  }

  for (const question of definition.questions) {
    const options = definition.options.filter((option) => option.questionId === question.id);
    validateOptions(question, options, errors);

    for (const condition of question.displayLogic.conditions ?? []) {
      if (!questionStableKeys.has(condition.questionStableKey)) {
        errors.push({
          field: `question:${question.id}:displayLogic`,
          message: "Display logic references a missing question stable key."
        });
      }

      if (condition.questionStableKey === question.stableKey) {
        errors.push({
          field: `question:${question.id}:displayLogic`,
          message: "A question cannot depend on itself in display logic."
        });
      }
    }
  }

  return {
    errors,
    isValid: errors.length === 0
  };
};
