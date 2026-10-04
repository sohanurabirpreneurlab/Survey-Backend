import test from "node:test";
import assert from "node:assert/strict";
import { validateAnswerValue } from "../../src/modules/responses/answer-validator";
import type { Question } from "../../src/modules/surveys/survey.types";

const question = (settings: Record<string, unknown> = {}): Question => ({
  id: "q", surveyVersionId: "v", sectionId: "s", stableKey: "q", type: "yes_no",
  title: "Any feedback?", description: null, required: false, position: 0,
  validation: {}, displayLogic: {}, settings, createdAt: "", updatedAt: ""
});
const validate = (settings: Record<string, unknown>, value: unknown) => validateAnswerValue(question(settings), [], [], value);

test("legacy Yes and No answers retain boolean storage", () => {
  for (const answer of [true, false]) {
    const saved = validate({}, answer);
    assert.equal(saved.valueBoolean, answer);
    assert.equal(saved.valueJson, null);
  }
});

for (const mode of ["off", "yes", "no", "both"]) {
  for (const answer of [true, false]) {
    const shown = mode === "both" || (mode === "yes" && answer) || (mode === "no" && !answer);
    test(`${mode}: ${answer} stores only applicable description and enforces required`, () => {
      const settings = { descriptionWhen: mode, descriptionRequired: true };
      const saved = validate(settings, { answer, description: "  Explanation  " });
      assert.equal(saved.valueBoolean, answer);
      assert.deepEqual(saved.valueJson, shown ? { description: "Explanation" } : null);
      if (shown) {
        assert.throws(() => validate(settings, answer), /provide a description/);
        assert.throws(() => validate(settings, { answer, description: "   " }), /provide a description/);
      } else {
        assert.equal(validate(settings, answer).valueJson, null);
      }
    });
  }
}

test("optional description accepts empty values and rejects malformed or excessive text", () => {
  const settings = { descriptionWhen: "both" };
  assert.equal(validate(settings, false).valueJson, null);
  assert.equal(validate(settings, { answer: true, description: " " }).valueJson, null);
  assert.throws(() => validate(settings, { answer: true, description: 42 }), /must be text/);
  assert.throws(() => validate(settings, { answer: true, description: "x".repeat(5001) }), /5000/);
  assert.deepEqual(validate(settings, { answer: false, description: "x".repeat(5000) }).valueJson, { description: "x".repeat(5000) });
});

test("invalid answers cannot become truthy Yes answers", () => {
  for (const value of ["yes", "false", 0, 1, null, {}, { answer: "false" }, [true]]) {
    assert.throws(() => validate({}, value), /must be a boolean/);
  }
});
