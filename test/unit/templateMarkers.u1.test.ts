/**
 * U1: a `#Имя` template marker is arbitrary text that BSL replaces before running
 * the query. Apply is refused when the text around any marker would change —
 * whatever the marker stands for (source, join, condition, field list…).
 * Platform evidence: test/fixtures/platform/u1-template-markers.json.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { findChangedTemplateMarker } from '../../src/core/query/templateMarkers';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

function designerApply(text: string): { generated: string; decision: ReturnType<typeof decideApply> } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { generated: out.text, decision: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined, text) };
}

describe('U1: the text around a template marker must stay as written', () => {
  it.each([
    ['unchanged, other layout and keyword case', 'ВЫБРАТЬ * ИЗ #Таблица КАК Т', 'выбрать\n\t*\nиз\n\t#Таблица Как Т', undefined],
    ['an edit away from the markers', 'ВЫБРАТЬ Т.Код ИЗ #Таблица КАК Т ГДЕ (#Условие)', 'ВЫБРАТЬ Т.Наименование ИЗ #Таблица КАК Т ГДЕ (#Условие)', undefined],
    ['an added КАК', 'ВЫБРАТЬ * ИЗ #Таблица', 'ВЫБРАТЬ * ИЗ #Таблица КАК Таблица', '#Таблица'],
    ['removed parentheses', 'ВЫБРАТЬ 1 ИЗ Т ГДЕ Т.А = 1 И (#Условие)', 'ВЫБРАТЬ 1 ИЗ Т ГДЕ Т.А = 1 И #Условие', '#Условие'],
    ['a marker used as a qualifier', 'ВЫБРАТЬ Код ИЗ #Таблица', 'ВЫБРАТЬ #Таблица.Код ИЗ #Таблица', '#Таблица'],
    ['a lost marker', 'ВЫБРАТЬ #Поля ИЗ Т', 'ВЫБРАТЬ 1 ИЗ Т', '#Поля'],
    ['an added marker', 'ВЫБРАТЬ 1 ИЗ Т', 'ВЫБРАТЬ 1 ИЗ Т ГДЕ #Новый', undefined],
  ])('%s', (_name, original, generated, expected) => {
    expect(findChangedTemplateMarker(original, generated)).toBe(expected);
  });

  it('a # inside a string literal or a comment is not a marker', () => {
    expect(findChangedTemplateMarker('ВЫБРАТЬ "#x" КАК А // #y', 'ВЫБРАТЬ\n\t"#x" КАК А')).toBeUndefined();
    expect(findChangedTemplateMarker('ВЫБРАТЬ "#x" КАК А', 'ВЫБРАТЬ "#x" КАК Б')).toBeUndefined();
  });

  it('a generated text the lexer cannot read is refused when the original has a marker', () => {
    expect(findChangedTemplateMarker('ВЫБРАТЬ * ИЗ #Т КАК Т', 'ВЫБРАТЬ * ИЗ #Т КАК Т ГДЕ "')).toBe('#');
  });
});

describe('U1: platform fixture — a template the Designer would break is refused', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'u1-template-markers.json'), 'utf8'));
  it.each(evidence.cases.map((c: { name: string }) => [c.name, c]))('%s', (_name, c: any) => {
    const { decision } = designerApply(c.template);
    const brokenByApply = c.platform.originalSubstituted.accepted && !c.platform.designerAppliedSubstituted.accepted;
    // Every template the platform shows broken by Apply is refused; a marker that
    // already has its alias is written as before.
    if (brokenByApply) expect(decision).toMatchObject({ ok: false, kind: 'invalid' });
    if (c.name === 'U1d_marker_aliased_kept') expect(decision).toEqual({ ok: true });
  });
});

describe('U1: corpus packages with template markers', () => {
  const gold = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'corpus', 'golden.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l) as { file: string; input: string })
    .filter(g => /#[\p{L}_]/u.test(g.input));
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'u1-template-markers.json'), 'utf8'));

  it('only the packages whose marker surroundings the Designer changes are refused', () => {
    expect(gold).toHaveLength(evidence.corpusScan.packagesWithMarkers);
    const refused = gold.filter(g => {
      const open = tryOpenDesignerBatch(g.input);
      if (!open.ok) return false;
      return !designerApply(g.input).decision.ok;
    }).map(g => g.file).sort();
    expect(refused).toEqual([...evidence.corpusScan.files].sort());
  });
});
