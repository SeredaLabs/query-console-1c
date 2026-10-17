/**
 * C2 slice 4: the Designer opens an English query in Russian words (as the 1C
 * Designer prints it) when the translation is proven safe; names are never
 * translated. Platform canonical texts: test/fixtures/platform/c2-english.json.
 */
import { describe, it, expect } from 'vitest';
import { translateEnglishQuery, translateEnglishWords } from '../../src/core/query/translateEnglish';
import { findChangedTemplateMarker } from '../../src/core/query/templateMarkers';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

function designerApply(text: string): { text: string; decision: ReturnType<typeof decideApply> } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, decision: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined, text) };
}

describe('translateEnglishWords: words are translated, names kept', () => {
  it.each([
    ['keywords and operators', 'SELECT T.A AS A FROM X AS T WHERE NOT T.B AND T.C IS NOT NULL OR T.D IN HIERARCHY (&P)',
      'ВЫБРАТЬ T.A КАК A ИЗ X КАК T ГДЕ НЕ T.B И T.C ЕСТЬ НЕ NULL ИЛИ T.D В ИЕРАРХИИ (&P)'],
    ['functions and period arguments', 'SELECT BEGINOFPERIOD(&D, MONTH) AS M, ISNULL(T.A, 0) AS I FROM X AS T',
      'ВЫБРАТЬ НАЧАЛОПЕРИОДА(&D, МЕСЯЦ) КАК M, ЕСТЬNULL(T.A, 0) КАК I ИЗ X КАК T'],
    ['types inside CAST', 'SELECT CAST(T.A AS STRING(10)) AS S, CAST(T.R AS Catalog.Валюты) AS R FROM X AS T',
      'ВЫБРАТЬ ВЫРАЗИТЬ(T.A КАК СТРОКА(10)) КАК S, ВЫРАЗИТЬ(T.R КАК Справочник.Валюты) КАК R ИЗ X КАК T'],
    ['aliases spelled like words', 'SELECT T.A AS Sum, T.B AS Date, T.C AS Order FROM X AS Top',
      'ВЫБРАТЬ T.A КАК Sum, T.B КАК Date, T.C КАК Order ИЗ X КАК Top'],
    ['path segments and heads', 'SELECT E.Order, Value.Type FROM X AS E',
      'ВЫБРАТЬ E.Order, Value.Type ИЗ X КАК E'],
    ['VALUE() and TYPE() contents as written', 'SELECT 1 WHERE &R = VALUE(Catalog.Валюты.EmptyRef) AND VALUETYPE(&R) = TYPE(Catalog.Валюты)',
      'ВЫБРАТЬ 1 ГДЕ &R = ЗНАЧЕНИЕ(Catalog.Валюты.EmptyRef) И ТИПЗНАЧЕНИЯ(&R) = ТИП(Catalog.Валюты)'],
    ['a virtual table periodicity as written (platform keeps it)', 'SELECT T.A FROM AccumulationRegister.Р.Turnovers(, , Month, ) AS T',
      'ВЫБРАТЬ T.A ИЗ AccumulationRegister.Р.Turnovers(, , Month, ) КАК T'],
    ['a temp table name', 'SELECT 1 AS A INTO Total; DROP Total', 'ВЫБРАТЬ 1 КАК A ПОМЕСТИТЬ Total; УНИЧТОЖИТЬ Total'],
    ['comments and strings are copied', 'SELECT "SELECT" AS A // FROM\nFROM X AS T', 'ВЫБРАТЬ "SELECT" КАК A // FROM\nИЗ X КАК T'],
  ])('%s', (_name, en, ru) => {
    expect(translateEnglishWords(en)).toBe(ru);
  });

  it('a Russian query is not touched', () => {
    expect(translateEnglishWords('ВЫБРАТЬ Т.А КАК А ИЗ Справочник.Х КАК Т ГДЕ НЕ Т.Б')).toBeUndefined();
  });
});

describe('translateEnglishQuery: the translation is kept only when proven', () => {
  it('both texts parse to the same model with the same names', () => {
    expect(translateEnglishQuery('SELECT T.Code AS Code FROM Catalog.Валюты AS T WHERE NOT T.DeletionMark'))
      .toBe('ВЫБРАТЬ T.Code КАК Code ИЗ Catalog.Валюты КАК T ГДЕ НЕ T.DeletionMark');
  });

  it('a name that would change keeps the text as written', () => {
    // `Index` after ИЗ is a temp table name that the lexer reads as a keyword.
    expect(translateEnglishWords('SELECT 1 AS A INTO Index; SELECT I.A FROM Index AS I')).not.toBeUndefined();
    expect(translateEnglishQuery('SELECT 1 AS A INTO Index; SELECT I.A FROM Index AS I')).toBeUndefined();
  });

  it('a text that does not parse is not translated', () => {
    expect(translateEnglishQuery('SELECT FROM')).toBeUndefined();
  });
});

describe('Designer → Apply of an English query', () => {
  it('writes Russian, stable on reopen', () => {
    const first = designerApply('SELECT CASE WHEN C.DeletionMark THEN TRUE ELSE FALSE END AS M FROM Catalog.Валюты AS C WHERE C.Ref REFS Catalog.Валюты');
    expect(first.decision).toEqual({ ok: true });
    expect(first.text).toBe('ВЫБРАТЬ\n\tВЫБОР\n\t\tКОГДА C.DeletionMark\n\t\t\tТОГДА ИСТИНА\n\t\tИНАЧЕ ЛОЖЬ\n\tКОНЕЦ КАК M\nИЗ\n\tСправочник.Валюты КАК C\nГДЕ\n\tC.Ref ССЫЛКА Справочник.Валюты');
    expect(designerApply(first.text).text).toBe(first.text);
  });

  it('comments survive the translation', () => {
    const { text } = designerApply('SELECT\n\t// the code\n\tC.Code AS Code\nFROM Catalog.Валюты AS C');
    expect(text).toContain('// the code');
    expect(text).toContain('ВЫБРАТЬ');
  });

  it('a template marker keeps its neighbours across languages (U1)', () => {
    expect(findChangedTemplateMarker('SELECT 1 FROM X WHERE NOT #Cond', 'ВЫБРАТЬ 1 ИЗ X ГДЕ НЕ #Cond')).toBeUndefined();
    expect(findChangedTemplateMarker('SELECT ISNULL(#F, 0) AS A', 'ВЫБРАТЬ ЕСТЬNULL(#F, 0) КАК A')).toBeUndefined();
    // As in Russian: a marker the Designer leaves alone is applied, one it qualifies is refused.
    expect(designerApply('SELECT T.A FROM #Tab AS T WHERE NOT T.B').decision).toEqual({ ok: true });
    expect(designerApply('SELECT T.A FROM X AS T WHERE NOT (#Cond)').decision).toMatchObject({ ok: false, templateMarker: '#Cond' });
    expect(designerApply('ВЫБРАТЬ Т.А ИЗ Х КАК Т ГДЕ НЕ (#Cond)').decision).toMatchObject({ ok: false, templateMarker: '#Cond' });
  });
});
