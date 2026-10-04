import test from "node:test";
import assert from "node:assert/strict";

import { defaultSurveyVersionSettings } from "../../src/modules/surveys/survey.defaults";
import { validateDraftForPublishing } from "../../src/modules/surveys/survey-publish.validator";
import type { SurveyVersionDefinition } from "../../src/modules/surveys/survey.types";

const validDefinition = (): SurveyVersionDefinition => ({
  calculatedScores: [],
  options: [
    {
      createdAt: "",
      id: "opt-1",
      label: "Yes",
      position: 0,
      questionId: "q-1",
      scoreValue: 1,
      settings: {},
      stableKey: "opt_yes",
      updatedAt: "",
      value: "yes"
    },
    {
      createdAt: "",
      id: "opt-2",
      label: "No",
      position: 1,
      questionId: "q-1",
      scoreValue: 0,
      settings: {},
      stableKey: "opt_no",
      updatedAt: "",
      value: "no"
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
      stableKey: "q_satisfaction",
      surveyVersionId: "ver-1",
      title: "Are you satisfied?",
      type: "single_choice",
      updatedAt: "",
      validation: { maximumSelections: 1, minimumSelections: 1 }
    }
  ],
  sections: [
    {
      createdAt: "",
      description: null,
      id: "sec-1",
      position: 0,
      stableKey: "sec_work",
      settings: {},
      surveyVersionId: "ver-1",
      title: "Work",
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
    title: "Employee Feedback",
    updatedAt: "",
    versionNumber: 1
  }
});

test("validateDraftForPublishing accepts a valid draft", () => {
  const result = validateDraftForPublishing(validDefinition());
  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDraftForPublishing rejects missing options for a choice question", () => {
  const definition = validDefinition();
  definition.options = [];
  const result = validateDraftForPublishing(definition);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((error) => error.field.includes("options")));
});


test("built-in Yes/No publishes without custom option rows", () => {
  const definition = validDefinition();
  definition.questions[0].type = "yes_no";
  definition.options = [];
  assert.equal(validateDraftForPublishing(definition).isValid, true);
});
for (const type of ["single_choice", "multiple_choice", "vote"] as const) {
  test(`${type} still requires at least two custom options`, () => {
    const definition = validDefinition();
    definition.questions[0].type = type;
    definition.options = definition.options.slice(0, 1);
    assert.ok(validateDraftForPublishing(definition).errors.some((error) => error.field === "question:q-1:options"));
  });
}
