/**
 * C25 (reopened): `reindentLeafSubquery` collapses a multi-line tuple head before
 * a membership subquery (`(Т.Код,⏎"a  b") В⏎(ВЫБРАТЬ …)`) onto one line. The
 * head's whitespace normalization (`[ \t]+`, `\(\s+`, `\s+\)`, `\s+,`) used to run
 * over literals too (`"a  b"` → `"a b"`, tab → space, `"a ,b"` → `"a,b"`) and Apply
 * allowed the result. Literal bytes are now kept; the code around them is still
 * normalized as before. Covered through WHERE, JOIN, HAVING and a virtual-table
 * condition, by the generator and by the Designer product path.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const gen = (text: string): string => generateBatch(parseBatch(text));
/** Designer open → generated text → Apply decision. */
function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}
/** Same length, neutral content: `"a  b"` → `"aaaa"`. */
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n"]/gu, 'a')}"`;

const T = 'ИЗ Справочник.Товары КАК Т';
const SUB = (a: string): string => `\n\t(ВЫБРАТЬ\n\t\t${a}.Код, ${a}.Код\n\tИЗ\n\t\tСправочник.Товары КАК ${a})`;
const contexts: Record<string, (head: string) => string> = {
  where: h => `ВЫБРАТЬ Т.Код КАК К ${T} ГДЕ ${h} В${SUB('Х')}`,
  join: h => `ВЫБРАТЬ Т.Код КАК К ${T} ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Товары КАК Х ПО ${h} В${SUB('Р')}`,
  having: h => `ВЫБРАТЬ Т.Код КАК К ${T} СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ ${h} В${SUB('Х')}`,
  vt: h => `ВЫБРАТЬ О.Р КАК Р ИЗ РегистрНакопления.Р.Остатки(, ${h} В${SUB('Х')}) КАК О`,
};
const heads: Record<string, (literal: string) => string> = {
  last: l => `(Т.Код,\n\t${l})`,
  first: l => `(${l},\n\tТ.Код)`,
};
/** Repeated spaces, tab, whitespace before and after a comma. */
const payloads = ['"a  b"', '"a\tb"', '"a ,b"', '"a , b"', '"a,  b"', '"a\t,b"', '"  a  "'];

describe('tuple-head literals stay byte-for-byte', () => {
  for (const [ctx, make] of Object.entries(contexts)) {
    for (const [form, head] of Object.entries(heads)) {
      it.each(payloads)(`${ctx}/${form}: %j`, literal => {
        const query = make(head(literal));
        const out = gen(query);
        expect(out).toContain(literal);
        // Only the payload differs from a same-shaped neutral literal, and reopening is stable.
        expect(out.split(literal).join(neutral(literal))).toBe(gen(query.replace(literal, neutral(literal))));
        expect(gen(out)).toBe(out);
      });
    }
  }

  it.each(payloads)('Designer path (WHERE, JOIN): %j keeps its bytes and Apply sees them', literal => {
    for (const ctx of ['where', 'join']) {
      const { text, applyOk } = designer(contexts[ctx](heads.last(literal)));
      expect(text).toContain(literal);
      expect(applyOk).toBe(true);
    }
  });
});

describe('code normalization of the head is unchanged', () => {
  it('a neutral literal: same canonical head as before the fix', () => {
    expect(gen(contexts.where('(  Т.Код  ,\n\t"aaaa"  )'))).toContain('\t(Т.Код, "aaaa") В\n');
  });

  it('all four forms still apply to code around a literal', () => {
    // `[ \t]+`, `\(\s+`, `\s+\)` and `\s+,` act on the code; the literal keeps its spaces.
    expect(gen(contexts.where('(  Т.Код  ,\n\t"a  b"  )'))).toContain('\t(Т.Код, "a  b") В\n');
    expect(gen(contexts.where('(\n\tТ.Код,\n\t"a  b"\n)'))).toContain('\t(Т.Код, "a  b") В\n');
  });
});
