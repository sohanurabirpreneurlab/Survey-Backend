import assert from "node:assert/strict";
import test from "node:test";

import { ScoreCalculationService } from "../../src/modules/responses/score-calculation.service";
import { SurveyVisibilityService } from "../../src/modules/responses/survey-visibility.service";
import { defaultSurveyVersionSettings } from "../../src/modules/surveys/survey.defaults";
import type { AnswerRecord, ResponseScoreRecord } from "../../src/modules/responses/response.types";
import type { SurveyVersionDefinition } from "../../src/modules/surveys/survey.types";

const buildDefinition = (): SurveyVersionDefinition => ({
  calculatedScores: [
    {
      calculationType: "average",
      createdAt: "",
      decimalPlaces: 1,
      id: "score-1",
      key: "REI",
      name: "Role Effectiveness Index",
      questions: [
        { calculatedScoreId: "score-1", createdAt: "", id: "map-1", position: 0, questionId: "q-1", weight: 1 },
        { calculatedScoreId: "score-1", createdAt: "", id: "map-2", position: 1, questionId: "q-2", weight: 1 }
      ],
      requireAllAnswers: true,
      surveyVersionId: "ver-1",
      targets: [{ calculatedScoreId: "score-1", createdAt: "", id: "target-1", targetId: "sec-2", targetType: "section", updatedAt: "" }],
      thresholdOperator: "less_than_or_equal",
      thresholdValue: 3,
      updatedAt: ""
    }
  ],
  options: [
    {
      createdAt: "",
      id: "opt-1",
      label: "Low",
      position: 0,
      questionId: "q-1",
      scoreValue: 2,
      settings: {},
      stableKey: "opt_low",
      updatedAt: "",
      value: "low"
    },
    {
      createdAt: "",
      id: "opt-2",
      label: "High",
      position: 1,
      questionId: "q-1",
      scoreValue: 4,
      settings: {},
      stableKey: "opt_high",
      updatedAt: "",
      value: "high"
    }
  ],
  questions: [
    {
      createdAt: "",
      description: null,
      displayLogic: {},
      id: "q-1",
      position: 0,
      required: true,
      sectionId: "sec-1",
      settings: {},
      stableKey: "q_one",
      surveyVersionId: "ver-1",
      title: "Question one",
      type: "single_choice",
      updatedAt: "",
      validation: {}
    },
    {
      createdAt: "",
      description: null,
      displayLogic: {},
      id: "q-2",
      position: 1,
      required: true,
      sectionId: "sec-1",
      settings: {},
      stableKey: "q_two",
      surveyVersionId: "ver-1",
      title: "Question two",
      type: "rating",
      updatedAt: "",
      validation: { minimum: 1, maximum: 5, step: 1 }
    },
    {
      createdAt: "",
      description: null,
      displayLogic: {},
      id: "q-3",
      position: 0,
      required: true,
      sectionId: "sec-2",
      settings: {},
      stableKey: "q_followup",
      surveyVersionId: "ver-1",
      title: "Follow-up",
      type: "short_text",
      updatedAt: "",
      validation: {}
    }
  ],
  sections: [
    { createdAt: "", description: null, id: "sec-1", position: 0, stableKey: "sec_main", surveyVersionId: "ver-1", title: "Main", updatedAt: "" },
    { createdAt: "", description: null, id: "sec-2", position: 1, stableKey: "sec_followup", surveyVersionId: "ver-1", title: "Follow-up", updatedAt: "" }
  ],
  version: {
    archivedAt: null,
    changeSummary: null,
    createdAt: "",
    createdBy: "user-1",
    createdFromVersionId: null,
    description: null,
    id: "ver-1",
    publishedAt: null,
    publishedBy: null,
    settings: defaultSurveyVersionSettings(),
    status: "draft",
    surveyId: "survey-1",
    title: "Survey",
    updatedAt: "",
    versionNumber: 1
  }
});

const buildAnswers = (): AnswerRecord[] => [
  {
    createdAt: "",
    id: "a-1",
    optionIds: ["opt-1"],
    questionId: "q-1",
    questionStableKey: "q_one",
    responseId: "r-1",
    scoreSnapshot: 2,
    updatedAt: "",
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
    valueNumber: null,
    valueText: null,
    valueTimestamp: null
  },
  {
    createdAt: "",
    id: "a-2",
    optionIds: [],
    questionId: "q-2",
    questionStableKey: "q_two",
    responseId: "r-1",
    scoreSnapshot: 3,
    updatedAt: "",
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
    valueNumber: 3,
    valueText: null,
    valueTimestamp: null
  }
];

test("ScoreCalculationService calculates averages with full precision", () => {
  const service = new ScoreCalculationService();
  const [result] = service.calculate(buildDefinition(), buildAnswers());

  assert.equal(result.calculated, true);
  assert.equal(result.scoreValue, 2.5);
  assert.equal(result.thresholdMatched, true);
});

test("ScoreCalculationService leaves score unresolved when requireAllAnswers is true", () => {
  const service = new ScoreCalculationService();
  const [result] = service.calculate(buildDefinition(), buildAnswers().slice(0, 1));

  assert.equal(result.calculated, false);
  assert.equal(result.scoreValue, null);
  assert.equal(result.thresholdMatched, null);
});

test("SurveyVisibilityService activates section follow-up when threshold matches", () => {
  const service = new SurveyVisibilityService();
  const visibility = service.resolve(buildDefinition(), [
    { calculatedScoreId: "score-1", responseId: "r-1", scoreValue: 2.5, thresholdMatched: true } as ResponseScoreRecord
  ]);

  assert.ok(visibility.visibleQuestionIds.includes("q-3"));
});

test("SurveyVisibilityService hides section follow-up when threshold does not match", () => {
  const service = new SurveyVisibilityService();
  const visibility = service.resolve(buildDefinition(), [
    { calculatedScoreId: "score-1", responseId: "r-1", scoreValue: 4, thresholdMatched: false } as ResponseScoreRecord
  ]);

  assert.ok(visibility.hiddenQuestionIds.includes("q-3"));
});
