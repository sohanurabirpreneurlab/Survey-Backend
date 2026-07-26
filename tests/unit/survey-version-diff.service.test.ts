import test from "node:test";
import assert from "node:assert/strict";

import { defaultSurveyVersionSettings } from "../../src/modules/surveys/survey.defaults";
import { compareSurveyVersions } from "../../src/modules/surveys/survey-version-diff.service";
import type { SurveyVersionDefinition } from "../../src/modules/surveys/survey.types";

const buildDefinition = (required: boolean): SurveyVersionDefinition => ({
  options: [],
  questions: [
    {
      createdAt: "",
      description: null,
      displayLogic: {},
      id: required ? "q-2" : "q-1",
      position: 0,
      required,
      sectionId: "sec-1",
      settings: {},
      stableKey: "q_customer_satisfaction",
      surveyVersionId: required ? "v-2" : "v-1",
      title: "How satisfied are you?",
      type: "short_text",
      updatedAt: "",
      validation: { maxLength: 100, minLength: 2, pattern: null }
    }
  ],
  sections: [
    {
      createdAt: "",
      description: null,
      id: "sec-1",
      position: 0,
      stableKey: "sec_1",
      surveyVersionId: required ? "v-2" : "v-1",
      title: "Experience",
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
    id: required ? "v-2" : "v-1",
    publishedAt: null,
    publishedBy: null,
    settings: defaultSurveyVersionSettings(),
    status: "draft",
    surveyId: "survey-1",
    title: "Survey",
    updatedAt: "",
    versionNumber: required ? 2 : 1
  }
});

test("compareSurveyVersions detects question field changes by stable key", () => {
  const diff = compareSurveyVersions(buildDefinition(false), buildDefinition(true));
  assert.equal(diff.fromVersion, 1);
  assert.equal(diff.toVersion, 2);
  assert.equal(diff.changes.questions.modified.length, 1);
  assert.equal(diff.changes.questions.modified[0].stableKey, "q_customer_satisfaction");
  assert.ok(diff.changes.questions.modified[0].changes.some((change) => change.field === "required"));
});
