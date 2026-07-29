import assert from "node:assert/strict";
import test from "node:test";

import { evaluateThreshold } from "../../src/modules/responses/threshold-evaluation.service";

test("evaluateThreshold handles less_than", () => {
  assert.equal(evaluateThreshold(2.9, "less_than", 3).thresholdMatched, true);
  assert.equal(evaluateThreshold(3, "less_than", 3).thresholdMatched, false);
});

test("evaluateThreshold handles less_than_or_equal", () => {
  assert.equal(evaluateThreshold(3, "less_than_or_equal", 3).thresholdMatched, true);
});

test("evaluateThreshold handles equal", () => {
  assert.equal(evaluateThreshold(3, "equal", 3).thresholdMatched, true);
  assert.equal(evaluateThreshold(3.1, "equal", 3).thresholdMatched, false);
});

test("evaluateThreshold handles greater_than_or_equal", () => {
  assert.equal(evaluateThreshold(3, "greater_than_or_equal", 3).thresholdMatched, true);
});

test("evaluateThreshold handles greater_than", () => {
  assert.equal(evaluateThreshold(3.1, "greater_than", 3).thresholdMatched, true);
  assert.equal(evaluateThreshold(3, "greater_than", 3).thresholdMatched, false);
});

test("evaluateThreshold returns unresolved for missing score", () => {
  const result = evaluateThreshold(null, "equal", 3);
  assert.equal(result.calculated, false);
  assert.equal(result.scoreValue, null);
  assert.equal(result.thresholdMatched, null);
});
