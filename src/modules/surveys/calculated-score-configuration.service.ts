import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import type {
  Question,
  QuestionOption,
  SurveyCalculatedScore,
  SurveySection,
  SurveyVersionDefinition,
  UpsertCalculatedScoreInput
} from "./survey.types";

type ScoreRange = {
  maximum: number;
  minimum: number;
};

const numericValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const resolveQuestionScoreRange = (question: Question, options: QuestionOption[]): ScoreRange => {
  if (question.type === "rating") {
    const validation = question.validation as Record<string, unknown>;
    const minimum = numericValue(validation.minimum);
    const maximum = numericValue(validation.maximum);

    if (minimum === null || maximum === null) {
      throw new AppError(
        ERROR_CODES.validationError,
        `Question ${question.stableKey} cannot be used in a calculated score because its numeric range is incomplete.`,
        400
      );
    }

    return { maximum, minimum };
  }

  if (question.type === "single_choice" || question.type === "vote") {
    if (options.length === 0) {
      throw new AppError(
        ERROR_CODES.validationError,
        `Question ${question.stableKey} cannot be used in a calculated score because it has no options.`,
        400
      );
    }

    const scoreValues = options.map((option) => option.scoreValue);

    if (scoreValues.some((scoreValue) => scoreValue === null)) {
      throw new AppError(
        ERROR_CODES.optionScoreMissing,
        `All active options for question ${question.stableKey} must have numeric score values.`,
        400
      );
    }

    return {
      maximum: Math.max(...scoreValues.map((value) => Number(value))),
      minimum: Math.min(...scoreValues.map((value) => Number(value)))
    };
  }

  throw new AppError(
    ERROR_CODES.validationError,
    `Question ${question.stableKey} cannot be used in a calculated score because it does not produce a numeric value.`,
    400
  );
};

export const validateCalculatedScoresInDefinition = (definition: SurveyVersionDefinition): Array<{ field: string; message: string }> => {
  const errors: Array<{ field: string; message: string }> = [];
  const questionsById = new Map(definition.questions.map((question) => [question.id, question]));
  const sectionsById = new Map(definition.sections.map((section) => [section.id, section]));
  const optionsByQuestionId = new Map<string, QuestionOption[]>();

  for (const option of definition.options) {
    const items = optionsByQuestionId.get(option.questionId) ?? [];
    items.push(option);
    optionsByQuestionId.set(option.questionId, items);
  }

  const seenKeys = new Set<string>();

  for (const score of definition.calculatedScores) {
    if (seenKeys.has(score.key)) {
      errors.push({
        field: `calculatedScore:${score.id}:key`,
        message: `The score key ${score.key} already exists in this survey version.`
      });
    }

    seenKeys.add(score.key);

    if (score.questions.length === 0) {
      errors.push({
        field: `calculatedScore:${score.id}:questions`,
        message: "Calculated score must include at least one source question."
      });
      continue;
    }

    let expectedRange: ScoreRange | null = null;

    for (const source of score.questions) {
      const question = questionsById.get(source.questionId);

      if (!question) {
        errors.push({
          field: `calculatedScore:${score.id}:questions`,
          message: "Selected questions must belong to the same survey version as the calculated score."
        });
        continue;
      }

      try {
        const range = resolveQuestionScoreRange(question, optionsByQuestionId.get(question.id) ?? []);

        if (!expectedRange) {
          expectedRange = range;
        } else if (expectedRange.minimum !== range.minimum || expectedRange.maximum !== range.maximum) {
          errors.push({
            field: `calculatedScore:${score.id}:questions`,
            message: "Questions using incompatible score ranges cannot be averaged."
          });
        }
      } catch (error) {
        errors.push({
          field: `calculatedScore:${score.id}:questions`,
          message: error instanceof AppError ? error.message : "Invalid calculated score question."
        });
      }
    }

    for (const target of score.targets) {
      if (target.targetType === "question") {
        if (!questionsById.has(target.targetId)) {
          errors.push({
            field: `calculatedScore:${score.id}:targets`,
            message: "Follow-up target does not belong to this survey version."
          });
        }

        if (score.questions.some((question) => question.questionId === target.targetId)) {
          errors.push({
            field: `calculatedScore:${score.id}:targets`,
            message: "This configuration creates a circular dependency."
          });
        }
      }

      if (target.targetType === "section") {
        const section = sectionsById.get(target.targetId);

        if (!section) {
          errors.push({
            field: `calculatedScore:${score.id}:targets`,
            message: "Follow-up target does not belong to this survey version."
          });
          continue;
        }

        const sectionQuestionIds = definition.questions
          .filter((question) => question.sectionId === section.id)
          .map((question) => question.id);

        if (score.questions.some((question) => sectionQuestionIds.includes(question.questionId))) {
          errors.push({
            field: `calculatedScore:${score.id}:targets`,
            message: "This configuration creates a circular dependency."
          });
        }
      }
    }
  }

  return errors;
};

export class CalculatedScoreConfigurationService {
  public validateUpsert(
    input: UpsertCalculatedScoreInput,
    definition: SurveyVersionDefinition,
    existingScoreId?: string
  ): void {
    const questionsById = new Map(definition.questions.map((question) => [question.id, question]));
    const sectionsById = new Map(definition.sections.map((section) => [section.id, section]));
    const optionsByQuestionId = new Map<string, QuestionOption[]>();

    for (const option of definition.options) {
      const items = optionsByQuestionId.get(option.questionId) ?? [];
      items.push(option);
      optionsByQuestionId.set(option.questionId, items);
    }

    if (!input.name.trim()) {
      throw new AppError(ERROR_CODES.validationError, "Calculated score name is required.", 400);
    }

    if (!input.key.trim()) {
      throw new AppError(ERROR_CODES.validationError, "Calculated score key is required.", 400);
    }

    if (!Number.isFinite(input.thresholdValue)) {
      throw new AppError(ERROR_CODES.validationError, "thresholdValue must be numeric.", 400);
    }

    if (!Number.isInteger(input.decimalPlaces) || input.decimalPlaces < 0 || input.decimalPlaces > 6) {
      throw new AppError(ERROR_CODES.validationError, "decimalPlaces must be between 0 and 6.", 400);
    }

    if (input.sourceQuestionIds.length === 0) {
      throw new AppError(ERROR_CODES.validationError, "Calculated score must include at least one source question.", 400);
    }

    if (new Set(input.sourceQuestionIds).size !== input.sourceQuestionIds.length) {
      throw new AppError(ERROR_CODES.validationError, "Duplicate score-question mappings are not allowed.", 400);
    }

    const conflictingKey = definition.calculatedScores.find(
      (score) => score.key === input.key && score.id !== existingScoreId
    );

    if (conflictingKey) {
      throw new AppError(ERROR_CODES.validationError, `The score key ${input.key} already exists in this survey version.`, 409);
    }

    let expectedRange: ScoreRange | null = null;

    for (const questionId of input.sourceQuestionIds) {
      const question = questionsById.get(questionId);

      if (!question) {
        throw new AppError(
          ERROR_CODES.validationError,
          "Selected questions must belong to the same survey version as the calculated score.",
          400
        );
      }

      const range = resolveQuestionScoreRange(question, optionsByQuestionId.get(questionId) ?? []);

      if (!expectedRange) {
        expectedRange = range;
      } else if (expectedRange.minimum !== range.minimum || expectedRange.maximum !== range.maximum) {
        throw new AppError(ERROR_CODES.validationError, "Questions using incompatible score ranges cannot be averaged.", 400);
      }
    }

    for (const target of input.targets) {
      if (target.targetType === "question") {
        if (!questionsById.has(target.targetId)) {
          throw new AppError(ERROR_CODES.validationError, "Follow-up target does not belong to this survey version.", 400);
        }

        if (input.sourceQuestionIds.includes(target.targetId)) {
          throw new AppError(ERROR_CODES.circularDependencyDetected, "This configuration creates a circular dependency.", 400);
        }
      }

      if (target.targetType === "section") {
        const section: SurveySection | undefined = sectionsById.get(target.targetId);

        if (!section) {
          throw new AppError(ERROR_CODES.validationError, "Follow-up target does not belong to this survey version.", 400);
        }

        const sectionQuestionIds = definition.questions
          .filter((question) => question.sectionId === section.id)
          .map((question) => question.id);

        if (input.sourceQuestionIds.some((questionId) => sectionQuestionIds.includes(questionId))) {
          throw new AppError(ERROR_CODES.circularDependencyDetected, "This configuration creates a circular dependency.", 400);
        }
      }
    }
  }
}
