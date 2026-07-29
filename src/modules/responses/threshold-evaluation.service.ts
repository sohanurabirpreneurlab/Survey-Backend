import type { CalculatedScoreThresholdOperator } from "../surveys/survey.types";

export const evaluateThreshold = (
  scoreValue: number | null,
  thresholdOperator: CalculatedScoreThresholdOperator,
  thresholdValue: number
): {
  calculated: boolean;
  scoreValue: number | null;
  thresholdMatched: boolean | null;
} => {
  if (scoreValue === null) {
    return {
      calculated: false,
      scoreValue: null,
      thresholdMatched: null
    };
  }

  const thresholdMatched =
    thresholdOperator === "less_than"
      ? scoreValue < thresholdValue
      : thresholdOperator === "less_than_or_equal"
        ? scoreValue <= thresholdValue
        : thresholdOperator === "equal"
          ? scoreValue === thresholdValue
          : thresholdOperator === "greater_than_or_equal"
            ? scoreValue >= thresholdValue
            : scoreValue > thresholdValue;

  return {
    calculated: true,
    scoreValue,
    thresholdMatched
  };
};
