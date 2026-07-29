import type { SurveyVersionDefinition } from "../surveys/survey.types";

export class SurveyVisibilityService {
  public resolve(definition: SurveyVersionDefinition, scores: Array<{ calculatedScoreId: string; thresholdMatched: boolean | null }>) {
    const matchedQuestionTargets = new Set<string>();
    const matchedSectionTargets = new Set<string>();
    const targetedQuestionIds = new Set<string>();
    const targetedSectionIds = new Set<string>();
    const scoreMap = new Map(scores.map((score) => [score.calculatedScoreId, score.thresholdMatched]));

    for (const score of definition.calculatedScores) {
      for (const target of score.targets) {
        if (target.targetType === "question") {
          targetedQuestionIds.add(target.targetId);
          if (scoreMap.get(score.id) === true) {
            matchedQuestionTargets.add(target.targetId);
          }
        }

        if (target.targetType === "section") {
          targetedSectionIds.add(target.targetId);
          if (scoreMap.get(score.id) === true) {
            matchedSectionTargets.add(target.targetId);
          }
        }
      }
    }

    const hiddenQuestionIds = new Set<string>();

    for (const question of definition.questions) {
      if (targetedQuestionIds.has(question.id) && !matchedQuestionTargets.has(question.id)) {
        hiddenQuestionIds.add(question.id);
      }

      if (targetedSectionIds.has(question.sectionId) && !matchedSectionTargets.has(question.sectionId)) {
        hiddenQuestionIds.add(question.id);
      }
    }

    return {
      hiddenQuestionIds: [...hiddenQuestionIds],
      visibleQuestionIds: definition.questions
        .filter((question) => !hiddenQuestionIds.has(question.id))
        .map((question) => question.id)
    };
  }
}
