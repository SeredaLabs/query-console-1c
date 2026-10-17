/**
 * C2 slice 1: English SDBL words. The platform reads one bilingual word table, so
 * an English word behaves exactly as its Russian pair (`src/core/query/sdblEnglish.ts`).
 * Platform evidence: test/fixtures/platform/c2-english.json.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { tokenize, isWordToken, wordOf } from '../../src/core/query/sdblLexer';
import { ENGLISH_KEYWORDS, ENGLISH_WORDS } from '../../src/core/query/sdblEnglish';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'c2-english.json'), 'utf8'));
type Case = { name: string; group: string; query: string; platform: { accepted: boolean } };
const cases: Case[] = evidence.cases;

const parses = (q: string): boolean => {
  try { parseBatch(q); return true; } catch { return false; }
};

describe('C2: tokens', () => {
  it('an English keyword is its Russian keyword; the text keeps the spelling', () => {
    const [t] = tokenize('select');
    expect(t).toMatchObject({ type: 'keyword', value: 'ВЫБРАТЬ', text: 'select' });
    for (const [en, ru] of ENGLISH_KEYWORDS) expect(tokenize(en)[0].value).toBe(ru);
  });

  it('an English contextual word stays an identifier and matches its Russian word', () => {
    const [t] = tokenize('Not');
    expect(t).toMatchObject({ type: 'ident', value: 'Not', text: 'Not' });
    expect(isWordToken(t, 'НЕ')).toBe(true);
    expect(wordOf(t)).toBe('НЕ');
    for (const [en, ru] of ENGLISH_WORDS) expect(isWordToken(tokenize(`x ${en}`)[1], ...ru)).toBe(true);
    // HIERARCHY is both ИЕРАРХИЯ (ИТОГИ … ПО) and ИЕРАРХИИ (В ИЕРАРХИИ).
    expect(isWordToken(tokenize('HIERARCHY')[0], 'ИЕРАРХИИ')).toBe(true);
  });

  it('a word written right after `.` is a name, in either language', () => {
    expect(tokenize('E.Order')[2]).toMatchObject({ type: 'ident', value: 'Order' });
    expect(tokenize('Т.Упорядочить')[2]).toMatchObject({ type: 'ident', value: 'Упорядочить' });
    // Not adjacent: `К.` then a keyword on the next line is an unfinished path while typing.
    expect(tokenize('К.\nИЗ')[2]).toMatchObject({ type: 'keyword', value: 'ИЗ' });
  });
});

describe('C2: platform-valid English queries open', () => {
  it.each(cases.filter(c => c.platform.accepted).map(c => [c.name, c.query]))('%s', (_name, query) => {
    expect(parses(query)).toBe(true);
  });
});

describe('C2: an English query parses to the model of its Russian twin', () => {
  // Twins translate only the words; names stay as written (the platform accepts that mix).
  const pairs: Array<[string, string]> = [
    ['SELECT ALLOWED DISTINCT TOP 5 Cur.Code AS Code FROM Catalog.Валюты AS Cur WHERE NOT Cur.DeletionMark AND (Cur.Code = "1" OR Cur.Code LIKE "%1%" ESCAPE "~")',
      'ВЫБРАТЬ РАЗРЕШЕННЫЕ РАЗЛИЧНЫЕ ПЕРВЫЕ 5 Cur.Code КАК Code ИЗ Catalog.Валюты КАК Cur ГДЕ НЕ Cur.DeletionMark И (Cur.Code = "1" ИЛИ Cur.Code ПОДОБНО "%1%" СПЕЦСИМВОЛ "~")'],
    ['SELECT CASE WHEN C.DeletionMark THEN TRUE ELSE FALSE END AS M, CAST(C.Code AS STRING(10)) AS S FROM Catalog.Валюты AS C WHERE C.Ref REFS Catalog.Валюты AND C.Description IS NOT NULL',
      'ВЫБРАТЬ ВЫБОР КОГДА C.DeletionMark ТОГДА ИСТИНА ИНАЧЕ ЛОЖЬ КОНЕЦ КАК M, ВЫРАЗИТЬ(C.Code КАК СТРОКА(10)) КАК S ИЗ Catalog.Валюты КАК C ГДЕ C.Ref ССЫЛКА Catalog.Валюты И C.Description ЕСТЬ НЕ NULL'],
    ['SELECT C1.Code FROM Catalog.Валюты AS C1 LEFT OUTER JOIN Catalog.Валюты AS C2 ON C1.Ref = C2.Ref INNER JOIN Catalog.Валюты AS C3 ON C1.Ref = C3.Ref',
      'ВЫБРАТЬ C1.Code ИЗ Catalog.Валюты КАК C1 ЛЕВОЕ ВНЕШНЕЕ СОЕДИНЕНИЕ Catalog.Валюты КАК C2 ПО C1.Ref = C2.Ref ВНУТРЕННЕЕ СОЕДИНЕНИЕ Catalog.Валюты КАК C3 ПО C1.Ref = C3.Ref'],
    ['SELECT C.Code AS Code, COUNT(DISTINCT C.Ref) AS N FROM Catalog.Валюты AS C GROUP BY C.Code HAVING COUNT(*) > 0 ORDER BY Code DESC, N ASC AUTOORDER',
      'ВЫБРАТЬ C.Code КАК Code, КОЛИЧЕСТВО(РАЗЛИЧНЫЕ C.Ref) КАК N ИЗ Catalog.Валюты КАК C СГРУППИРОВАТЬ ПО C.Code ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 0 УПОРЯДОЧИТЬ ПО Code УБЫВ, N ВОЗР АВТОУПОРЯДОЧИВАНИЕ'],
    ['SELECT C.Code AS Code INTO TT FROM Catalog.Валюты AS C INDEX BY Code; SELECT 1 AS A UNION ALL SELECT 2; DROP TT',
      'ВЫБРАТЬ C.Code КАК Code ПОМЕСТИТЬ TT ИЗ Catalog.Валюты КАК C ИНДЕКСИРОВАТЬ ПО Code; ВЫБРАТЬ 1 КАК A ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 2; УНИЧТОЖИТЬ TT'],
    ['SELECT C.Ref AS Ref, 1 AS N FROM Catalog.Валюты AS C WHERE C.Ref IN HIERARCHY (&P) TOTALS SUM(N) BY OVERALL, Ref ONLY HIERARCHY',
      'ВЫБРАТЬ C.Ref КАК Ref, 1 КАК N ИЗ Catalog.Валюты КАК C ГДЕ C.Ref В ИЕРАРХИИ (&P) ИТОГИ СУММА(N) ПО ОБЩИЕ, Ref ТОЛЬКО ИЕРАРХИЯ'],
    ['SELECT DATETIME(2020,1,1) AS P, 1 AS N TOTALS SUM(N) BY P PERIODS(DAY, DATETIME(2020,1,1), DATETIME(2020,1,3))',
      'ВЫБРАТЬ DATETIME(2020,1,1) КАК P, 1 КАК N ИТОГИ СУММА(N) ПО P ПЕРИОДАМИ(ДЕНЬ, DATETIME(2020,1,1), DATETIME(2020,1,3))'],
    ['SELECT C.Code FROM Catalog.Валюты AS C FOR UPDATE Catalog.Валюты',
      'ВЫБРАТЬ C.Code ИЗ Catalog.Валюты КАК C ДЛЯ ИЗМЕНЕНИЯ Catalog.Валюты'],
    ['SELECT E.Ref, E.Order FROM Enum.X AS E WHERE E.Order > 0 ORDER BY E.Order',
      'ВЫБРАТЬ E.Ref, E.Order ИЗ Enum.X КАК E ГДЕ E.Order > 0 УПОРЯДОЧИТЬ ПО E.Order'],
  ];
  /** Model JSON with every word in its canonical (Russian) form: raw expression slices keep the source words. */
  const canonical = (q: string): string => JSON.stringify(parseBatch(q)).replace(/[\p{L}_][\p{L}\p{N}_]*/gu, w => {
    const up = w.toUpperCase();
    if (up === 'ИЕРАРХИИ') return 'ИЕРАРХИЯ';
    return ENGLISH_KEYWORDS.get(up) ?? ENGLISH_WORDS.get(up)?.[0] ?? w;
  });
  it.each(pairs)('%s', (en, ru) => {
    expect(canonical(en)).toBe(canonical(ru));
  });
});

describe('C2: a word reserved as an alias is reserved in both languages, as on the platform', () => {
  const ru = evidence.reservedAsAlias.russianQueryEnglishAlias as Record<string, boolean>;
  // Our parser is more permissive than the platform about keywords used as aliases;
  // that is the same in both languages: an English alias behaves as its Russian pair.
  it.each(Object.keys(ru).filter(w => ENGLISH_KEYWORDS.has(w)))('%s', w => {
    expect(parses(`ВЫБРАТЬ 1 КАК ${w}`)).toBe(parses(`ВЫБРАТЬ 1 КАК ${ENGLISH_KEYWORDS.get(w)}`));
    expect(parses(`SELECT 1 AS ${w}`)).toBe(parses(`ВЫБРАТЬ 1 КАК ${ENGLISH_KEYWORDS.get(w)}`));
  });
});

describe('C2: Apply of an English query writes a platform-valid text', () => {
  it.each(evidence.designerApplied.map((a: { name: string }) => [a.name, a]))('%s', (_name, a: any) => {
    const query = cases.find(c => c.name === a.name)!.query;
    const open = tryOpenDesignerBatch(query);
    if (!open.ok) throw new Error(open.error);
    const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
    const out = computeBatchTextSafe(state, true);
    expect(decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined, query)).toEqual({ ok: true });
    expect(a.platformAccepted).toBe(true);
    expect(out.text).toBe(a.generated);
  });
});
