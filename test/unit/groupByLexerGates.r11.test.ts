/**
 * R11 step 2: the GROUP BY rewrites of the constructor-parity mode
 * (`dropRedundantGroupDerefs.ts`) decide on code, not on text — a string literal that
 * looks like an aggregate call, a field reference, `ТОГДА <ссылка>` or a movement-kind
 * value no longer changes the GROUP BY, and literals are compared exactly.
 *
 * Seven gates: `hasAggregateCall` (former AGG_RE, three rules), the aggregate-consumer
 * check of `moveBeforePrefixGroupDerefToEnd` (former `includes`), `containsFieldRef`,
 * `derefInResultPosition`, `normExpr`, `isMovementCaseExpr`, `isMovementResultExpr`
 * (former MOVEMENT_RE). Before the change each payload below changed the GROUP BY.
 *
 * Platform (СхемаЗапроса via validate_query, SL_kza, `test/fixtures/platform/r11-group-by.json`):
 * the platform reads a neutral and a code-like literal alike (S2, S3b, S6, L1–L4), and
 * a longer field name is not a use of a shorter one (L2b). Group items are read with
 * the shared lexer, not the parser.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { substituteGroupFieldWithSelectExpr } from '../../src/core/query/dropRedundantGroupDerefs';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';
import { tokenize } from '../../src/core/query/sdblLexer';

const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'r11-group-by.json'), 'utf8'));
const platform = (name: string): { query: string; platform: string } => evidence.cases.find((c: { name: string }) => c.name === name);

const corpus = buildYamlResolver(path.join(__dirname, '../fixtures/corpus/metadata/cf'));
/** The platform database's shape: `Справочник.Контрагенты.ВалютаКонтрагента` → `Справочник.Валюты`. */
const platformShape = (() => {
  const std = (name: string): MetaTable['fields'] => [
    { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name } }] },
    { name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] },
  ];
  return buildResolverFromTables([
    { kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты', fields: [...std('Валюты'),
      { name: 'НаименованиеПолное', kind: 'attribute', types: [{ primitive: 'Строка' }] }] },
    { kind: 'Справочник', name: 'Контрагенты', fullName: 'Справочник.Контрагенты', fields: [...std('Контрагенты'),
      { name: 'ВалютаКонтрагента', kind: 'attribute', types: [{ ref: { kind: 'Справочник', name: 'Валюты' } }] }] },
  ] as MetaTable[]);
})();

const constructor = (text: string, resolver: MetadataResolver) =>
  generateBatch(parseBatch(text, resolver, { wildcardPolicy: 'constructor' }), { wildcardPolicy: 'constructor' });

/** GROUP BY lists in text order, items as code tokens; `masked` hides string literals. */
function groupItems(text: string, masked = false): string[][] {
  const toks = tokenize(text).filter(t => t.type !== 'eof');
  const word = (i: number) => (toks[i]?.type === 'keyword' || toks[i]?.type === 'ident' ? toks[i].text.toUpperCase() : '');
  const END = new Set(['ИМЕЮЩИЕ', 'УПОРЯДОЧИТЬ', 'ОБЪЕДИНИТЬ', 'ИТОГИ', 'ДЛЯ', 'ИНДЕКСИРОВАТЬ']);
  const lists: string[][] = [];
  for (let i = 0; i < toks.length; i++) {
    if (word(i) !== 'СГРУППИРОВАТЬ' || word(i + 1) !== 'ПО') continue;
    const items: string[] = [];
    let cur: string[] = [];
    let depth = 0;
    for (let j = i + 2; j < toks.length; j++) {
      const t = toks[j];
      if (t.type === 'punct' && t.value === '(') depth++;
      if (t.type === 'punct' && t.value === ')') { if (depth === 0) break; depth--; }
      if (depth === 0 && END.has(word(j))) break;
      if (depth === 0 && t.type === 'punct' && t.value === ',') { items.push(cur.join(' ')); cur = []; continue; }
      cur.push(masked && t.type === 'string' ? '"…"' : t.text);
    }
    if (cur.length) items.push(cur.join(' '));
    lists.push(items);
  }
  return lists;
}

const F = 'ИЗ Справочник.Валюты КАК Т';
const D = 'Т.ОсновнаяВалюта.Код';

describe('R11 step 2: a string literal does not steer a GROUP BY rewrite', () => {
  // [gate, template ($ = the literal), neutral literal, code-like literal]
  it.each([
    ['hasAggregateCall: dropRedundantGroupDerefs', `ВЫБРАТЬ Т.ОсновнаяВалюта, ВЫБОР КОГДА Т.Код = $ ТОГДА ${D} ИНАЧЕ "" КОНЕЦ КАК Ф, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.ОсновнаяВалюта, ${D}`, '"x"', '"СУММА("'],
    ['hasAggregateCall: moveBeforePrefixGroupDerefToEnd', `ВЫБРАТЬ Т.Код, ВЫБОР КОГДА Т.Код = $ ТОГДА ${D} ИНАЧЕ "" КОНЕЦ КАК С ${F} СГРУППИРОВАТЬ ПО Т.Код, ${D}, Т.ОсновнаяВалюта`, '"x"', '"СУММА("'],
    ['hasAggregateCall: substituteGroupFieldWithSelectExpr', `ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ Т.Код КАК Код, ВЫБОР КОГДА Т.Наименование = $ ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Наименование, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование) КАК П`, '"x"', '"СУММА("'],
    ['aggregate consumer (former includes)', `ВЫБРАТЬ Т.Код, СУММА(ВЫБОР КОГДА Т.Код = $ ТОГДА 1 ИНАЧЕ 0 КОНЕЦ) КАК С ${F} СГРУППИРОВАТЬ ПО Т.Код, ${D}, Т.ОсновнаяВалюта`, '"x"', `"${D}"`],
    ['containsFieldRef', `ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ Т.Код КАК Код, ВЫБОР КОГДА Т.Код = $ ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Наименование, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование) КАК П`, '"x"', '"Т.Наименование"'],
    ['derefInResultPosition', `ВЫБРАТЬ Т.ОсновнаяВалюта, ВЫБОР КОГДА Т.Код = $ ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Ф, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.ОсновнаяВалюта, ${D}`, '"x"', `"ТОГДА ${D}"`],
    ['isMovementCaseExpr', `ВЫБРАТЬ Т.Код, ВЫБОР КОГДА Т.Код = $ ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Вид, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО ВЫБОР КОГДА Т.Код = $ ТОГДА 1 ИНАЧЕ 0 КОНЕЦ, Т.Код`, '"x"', '"ЗНАЧЕНИЕ(ВидДвиженияНакопления.Приход)"'],
    ['isMovementResultExpr (former MOVEMENT_RE)', `ВЫБРАТЬ Т.Код, ВЫБОР КОГДА Т.Код = "1" ТОГДА $ ИНАЧЕ Т.Наименование КОНЕЦ КАК Вид, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование, ВЫБОР КОГДА Т.Код = "1" ТОГДА $ ИНАЧЕ Т.Наименование КОНЕЦ`, '"x"', '"ТОГДА ЗНАЧЕНИЕ(ВидДвиженияНакопления.Приход)"'],
  ])('%s', (_gate, template, neutral, payload) => {
    const out = (literal: string) => groupItems(constructor(template.split('$').join(literal), corpus), true);
    expect(out(payload)).toEqual(out(neutral));
  });

  it('normExpr: literals are compared exactly ("a  b" is not "a b")', () => {
    // The select CASE (with "a  b") is not the grouped one (with "a b"): the rule may
    // substitute it exactly as it does for any other different literal.
    const q = (literal: string) => `ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ Т.Код КАК Код, ВЫБОР КОГДА Т.Наименование = "a  b" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Наименование, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование, ВЫБОР КОГДА Т.Наименование = ${literal} ТОГДА 1 ИНАЧЕ 0 КОНЕЦ) КАК П`;
    expect(groupItems(constructor(q('"a b"'), corpus), true)).toEqual(groupItems(constructor(q('"a  c"'), corpus), true));
    // The same expression laid out differently is still "already grouped".
    const same = `ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ Т.Код КАК Код, ВЫБОР КОГДА Т.Наименование = "a  b" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Наименование, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование, ВЫБОР КОГДА Т.Наименование = "a  b"\n\tТОГДА 1 ИНАЧЕ 0 КОНЕЦ) КАК П`;
    expect(groupItems(constructor(same, corpus))[0]).toContain('Т . Наименование');
  });

  it('normExpr: an expression the lexer cannot read is never "the same" and never substituted', () => {
    // Parsed without the rewrites (preserve), then the rule is applied directly.
    const model = () => parseBatch(`ВЫБРАТЬ Т.Код КАК Код, ВЫБОР КОГДА Т.Наименование = "x" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Наименование, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование`)
      .members[0].members[0].model;
    const groupTexts = (m: ReturnType<typeof model>) => m.grouping!.groupFields.map(g => g.expression ?? `${g.tableId}:${g.path}`);
    // Control: a readable model gets the substitution.
    const control = model();
    substituteGroupFieldWithSelectExpr(control, corpus, true);
    expect(groupTexts(control).some(t => t.startsWith('ВЫБОР'))).toBe(true);
    // An unreadable grouped expression (unterminated literal): nothing changes.
    const grouped = model();
    grouped.grouping!.groupFields.push({ tableId: '', path: '', expression: '"не закрыт' });
    grouped.grouping!.explicitGroupCount = grouped.grouping!.groupFields.length;
    const before = groupTexts(grouped);
    substituteGroupFieldWithSelectExpr(grouped, corpus, true);
    expect(groupTexts(grouped)).toEqual(before);
    // An unreadable select CASE: not substituted either.
    const selected = model();
    const field = selected.fields.find(f => f.alias === 'Наименование')!;
    field.expression = 'ВЫБОР КОГДА Т.Наименование = "x ТОГДА 1 ИНАЧЕ 0 КОНЕЦ';
    const selectedBefore = groupTexts(selected);
    substituteGroupFieldWithSelectExpr(selected, corpus, true);
    expect(groupTexts(selected)).toEqual(selectedBefore);
  });

  it('field names still match case-sensitively (unchanged)', () => {
    const q = `ВЫБРАТЬ П.Код ИЗ (ВЫБРАТЬ Т.Код КАК Код, ВЫБОР КОГДА т.наименование = "x" ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Наименование, КОЛИЧЕСТВО(*) КАК К ${F} СГРУППИРОВАТЬ ПО Т.Код, Т.Наименование) КАК П`;
    // `т.наименование` is not `Т.Наименование` for containsFieldRef: no substitution.
    expect(groupItems(constructor(q, corpus))[0].slice(0, 2)).toEqual(['Т . Код', 'Т . Наименование']);
  });
});

describe('R11 step 2: the platform GROUP BY', () => {
  it.each(['S2_subst_literal__orig', 'S3b_movecase_lead_literal__orig', 'S6_dropcase_literal_tt__orig'])('%s: as the platform prints it', name => {
    const c = platform(name);
    const ours = groupItems(constructor(c.query, corpus));
    expect(ours[ours.length - 1]).toEqual(groupItems(c.platform).pop());
  });

  it.each([
    'L1_agg_move__neutral', 'L1_agg_move__payload', 'L2_move_ref__neutral', 'L2_move_ref__payload',
    'L3_deref_result__neutral', 'L3_deref_result__payload', 'L2b_longer_name',
  ])('%s: as the platform prints it', name => {
    const c = platform(name);
    expect(groupItems(constructor(c.query, platformShape))).toEqual(groupItems(c.platform));
  });

  // These rules differ from the platform for the neutral literal too (a rule-level
  // parity gap, R11 remaining, constructor mode only); a code-like literal no longer
  // changes them, as it does not change the platform.
  it.each(['L1_agg_drop', 'L1_agg_subst', 'L4_norm_literal'])('%s: the literal changes neither the platform nor us', name => {
    const [n, p] = [platform(`${name}__neutral`), platform(`${name}__payload`)];
    expect(groupItems(p.platform, true)).toEqual(groupItems(n.platform, true));
    expect(groupItems(constructor(p.query, platformShape), true)).toEqual(groupItems(constructor(n.query, platformShape), true));
  });
});
