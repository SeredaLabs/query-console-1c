/**
 * C16: with `preserveComments` (the production open path), user `//` comments in
 * virtual-table / accounting / selection-criterion arguments and in
 * `ПЕРИОДАМИ(…)` survive open → store → preview → Apply, exactly once, and a
 * comment never swallows a generated separator or `)`.
 *
 * field/group/TOTALS raw slices keep their former behavior: the comment is still dropped
 * (known loss, C17) and Apply is not newly blocked. Their renderers are not
 * comment-safe. WHERE/HAVING support is covered by conditionComments.c17.
 *
 * Assignment rule (stable on reopen): a comment on an argument's code line or on
 * the line of the comma after it trails that argument, and the comma is written
 * before it; an own-line comment leads the next argument with code, or trails the
 * last one before `)`.
 */
import { describe, expect, it } from 'vitest';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize } from '../../src/core/query/sdblLexer';
import { tryOpenBatch } from '../../src/core/query/validateBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const VT = 'РегистрСведений.ЦеныНоменклатуры.СрезПоследних';

function open(text: string, metadata: boolean) {
  const active = metadata ? resolver : undefined;
  const opened = tryOpenBatch(text, active, { preserveComments: true });
  if (!opened.ok) throw new Error(opened.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: opened.doc });
  const preview = computeBatchTextSafe(state, true);
  return {
    preview: preview.text,
    decision: decideApply(preview.text, preview.error, findStaticApplyBlocker(state), active),
  };
}

const commentsOf = (text: string): string[] =>
  tokenize(text, { comments: true }).filter(t => t.type === 'comment').map(t => t.text);

/** Slots whose comments are kept. The expected preview pins the comment-safe layout. */
const KEPT: Array<[string, string, string]> = [
  ['VT: last argument',
    `ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(, ИСТИНА // c1\n) КАК Т`,
    `ИЗ\n\t${VT}(\n\t\t\t,\n\t\t\tИСТИНА // c1\n\t) КАК Т`],
  ['VT: comma moves before the comment',
    `ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(&Д // c1\n, ИСТИНА) КАК Т`,
    `ИЗ\n\t${VT}(\n\t\t\t&Д, // c1\n\t\t\tИСТИНА) КАК Т`],
  ['VT: comment inside a condition',
    `ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(&Д, Номенклатура = &Н // c1\nИ ИСТИНА) КАК Т`,
    `\t\t\tНоменклатура = &Н // c1\nИ ИСТИНА) КАК Т`],
  ['VT: own-line comment is not also relocated after ИЗ',
    `ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(&Д // c1\n// c2\n, ИСТИНА // c3\n) КАК Т`,
    `ИЗ\n\t${VT}(\n\t\t\t&Д, // c1\n\t\t\t// c2\n\t\t\tИСТИНА // c3\n\t) КАК Т`],
  ['VT: comment on the comma line is the trailing comment of the argument before it',
    `ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(&Д, // c1\nИСТИНА) КАК Т`,
    `ИЗ\n\t${VT}(\n\t\t\t&Д, // c1\n\t\t\tИСТИНА) КАК Т`],
  ['VT: own-line comment after a comma leads the next argument',
    `ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(&Д,\n// c1\nИСТИНА) КАК Т`,
    `ИЗ\n\t${VT}(\n\t\t\t&Д,\n\t\t\t// c1\n\t\t\tИСТИНА) КАК Т`],
  ['VT: a comment in an omitted argument leads the next argument',
    `ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(// c1\n, ИСТИНА) КАК Т`,
    `ИЗ\n\t${VT}(\n\t\t\t,\n\t\t\t// c1\n\t\t\tИСТИНА) КАК Т`],
  ['VT in a source subquery',
    `ВЫБРАТЬ П.Период КАК П ИЗ (ВЫБРАТЬ Т.Период КАК Период ИЗ ${VT}(&Д // c1\n, ИСТИНА) КАК Т) КАК П`,
    '&Д, // c1\n\t\t\t\tИСТИНА) КАК Т) КАК П'],
  ['VT in a condition subquery',
    `ВЫБРАТЬ Х.Код КАК К ИЗ Справочник.Валюты КАК Х ГДЕ Х.Код В (ВЫБРАТЬ Т.Период ИЗ ${VT}(&Д // c1\n, ИСТИНА) КАК Т)`,
    '&Д, // c1\n\t\t\t\t\t\tИСТИНА) КАК Т)'],
  ['accounting register arguments',
    'ВЫБРАТЬ Т.Счет КАК С ИЗ РегистрБухгалтерии.Хозрасчетный.Остатки(&Д // c1\n, , , ) КАК Т',
    'РегистрБухгалтерии.Хозрасчетный.Остатки(\n\t\t\t&Д, // c1\n\t\t\t,\n\t\t\t,\n\t\t\t) КАК Т'],
  ['ПЕРИОДАМИ: middle argument',
    'ВЫБРАТЬ 1 КАК Число ИТОГИ ПО Число ПЕРИОДАМИ(Месяц, 1 // c1\n, 2)',
    'Число ПЕРИОДАМИ(МЕСЯЦ, 1, // c1\n2)'],
  ['ПЕРИОДАМИ: last argument',
    'ВЫБРАТЬ 1 КАК Число ИТОГИ ПО Число ПЕРИОДАМИ(Месяц, 1, 2 // c1\n)',
    'Число ПЕРИОДАМИ(МЕСЯЦ, 1, 2 // c1\n)'],
  ['ПЕРИОДАМИ: the unit is upper-cased, its comment is not',
    'ВЫБРАТЬ 1 КАК Число ИТОГИ ПО Число ПЕРИОДАМИ(Месяц // месяц c1\n, 1, 2)',
    'Число ПЕРИОДАМИ(МЕСЯЦ, // месяц c1\n1, 2)'],
];

/** Slots that still drop the comment (C17, step 8). Apply must not be newly blocked. */
const KNOWN_LOSS: Array<[string, string]> = [
  ['УПОРЯДОЧИТЬ ПО key',
    'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т\nУПОРЯДОЧИТЬ ПО\n\tА // c1\n'],
];

for (const metadata of [false, true]) {
  describe(`C16 kept argument comments (metadata=${metadata})`, () => {
    for (const [name, input, expected] of KEPT) {
      it(name, () => {
        const r = open(input, metadata);
        expect(r.preview).toContain(expected);
        // Each comment exactly once, verbatim, and Apply writes it.
        expect(commentsOf(r.preview!)).toEqual(commentsOf(input));
        expect(r.decision).toEqual({ ok: true });
        // Reopening the written text is stable.
        expect(open(r.preview!, metadata).preview).toBe(r.preview);
      });
    }
  });

  describe(`C17 known comment loss is unchanged and does not block Apply (metadata=${metadata})`, () => {
    for (const [name, input] of KNOWN_LOSS) {
      it(name, () => {
        const r = open(input, metadata);
        expect(r.preview).not.toContain('c1');
        expect(r.decision).toEqual({ ok: true });
      });
    }
  });

  it(`without preserveComments argument comments are stripped as before (metadata=${metadata})`, () => {
    for (const [, input] of KEPT) {
      const doc = parseBatch(input, metadata ? resolver : undefined);
      expect(commentsOf(generateBatch(doc))).toEqual([]);
    }
  });
}
