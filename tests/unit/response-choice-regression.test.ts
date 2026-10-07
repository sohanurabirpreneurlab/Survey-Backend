import assert from "node:assert/strict";
import test from "node:test";
import { formatAnswerValue } from "../../src/modules/survey-tracking/survey-tracking.service";
import { ResponseRepository } from "../../src/modules/responses/response.repository";
import type { PreparedAnswerInput } from "../../src/modules/responses/response.types";
import type { QuestionOption } from "../../src/modules/surveys/survey.types";

const answer = {
  optionIds: ["option-1"], questionId: "question-1", questionStableKey: "stable-1",
  valueBoolean: null, valueDate: null, valueJson: null,
  valueNumber: null, valueText: null, valueTimestamp: null
};
const options = [{ id: "option-1", label: "Daily" }] as QuestionOption[];

for (const type of ["single_choice", "vote"]) {
  test(`${type} displays the saved choice even when valueText is null`, () => {
    assert.equal(formatAnswerValue(type, answer, options), "Daily");
    assert.equal(formatAnswerValue(type, { ...answer, optionIds: [] }, options), "No answer");
    assert.equal(formatAnswerValue(type, { ...answer, optionIds: ["removed-option"] }, options), "removed-option");
    assert.equal(formatAnswerValue(type, { ...answer, valueJson: { otherText: "Details" } }, options), "Daily — Details");
  });
}

test("bulk save replaces choices in a constant number of queries and preserves typed answers", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: calls.length === 1 ? [
        { id: "answer-1", question_id: "question-1" },
        { id: "answer-2", question_id: "question-2" }
      ] : [] };
    },
    release: () => {}
  };
  const prepared: PreparedAnswerInput[] = [
    { ...answer, scoreSnapshot: 3 },
    { ...answer, questionId: "question-2", optionIds: ["option-2", "option-3"], valueJson: { otherText: "More" }, scoreSnapshot: null }
  ];
  // Exercise the repository's batch writer without opening a real database connection.
  const repository = new ResponseRepository() as unknown as {
    upsertPreparedAnswers: (client: typeof client, responseId: string, answers: PreparedAnswerInput[]) => Promise<void>;
  };
  await repository.upsertPreparedAnswers(client, "response-1", prepared);
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(String(calls[0].values?.[1])), prepared);
  assert.deepEqual(calls[1].values, [["answer-1", "answer-2"]]);
  assert.deepEqual(JSON.parse(String(calls[2].values?.[0])), [
    { answer_id: "answer-1", option_id: "option-1" },
    { answer_id: "answer-2", option_id: "option-2" },
    { answer_id: "answer-2", option_id: "option-3" }
  ]);
  calls.length = 0;
  await repository.upsertPreparedAnswers(client, "response-1", []);
  assert.equal(calls.length, 0);
});
