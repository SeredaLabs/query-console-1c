import { describe, expect, it } from 'vitest';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const head = 'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т';
const join = 'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО';
const commentsOf = (text: string) => tokenize(text, { comments: true }).filter(t => t.type === 'comment').map(t => t.text);
const expressions = [
  '(Т.Код = Б.Код И Т.Ссылка = Б.Ссылка) // split edge\nИ Т.Код = Б.Код',
  '// split leading\n(Т.Код = Б.Код И Т.Ссылка = Б.Ссылка) И Т.Код = Б.Код',
  'Т.Код = Б.Код // trailing  ',
  '// leading\nТ.Код = Б.Код',
  'Т.Код = Б.Код // before OR\nИЛИ Т.Код = 1',
  'Т.Код = Б.Код // first\nИ // second\nТ.Ссылка = Б.Ссылка // last',
  'Т.Код // internal\n= Б.Код',
  '(// opening\nТ.Код = Б.Код // before AND\nИ Т.Ссылка = Б.Ссылка // closing\n)',
  'НЕ (Т.Код = Б.Код // nested OR\nИЛИ Т.Код = 1)',
  'Т.Код = "// string" // actual\nИЛИ Т.Код = Б.Код',
  'Т.Код // literal\n= "first\n \t// literal text\n \t\n  last"',
  'Т.Код МЕЖДУ 1 // between\nИ 2 И Т.Код = Б.Код',
  'ВЫБОР КОГДА Т.Код = Б.Код // case\nТОГДА ИСТИНА ИНАЧЕ ЛОЖЬ КОНЕЦ',
  '((Т.Код // inside parentheses\n= Б.Код))',
];
const shapes: Array<[string, (expr: string) => string]> = [
  ['top', expr => `${head} ${join} ${expr}\nГДЕ Т.Код = &А`],
  ['EOF', expr => `${head} ${join} ${expr}\n`],
  ['source', expr => `ВЫБРАТЬ П.А ИЗ (${head} ${join} ${expr}\n) КАК П`],
  ['condition', expr => `${head} ГДЕ Т.Код В (${head} ${join} ${expr}\n)`],
  ['UNION', expr => `${head} ${join} ${expr}\nОБЪЕДИНИТЬ ВСЕ ${head}`],
  ['comma source', expr => `${head} ${join} ${expr}\n, Справочник.Валюты КАК Вторая`],
  ['nested join', expr => `${head} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Ц ПО Б.Код = Ц.Код // inner\nПО ${expr}\n`],
  ['optional', expr => `${head} {${join} ${expr}\n}`],
];
for (const metadata of [false, true]) describe(`C17 JOIN (metadata=${metadata})`, () => {
  const active = metadata ? resolver : undefined;
  for (const [shape, wrap] of shapes) it.each(expressions)(`${shape}: %s`, expression => {
    const input = wrap(expression);
    const opened = tryOpenDesignerBatch(input, active);
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.error);
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
    const preview = computeBatchTextSafe(state, true);
    expect(preview.error).toBeNull();
    expect(commentsOf(preview.text!)).toEqual(commentsOf(input));
    const literals = (text: string) => tokenize(text).filter(t => t.type === 'string').map(t => t.text);
    expect(literals(preview.text!)).toEqual(literals(input));
    expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state), active)).toEqual({ ok: true });
    let output = preview.text!;
    for (let pass = 0; pass < 3; pass++) {
      output = generateBatch(parseBatch(output, active, { preserveComments: true }));
      expect(output).toBe(preview.text);
    }
    expect(commentsOf(computeBatchTextSafe(state, false).text!)).toEqual([]);
    expect(literals(computeBatchTextSafe(state, false).text!)).toEqual(literals(input));
    expect(computeBatchTextSafe(state, true).text).toBe(preview.text);
    expect(commentsOf(generateBatch(parseBatch(input, active)))).toEqual([]);
  });
  it('edge comments keep standard field comparisons editable', () => {
    const doc = parseBatch(`${head} ${join} // leading\nТ.Код = Б.Код // trailing\n`, active, { preserveComments: true });
    expect(doc.members[0].members[0].model.joins![0].conditions?.[0]).toMatchObject({ custom: false, leftPath: 'Код', rightPath: 'Код' });
  });
});
it('a JOIN comment cannot authorize malformed Apply', () => {
  const doc = parseBatch(`${head} ${join} Т.Код = = Б.Код // invalid\n`, undefined, { preserveComments: true });
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc });
  const preview = computeBatchTextSafe(state, true);
  expect(commentsOf(preview.text!)).toEqual(['// invalid']);
  expect(decideApply(preview.text, preview.error, findStaticApplyBlocker(state))).toMatchObject({ ok: false });
});

it('duplicate comments in SELECT, nested JOIN and parent JOIN keep their own occurrences', () => {
  const input = `// same
ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ Б.Код КАК Код ИЗ Справочник.Валюты КАК Б ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Ц ПО Б.Код = Ц.Код // same
) КАК П ПО Т.Код = П.Код // same
`;
  const opened = tryOpenDesignerBatch(input);
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.error);
  const output = generateBatch(opened.doc);
  expect(commentsOf(output)).toEqual(['// same', '// same', '// same']);
  expect(generateBatch(parseBatch(output, undefined, { preserveComments: true }))).toBe(output);
});
it('adding a JOIN conjunct preserves a commented OR as one conjunct', () => {
  const doc = parseBatch(`${head} ${join} Т.Код = Б.Код // OR\nИЛИ Т.Код = &А`, undefined, { preserveComments: true });
  let state = reducer(reducer(initialState(), { type: 'LOAD_BATCH', doc: JSON.parse(JSON.stringify(doc)) }), { type: 'ADD_JOIN_CONDITION', index: 0 });
  state = reducer(state, { type: 'SET_JOIN_FIELD', index: 0, condIndex: 1, side: 'left', path: 'Код' });
  state = reducer(state, { type: 'SET_JOIN_FIELD', index: 0, condIndex: 1, side: 'right', path: 'Код' });
  const output = computeBatchTextSafe(state, true).text!;
  const reopened = parseBatch(output, undefined, { preserveComments: true });
  expect(reopened.members[0].members[0].model.joins![0].conditions).toHaveLength(2);
  expect(commentsOf(output)).toEqual(['// OR']);
  expect(decideApply(output, null, findStaticApplyBlocker(state))).toEqual({ ok: true });
});
