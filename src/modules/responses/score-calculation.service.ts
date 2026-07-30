import type { AnswerRecord } from "./response.types";
import { evaluateThreshold } from "./threshold-evaluation.service";
import type { Question, QuestionOption, SurveyCalculatedScore, SurveyVersionDefinition } from "../surveys/survey.types";

type CalculatedResponseScore = {
  calculated: boolean;
  calculatedScoreId: string;
  questionIdsUsed: string[];
  scoreValue: number | null;
  thresholdMatched: boolean | null;
};

const numericValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
};

const resolveAnswerNumericScore = (
  question: Question,
  answer: AnswerRecord | undefined,
  options: QuestionOption[]
): number | null => {
  if (!answer) {
    return null;
  }

  if (answer.scoreSnapshot !== null) {
    return answer.scoreSnapshot;
  }

  if (question.type === "rating") {
    const value = numericValue(answer.valueNumber);

    if (value === null) {
      return null;
    }

    const validation = question.validation as Record<string, unknown>;
    const minimum = numericValue(validation.minimum);
    const maximum = numericValue(validation.maximum);

    if ((minimum !== null && value < minimum) || (maximum !== null && value > maximum)) {
      return null;
    }

    return value;
  }

  if ((question.type === "single_choice" || question.type === "vote") && answer.optionIds.length === 1) {
    const selectedOption = options.find((option) => option.id === answer.optionIds[0]);
    return selectedOption?.scoreValue ?? null;
  }

  return null;
};

const calculateAverageScore = (
  score: SurveyCalculatedScore,
  definition: SurveyVersionDefinition,
  answerMap: Map<string, AnswerRecord>
): CalculatedResponseScore => {
  const values: number[] = [];
  const questionIdsUsed: string[] = [];

  for (const sourceQuestion of score.questions) {
    const question = definition.questions.find((item) => item.id === sourceQuestion.questionId);
    const answer = answerMap.get(sourceQuestion.questionId);
    const options = definition.options.filter((option) => option.questionId === sourceQuestion.questionId);
    const numericScore = question ? resolveAnswerNumericScore(question, answer, options) : null;

    if (numericScore === null) {
      return {
        calculated: false,
        calculatedScoreId: score.id,
        questionIdsUsed: [],
        scoreValue: null,
        thresholdMatched: null
      };
    }

    values.push(numericScore);
    questionIdsUsed.push(sourceQuestion.questionId);
  }

  if (values.length === 0) {
    return {
      calculated: false,
      calculatedScoreId: score.id,
      questionIdsUsed: [],
      scoreValue: null,
      thresholdMatched: null
    };
  }

  const scoreValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  const threshold = evaluateThreshold(scoreValue, score.thresholdOperator, score.thresholdValue);

  return {
    calculated: threshold.calculated,
    calculatedScoreId: score.id,
    questionIdsUsed,
    scoreValue: threshold.scoreValue,
    thresholdMatched: threshold.thresholdMatched
  };
};

export class ScoreCalculationService {
  public calculate(definition: SurveyVersionDefinition, answers: AnswerRecord[]): CalculatedResponseScore[] {
    const answerMap = new Map(answers.map((answer) => [answer.questionId, answer]));

    return definition.calculatedScores.map((score) => {
      if (score.calculationType === "average") {
        return calculateAverageScore(score, definition, answerMap);
      }

      return {
        calculated: false,
        calculatedScoreId: score.id,
        questionIdsUsed: [],
        scoreValue: null,
        thresholdMatched: null
      };
    });
  }
}
