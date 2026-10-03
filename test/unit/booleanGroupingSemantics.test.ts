/**
 * Stage 1B.3 regression: parse → generate must never change boolean semantics.
 * `stripRedundantLeafParens` dropped a grouping pair whenever its neighbours were
 * predicate words — including `И`/`НЕ` — without checking the precedence of the
 * operators inside: `СрезПоследних(, (A ИЛИ B) И C)` became `A ИЛИ B И C`
 * (= `A ИЛИ (B И C)`), `НЕ (A И B)` became `НЕ A И B`. Live 1C 8.3:
 * `СрезПоследних(, (Кратность = 1 ИЛИ Кратность = 10) И Курс > 1000)` returned
 * 2 rows, our generated text 9; the query wizard keeps the parentheses.
 *
 * The check is semantic: the input condition and the generated one are parsed
 * into boolean trees (ИЛИ < И < НЕ < atom) and compared on every truth
 * assignment of their atoms — layout and redundant-paren differences are allowed.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tokenize, type Token } from '../../src/core/query/sdblLexer';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));
const MODES: Array<[string, MetadataResolver | undefined]> = [['without resolver', undefined], ['with resolver', resolver]];
const gen = (text: string, r?: MetadataResolver): string => generateBatch(parseBatch(text, r));

// ── minimal boolean evaluator (test-only) ───────────────────────────────────
type Node = { k: 'atom'; t: string } | { k: 'not'; a: Node } | { k: 'and' | 'or'; a: Node; b: Node };
const isW = (t: Token | undefined, w: string): boolean =>
  !!t && (t.type === 'ident' || t.type === 'keyword') && t.value.toUpperCase() === w;
const isP = (t: Token | undefined, p: string): boolean => !!t && t.type === 'punct' && t.value === p;

function parseBool(text: string): Node {
  const toks = tokenize(text).filter(t => t.type !== 'eof');
  let i = 0;
  const orE = (): Node => { let a = andE(); while (isW(toks[i], 'ИЛИ')) { i++; a = { k: 'or', a, b: andE() }; } return a; };
  const andE = (): Node => { let a = notE(); while (isW(toks[i], 'И')) { i++; a = { k: 'and', a, b: notE() }; } return a; };
  const notE = (): Node => (isW(toks[i], 'НЕ') ? (i++, { k: 'not', a: notE() }) : prim());
  const prim = (): Node => {
    if (isP(toks[i], '(')) {
      // A grouping pair is one whose `)` is followed by a boolean boundary.
      let d = 0, j = i;
      for (; j < toks.length; j++) { if (isP(toks[j], '(')) d++; else if (isP(toks[j], ')') && --d === 0) break; }
      const nx = toks[j + 1];
      if (!nx || isW(nx, 'И') || isW(nx, 'ИЛИ') || isP(nx, ')')) { i++; const n = orE(); i++; return n; }
    }
    // Atom: tokens up to a top-level И/ИЛИ/`)`; call parens, `В (…)` and `МЕЖДУ a И b` belong to it.
    const parts: string[] = [];
    let d = 0, between = 0;
    while (i < toks.length) {
      const x = toks[i];
      if (d === 0 && (isW(x, 'ИЛИ') || isP(x, ')'))) break;
      if (d === 0 && isW(x, 'И')) { if (between > 0) between--; else break; }
      if (isW(x, 'МЕЖДУ')) between++;
      if (isP(x, '(')) d++; else if (isP(x, ')')) d--;
      parts.push(x.text.toUpperCase());
      i++;
    }
    return { k: 'atom', t: parts.join(' ') };
  };
  const n = orE();
  if (i !== toks.length) throw new Error(`unparsed tail in ${JSON.stringify(text)}`);
  return n;
}
const atoms = (n: Node, s = new Set<string>()): Set<string> => {
  if (n.k === 'atom') s.add(n.t); else if (n.k === 'not') atoms(n.a, s); else { atoms(n.a, s); atoms(n.b, s); }
  return s;
};
const ev = (n: Node, v: Map<string, boolean>): boolean =>
  n.k === 'atom' ? v.get(n.t)! : n.k === 'not' ? !ev(n.a, v) : n.k === 'and' ? ev(n.a, v) && ev(n.b, v) : ev(n.a, v) || ev(n.b, v);
function expectSameSemantics(input: string, output: string): void {
  const a = parseBool(input), b = parseBool(output);
  const names = [...atoms(a)];
  expect([...atoms(b)].sort()).toEqual([...names].sort());
  for (let m = 0; m < 1 << names.length; m++) {
    const v = new Map(names.map((x, k) => [x, !!(m & (1 << k))]));
    if (ev(a, v) !== ev(b, v)) throw new Error(`semantics changed:\n  in:  ${input}\n  out: ${output}\n  at ${[...v].map(([x, y]) => `${x}=${+y}`).join(', ')}`);
  }
}

// ── contexts, shapes, atom variants ─────────────────────────────────────────
const RS = 'РегистрСведений.КурсыВалют';
/** Text between `start` and `end` (end omitted → to the end of the text). */
const slice = (g: string, start: RegExp, end?: RegExp): string => {
  const m = start.exec(g);
  if (!m) throw new Error(`no ${start} in ${JSON.stringify(g)}`);
  const rest = g.slice(m.index + m[0].length);
  const e = end ? end.exec(rest) : null;
  return e ? rest.slice(0, e.index) : rest;
};
const VT_ATOMS = ['Кратность = 1', 'Кратность = 10', 'Курс > 1000', 'Курс < 5'];
const Q_ATOMS = ['К.Кратность = 1', 'К.Кратность = 10', 'К.Курс > 1000', 'К.Курс < 5'];
const CONTEXTS: Array<[string, (c: string) => string, (g: string) => string, string[]]> = [
  ['VT СрезПоследних', c => `ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS}.СрезПоследних(, ${c}) КАК К`, g => slice(g, /СрезПоследних\(\s*,/u, /\) КАК К$/u), VT_ATOMS],
  ['VT with period parameter', c => `ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS}.СрезПоследних(&Дата, ${c}) КАК К`, g => slice(g, /СрезПоследних\(\s*&Дата,/u, /\) КАК К$/u), VT_ATOMS],
  ['VT inside a condition subquery',
    c => `ВЫБРАТЬ Вал.Код КАК Код ИЗ Справочник.Валюты КАК Вал ГДЕ Вал.Ссылка В (ВЫБРАТЬ К.Валюта ИЗ ${RS}.СрезПоследних(, ${c}) КАК К)`,
    g => slice(g, /СрезПоследних\(\s*,\s*/u, /\) КАК К/u), VT_ATOMS],
  ['accumulation register Остатки',
    c => `ВЫБРАТЬ О.Регистратор КАК Р ИЗ РегистрНакопления.РегистрНакопленияОст.Остатки(, ${c}) КАК О`,
    g => slice(g, /Остатки\(\s*,/u, /\) КАК О$/u), VT_ATOMS],
  ['boolean SELECT column', c => `ВЫБРАТЬ ${c} КАК Ф ИЗ ${RS} КАК К`, g => slice(g, /ВЫБРАТЬ\n\t/u, /\sКАК Ф\n/u), Q_ATOMS],
  ['WHERE', c => `ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS} КАК К ГДЕ ${c}`, g => slice(g, /\nГДЕ\n/u), Q_ATOMS],
  ['JOIN ON', c => `ВЫБРАТЬ Вал.Код КАК Код ИЗ Справочник.Валюты КАК Вал ЛЕВОЕ СОЕДИНЕНИЕ ${RS} КАК К ПО ${c}`, g => slice(g, /\n\t\tПО /u), Q_ATOMS],
  ['CASE КОГДА', c => `ВЫБРАТЬ ВЫБОР КОГДА ${c} ТОГДА 1 ИНАЧЕ 0 КОНЕЦ КАК Ф ИЗ ${RS} КАК К`, g => slice(g, /КОГДА\s/u, /\sТОГДА/u), Q_ATOMS],
];
const SHAPES = [
  '(a ИЛИ b) И c', 'a И (b ИЛИ c)', '(a ИЛИ b) И (c ИЛИ d)', '((a ИЛИ b) И c) И d', 'a И ((b ИЛИ c) И d)',
  '(a И b) И c', '(a И b) ИЛИ c', 'a ИЛИ (b И c)', '(a ИЛИ b)', '((a ИЛИ b))', '((a ИЛИ b)) И c',
  '(((a ИЛИ b) И c) ИЛИ d) И a', 'НЕ (a ИЛИ b)', 'НЕ (a И b)', 'НЕ (a ИЛИ b) И c', 'c И НЕ (a ИЛИ b)',
  'НЕ ((a ИЛИ b) И c)', '(a ИЛИ b) И c ИЛИ d', 'a ИЛИ (b ИЛИ c) И d', '(НЕ a ИЛИ b) И c',
  '(a) И (b ИЛИ c)', '(a ИЛИ b) И НЕ c', '(a ИЛИ b) И (c)', 'a И (b) ИЛИ c',
  'a И ((b ИЛИ c))', 'НЕ ((a ИЛИ b))', '(((a ИЛИ b))) И c', 'НЕ ((a ИЛИ b)) И c',
];
const VARIANTS: Array<[string, (at: string[]) => string[]]> = [
  ['literals', at => at],
  ['parameters', at => at.map((x, k) => x.replace(/\d+$/u, `&П${k}`))],
  ['МЕЖДУ … И …', at => [at[0].replace(/ = \d+$/u, ' МЕЖДУ 1 И 5'), ...at.slice(1)]],
  ['function call', at => [at[0].replace(/^(К\.)?(\S+)/u, (_m, p: string | undefined, f: string) => `ЕСТЬNULL(${p ?? ''}${f}, 0)`), ...at.slice(1)]],
];
const fill = (shape: string, at: string[]): string => shape.replace(/\b[abcd]\b/g, m => at['abcd'.indexOf(m)]);

describe.each(MODES)('boolean grouping survives parse → generate (%s)', (_mode, r) => {
  describe.each(CONTEXTS)('%s', (_name, build, extract, baseAtoms) => {
    it.each(SHAPES)('%s', (shape) => {
      for (const [, variant] of VARIANTS) {
        const cond = fill(shape, variant(baseAtoms));
        const once = gen(build(cond), r);
        expectSameSemantics(cond, extract(once));
        const twice = gen(once, r);
        expectSameSemantics(cond, extract(twice));
        // C6: every shape, including JOIN AND groups with nested ИЛИ, is a fixed point.
        expect(twice).toBe(once);
      }
    });
  });

  it('live 1C case: `(Кратность = 1 ИЛИ Кратность = 10) И Курс > 1000` keeps its grouping', () => {
    expect(gen(`ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS}.СрезПоследних(, (Кратность = 1 ИЛИ Кратность = 10) И Курс > 1000) КАК К`, r)).toBe(
      'ВЫБРАТЬ\n\tК.Валюта КАК Валюта\nИЗ\n\tРегистрСведений.КурсыВалют.СрезПоследних(\n\t\t\t,\n\t\t\t(Кратность = 1\n\t\t\t\tИЛИ Кратность = 10)\n\t\t\t\tИ Курс > 1000) КАК К',
    );
  });

  it('SELECT column: `НЕ (A И B)` is not flattened to `НЕ A И B`', () => {
    const out = gen(`ВЫБРАТЬ НЕ (К.Кратность = 1 И К.Кратность = 10) КАК Ф ИЗ ${RS} КАК К`, r);
    expect(out).toContain('\tНЕ(К.Кратность = 1 И К.Кратность = 10) КАК Ф');
  });

  it('redundant parentheses are still removed where precedence proves equivalence', () => {
    // Single comparison in a VT condition (corpus behaviour, phase 6.16.72).
    expect(gen(`ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS}.СрезПоследних(, (Валюта = &Организация)) КАК К`, r)).toContain(
      'СрезПоследних(, Валюта = &Организация) КАК К',
    );
    // `(A И B) ИЛИ C` ≡ `A И B ИЛИ C`.
    expect(gen(`ВЫБРАТЬ К.Валюта КАК Валюта ИЗ ${RS}.СрезПоследних(, (Кратность = 1 И Кратность = 10) ИЛИ Курс > 1000) КАК К`, r)).toContain(
      '\t\t\tКратность = 1\n\t\t\t\t\tИ Кратность = 10\n\t\t\t\tИЛИ Курс > 1000) КАК К',
    );
  });
});
