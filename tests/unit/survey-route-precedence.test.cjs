const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, before, after } = require('node:test');
const express = require('express');
const ts = require('typescript');

// Exercise the real router and validators, replacing only auth, nested routers,
// and database-backed controllers. No live credentials or database are needed.
function loadTs(relativePath, resolve = require) {
  const filename = path.resolve(__dirname, '../../src', relativePath);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: resolve }, { filename });
  return exports;
}
const validators = loadTs('modules/surveys/survey.validators.ts');
const validation = loadTs('common/middleware/validate-request.ts');
const pass = (_req, _res, next) => next();
const controllers = new Proxy({}, { get: (_, name) => (_req, res) => res.json({ handler: name }) });
const { surveyRouter } = loadTs('modules/surveys/survey.routes.ts', (name) => {
  if (name.endsWith('/survey.validators')) return validators;
  if (name.endsWith('/validate-request')) return validation;
  if (name.endsWith('/survey.controller')) return controllers;
  if (name.endsWith('/authenticate-user')) return { authenticateUser: pass };
  if (name.endsWith('/require-approved-account')) return { requireApprovedAccount: pass };
  if (name.endsWith('/async-handler')) return { asyncHandler: (handler) => handler };
  if (name.endsWith('/invitation.routes')) return { invitationRouter: express.Router() };
  if (name.endsWith('/result.routes')) return { resultRouter: express.Router() };
  return require(name);
});
let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/surveys', surveyRouter);
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/surveys`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
const survey = '11111111-1111-4111-8111-111111111111';
const item = '22222222-2222-4222-8222-222222222222';
const cases = [
  { route: 'sections', id: 'sectionId', handler: 'reorderSections', extra: {} },
  { route: 'questions', id: 'questionId', handler: 'reorderQuestions', extra: { sectionId: item } },
  { route: `questions/${item}/options`, id: 'optionId', handler: 'reorderOptions', extra: {} }
];
for (const entry of cases) {
  test(`${entry.handler} reaches the reorder handler with a valid payload`, async () => {
    const result = await fetch(`${base}/${survey}/draft/${entry.route}/reorder`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry.extra, items: [{ [entry.id]: item, position: 0 }] })
    });
    const body = await result.json();
    assert.equal(result.status, 200, JSON.stringify(body));
    assert.equal(body.handler, entry.handler);
  });
  test(`${entry.handler} still rejects an invalid item ID`, async () => {
    const result = await fetch(`${base}/${survey}/draft/${entry.route}/reorder`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry.extra, items: [{ [entry.id]: 'invalid', position: 0 }] })
    });
    assert.equal(result.status, 400);
    const body = await result.json();
    assert.ok(body.error.details.some((issue) => issue.path === `items[0].${entry.id}`));
  });
}
test('section updates with an actual ID still reach updateSection', async () => {
  const result = await fetch(`${base}/${survey}/draft/sections/${item}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Section', position: 0 })
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).handler, 'updateSection');
});
