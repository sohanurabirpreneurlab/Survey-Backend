const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Model the immediate (section_id, position) constraint around real repository
// SQL. These tests do not access the configured database.
function fixture(initialRows) {
  let rows = initialRows.map((row) => ({ type: 'yes_no', settings: {}, ...row }));
  let snapshot, locked = false;
  const client = {
    release() {},
    async query(sql, values = []) {
      const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (text === 'begin') { snapshot = structuredClone(rows); return { rows: [] }; }
      if (text === 'commit') return { rows: [] };
      if (text === 'rollback') { rows = snapshot; return { rows: [] }; }
      if (text.startsWith('select id from survey_sections')) { locked = true; return { rows: [{ id: values[0] }] }; }
      if (text.startsWith('select position from questions')) return { rows: rows.filter((row) => row.section_id === values[0]).map((row) => ({ position: row.position })) };
      if (text.startsWith('select * from questions')) return { rows: rows.filter((row) => row.section_id === values[0]).sort((a, b) => a.position - b.position) };
      if (text.startsWith('update questions set position')) {
        assert.ok(locked, 'section must be locked before a reorder');
        const row = rows.find((row) => row.id === values[0] && row.section_id === values[2]);
        if (row) {
          if (rows.some((other) => other.id !== row.id && other.section_id === row.section_id && other.position === values[1])) throw new Error('questions_position_unique');
          row.position = values[1];
        }
        return { rows: [] };
      }
      if (text.startsWith('insert into questions ')) {
        assert.ok(locked, 'section must be locked before allocation');
        if (rows.some((row) => row.section_id === values[1] && row.position === values[7])) throw new Error('questions_position_unique');
        const row = { id: 'new', section_id: values[1], position: values[7], type: values[3], title: values[4] };
        rows.push(row); return { rows: [row] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    }
  };
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../src/modules/surveys/survey.repository.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require(name) {
    if (name.endsWith('/database')) return { databasePool: { query: client.query, connect: async () => client } };
    if (name.endsWith('/stable-key')) return { createStableKey: () => 'stable' };
    if (name.endsWith('/app-error')) return { AppError: Error };
    if (name.endsWith('/error-codes')) return { ERROR_CODES: {} };
    if (name.endsWith('/pagination')) return {};
    if (name.endsWith('/survey.defaults')) return { defaultSurveyVersionSettings: () => ({}) };
    throw new Error(name);
  }});
  return { repository: new exports.SurveyRepository(), getRows: () => rows };
}
for (const positions of [[0, 1], [0, 3], [1000000, 1000001]]) {
  test(`swaps positions ${positions} without violating immediate uniqueness`, async () => {
    const { repository, getRows } = fixture([
      { id: 'a', section_id: 's', position: positions[0] },
      { id: 'b', section_id: 's', position: positions[1] },
      { id: 'outside', section_id: 'other', position: 0 }
    ]);
    const result = await repository.reorderQuestions({ sectionId: 's', items: [{ questionId: 'b', position: 0 }, { questionId: 'a', position: 1 }] });
    assert.deepEqual(result.map((row) => row.id), ['b', 'a']);
    assert.equal(getRows().find((row) => row.id === 'outside').position, 0);
  });
}
for (const requested of [2, 3]) {
  test(`creates after deletion gaps with requested position ${requested}`, async () => {
    const { repository } = fixture([{ id: 'a', section_id: 's', position: 0 }, { id: 'b', section_id: 's', position: 2 }]);
    const result = await repository.createQuestion({ surveyVersionId: 'v', sectionId: 's', questionType: 'yes_no', title: 'New', required: false, position: requested, options: [], validation: {}, displayLogic: {}, settings: {} });
    assert.equal(result.position, 3);
  });
}
test('failed reorder rolls back intermediate positions', async () => {
  const { repository, getRows } = fixture([{ id: 'a', section_id: 's', position: 0 }, { id: 'b', section_id: 's', position: 1 }]);
  await assert.rejects(repository.reorderQuestions({ sectionId: 's', items: [{ questionId: 'a', position: 0 }, { questionId: 'b', position: 0 }] }), /questions_position_unique/);
  assert.deepEqual(getRows().map((row) => row.position), [0, 1]);
});
