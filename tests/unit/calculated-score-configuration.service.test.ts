import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "../../src/common/errors/app-error";
import { CalculatedScoreConfigurationService } from "../../src/modules/surveys/calculated-score-configuration.service";
import { defaultSurveyVersionSettings } from "../../src/modules/surveys/survey.defaults";
import type { SurveyVersionDefinition } from "../../src/modules/surveys/survey.types";

const buildDefinition = (): SurveyVersionDefinition => ({
  calculatedScores: [],
  options: [
    {
      createdAt: "",
      id: "opt-1",
      label: "Low",
      position: 0,
      questionId: "q-1",
      scoreValue: 1,
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
      scoreValue: 5,
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
    }
  ],
  sections: [
    {
      createdAt: "",
      description: null,
      id: "sec-1",
      position: 0,
      stableKey: "sec_main",
      surveyVersionId: "ver-1",
      title: "Main",
      updatedAt: ""
    },
    {
      createdAt: "",
      description: null,
      id: "sec-2",
      position: 1,
      stableKey: "sec_followup",
      surveyVersionId: "ver-1",
      title: "Follow-up",
      updatedAt: ""
    }
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

test("CalculatedScoreConfigurationService accepts multiple valid source questions", () => {
  const service = new CalculatedScoreConfigurationService();
  const definition = buildDefinition();

  assert.doesNotThrow(() =>
    service.validateUpsert(
      {
        calculationType: "average",
        decimalPlaces: 1,
        key: "REI",
        name: "Role Effectiveness Index",
        requireAllAnswers: true,
        sourceQuestionIds: ["q-1", "q-2"],
        surveyVersionId: "ver-1",
        targets: [{ targetId: "sec-2", targetType: "section" }],
        thresholdOperator: "less_than_or_equal",
        thresholdValue: 3
      },
      definition
    )
  );
});

test("CalculatedScoreConfigurationService rejects zero source questions", () => {
  const service = new CalculatedScoreConfigurationService();

  assert.throws(
    () =>
      service.validateUpsert(
        {
          calculationType: "average",
          decimalPlaces: 1,
          key: "REI",
          name: "Role Effectiveness Index",
          requireAllAnswers: true,
          sourceQuestionIds: [],
          surveyVersionId: "ver-1",
          targets: [],
          thresholdOperator: "less_than_or_equal",
          thresholdValue: 3
        },
        buildDefinition()
      ),
    (error: unknown) => error instanceof AppError
  );
});

test("CalculatedScoreConfigurationService rejects circular same-section follow-up targets", () => {
  const service = new CalculatedScoreConfigurationService();

  assert.throws(
    () =>
      service.validateUpsert(
        {
          calculationType: "average",
          decimalPlaces: 1,
          key: "REI",
          name: "Role Effectiveness Index",
          requireAllAnswers: true,
          sourceQuestionIds: ["q-1"],
          surveyVersionId: "ver-1",
          targets: [{ targetId: "sec-1", targetType: "section" }],
          thresholdOperator: "less_than_or_equal",
          thresholdValue: 3
        },
        buildDefinition()
      ),
    (error: unknown) => error instanceof AppError
  );
});
