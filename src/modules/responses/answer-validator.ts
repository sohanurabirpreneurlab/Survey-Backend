import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import type { Question, QuestionOption } from "../surveys/survey.types";

export const validateAnswerValue = (
  question: Question,
  optionIds: string[],
  options: QuestionOption[],
  value: unknown
): {
  optionIds: string[];
  valueBoolean: boolean | null;
  valueJson: unknown;
  valueNumber: number | null;
  valueText: string | null;
  valueTimestamp: string | null;
} => {
  const optionIdSet = new Set(options.map((option) => option.id));

  for (const optionId of optionIds) {
    if (!optionIdSet.has(optionId)) {
      throw new AppError(ERROR_CODES.optionNotFound, "Option does not belong to the question.", 400);
    }
  }

  switch (question.type) {
    case "short_text":
    case "long_text": {
      if (typeof value !== "string") {
        throw new AppError(ERROR_CODES.answerInvalid, "Text answer must be a string.", 400);
      }

      return {
        optionIds: [],
        valueBoolean: null,
        valueJson: null,
        valueNumber: null,
        valueText: value,
        valueTimestamp: null
      };
    }
    case "rating": {
      if (typeof value !== "number") {
        throw new AppError(ERROR_CODES.answerInvalid, "Rating answer must be a number.", 400);
      }

      return {
        optionIds: [],
        valueBoolean: null,
        valueJson: null,
        valueNumber: value,
        valueText: null,
        valueTimestamp: null
      };
    }
    case "yes_no": {
      if (typeof value !== "boolean") {
        throw new AppError(ERROR_CODES.answerInvalid, "Yes/no answer must be a boolean.", 400);
      }

      return {
        optionIds: [],
        valueBoolean: value,
        valueJson: null,
        valueNumber: null,
        valueText: null,
        valueTimestamp: null
      };
    }
    case "single_choice":
    case "vote": {
      const normalizedOptionIds =
        typeof value === "string" ? [value] : Array.isArray(value) ? value.map(String) : optionIds;

      if (normalizedOptionIds.length !== 1) {
        throw new AppError(ERROR_CODES.answerInvalid, "Exactly one option must be selected.", 400);
      }

      return {
        optionIds: normalizedOptionIds,
        valueBoolean: null,
        valueJson: null,
        valueNumber: null,
        valueText: null,
        valueTimestamp: null
      };
    }
    case "multiple_choice": {
      const normalizedOptionIds =
        Array.isArray(value) ? value.map(String) : optionIds;

      if (normalizedOptionIds.length === 0) {
        throw new AppError(ERROR_CODES.answerInvalid, "At least one option must be selected.", 400);
      }

      return {
        optionIds: normalizedOptionIds,
        valueBoolean: null,
        valueJson: null,
        valueNumber: null,
        valueText: null,
        valueTimestamp: null
      };
    }
    default:
      throw new AppError(ERROR_CODES.answerInvalid, "Unsupported question type.", 400);
  }
};
