/**
 * C24 prerequisite: UNKNOWN metadata is not a KNOWN EMPTY projection.
 *
 * The Designer opens text without configuration metadata. As soon as the batch has a
 * temp table (`ПОМЕСТИТЬ` or an inferred undefined one), the parser's second pass gets
 * a resolver that knows only those temp tables. `expandStarFields` treated every other
 * source as resolvable-and-empty and removed its wildcard: `ВЫБРАТЬ Т.* ИЗ
 * Справочник.Валюты КАК Т` vanished (Designer → Apply ok), `Т.*, Т.Код` lost `Т.*`, and
 * a bare `*` over a real table and a temp table kept only the temp table's columns.
 *
 * Such a resolver now marks itself `metadataUnknown`; a wildcard over a configuration
 * source it does not know stays as written. With real metadata the wildcard still
 * expands, and an undefined temp table (one-segment name) still contributes no columns,
 * as the platform does (`СхемаЗапроса`: `ВЫБРАТЬ * ИЗ ВТ2` → empty text,
 * `ВЫБРАТЬ *, 1 КАК Б ИЗ ВТ2` → `1 КАК Б`; SL_kza, 2026-10-11).
 */
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const SEP = '////////////////////////////////////////////////////////////////////////////////';
const resolver = buildYamlResolver(path.join(__dirname, '../fixtures/corpus/metadata/cf'));
const gen = (text: string, withResolver = false): string =>
  generateBatch(parseBatch(text, withResolver ? resolver : undefined));
const statements = (text: string): string[] => text.split(SEP);
const last = (text: string): string => statements(text).pop()!;

function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

const PLACE = 'ВЫБРАТЬ 1 КАК А ПОМЕСТИТЬ ВТ;\n';
const INFERRED = 'ВЫБРАТЬ В.Код КАК К ИЗ ВТ КАК В;\nВЫБРАТЬ В.* ИЗ ВТ КАК В;\n';

describe('A/C/E/F: a wildcard over a real table without metadata is kept', () => {
  it.each(['Т', 'Ціна', 'Ґа', 'Gültig'])('A: after ПОМЕСТИТЬ, alias %s', alias => {
    const out = gen(`${PLACE}ВЫБРАТЬ ${alias}.* ИЗ Справочник.Валюты КАК ${alias}`);
    expect(statements(out)).toHaveLength(2);
    expect(last(out)).toContain(`\t${alias}.*\n`);
  });

  it('A: bare * after ПОМЕСТИТЬ', () => {
    expect(last(gen(`${PLACE}ВЫБРАТЬ * ИЗ Справочник.Валюты`))).toContain('\t*\n');
  });

  it('C: inferred temp table and a real table in one batch', () => {
    const out = gen(`${INFERRED}ВЫБРАТЬ Т.* ИЗ Справочник.Валюты КАК Т`);
    expect(statements(out)).toHaveLength(3);
    expect(last(out)).toContain('\tТ.*\n');
    expect(statements(out)[1]).toContain('В.Код КАК Код'); // the inferred star still expands
  });

  it('E: mixed projection keeps Т.* and the explicit field, in order', () => {
    const out = last(gen(`${INFERRED}ВЫБРАТЬ Т.*, Т.Код КАК К2 ИЗ Справочник.Валюты КАК Т`));
    expect(out).toContain('\tТ.*,\n\tТ.Код КАК К2\n');
  });

  it('bare * over a real table and a temp table is not partially expanded', () => {
    expect(last(gen(`${PLACE}ВЫБРАТЬ * ИЗ Справочник.Валюты КАК Т, ВТ КАК В`))).toContain('\t*\n');
  });

  it('attribute star without metadata is kept', () => {
    expect(last(gen(`${PLACE}ВЫБРАТЬ Т.Ссылка.* ИЗ Справочник.Валюты КАК Т`))).toContain('\tТ.Ссылка.*\n');
  });
});

describe('B/H: with a base resolver the behaviour is unchanged', () => {
  it('B: the wildcard expands to the known fields', () => {
    const out = last(gen(`${PLACE}ВЫБРАТЬ Т.* ИЗ Справочник.Валюты КАК Т`, true));
    expect(out).toContain('\tТ.Ссылка КАК Ссылка,\n');
    expect(out).toContain('\tТ.Наименование КАК Наименование,\n');
    expect(out).not.toContain('*');
  });

  it('H: same text, without and with metadata', () => {
    const text = `${PLACE}ВЫБРАТЬ * ИЗ Справочник.Валюты КАК Т, ВТ КАК В`;
    expect(last(gen(text))).toContain('\t*\n');
    const known = last(gen(text, true));
    expect(known).toContain('\tТ.Ссылка КАК Ссылка,\n');
    expect(known).toContain('\tВ.А КАК А\n');
  });
});

describe('D: an undefined temp table contributes no columns (platform behaviour)', () => {
  it.each([false, true])('with resolver: %s', withResolver => {
    expect(last(gen(`${PLACE}ВЫБРАТЬ * ИЗ ВТ2`, withResolver))).toBe('');
    expect(last(gen(`${PLACE}ВЫБРАТЬ *, 1 КАК Б ИЗ ВТ2`, withResolver))).toBe('\nВЫБРАТЬ\n\t1 КАК Б\nИЗ\n\tВТ2 КАК ВТ2');
  });
});

describe('G: Designer → Apply → reopen keeps every statement and wildcard', () => {
  it.each([
    `${PLACE}ВЫБРАТЬ Т.* ИЗ Справочник.Валюты КАК Т`,
    `${INFERRED}ВЫБРАТЬ Т.* ИЗ Справочник.Валюты КАК Т`,
    `${INFERRED}ВЫБРАТЬ Т.*, Т.Код КАК К2 ИЗ Справочник.Валюты КАК Т`,
    `${PLACE}ВЫБРАТЬ * ИЗ Справочник.Валюты`,
  ])('%j', text => {
    const { text: out, applyOk } = designer(text);
    expect(applyOk).toBe(true);
    expect(statements(out)).toHaveLength(statements(gen(text)).length);
    expect(last(out)).toMatch(/\*/);
    expect(designer(out).text).toBe(out);
  });
});

describe('A1 parseStar: a wildcard alias is one lexer name', () => {
  // `parseStar` used its own `[\wА-Яа-яЁё]` class: `Ґа.*`, `Ціна.*`, `Gültig.*` were not
  // seen as wildcards at all and stayed `… КАК Поле1` where `Га.*` expanded.
  const swap = (text: string, alias: string): string =>
    text.replace(/(?<![\p{L}\p{N}_])Га(?![\p{L}\p{N}_])/gu, alias);

  it.each(['Ґа', 'Ціна', 'Gültig'])('%s.* expands exactly like Га.*', alias => {
    const texts = [
      'ВЫБРАТЬ Га.Код КАК К ИЗ ВТ КАК Га;\nВЫБРАТЬ Га.* ИЗ ВТ КАК Га',
      `${PLACE}ВЫБРАТЬ Га.* ИЗ Справочник.Валюты КАК Га`,
      'ВЫБРАТЬ Га.*, Га.Код КАК К2 ИЗ Справочник.Валюты КАК Га',
    ];
    for (const text of texts) for (const withResolver of [false, true]) {
      expect(gen(swap(text, alias), withResolver)).toBe(swap(gen(text, withResolver), alias));
    }
    expect(designer(swap(texts[0], alias)).text).toBe(swap(designer(texts[0]).text, alias));
  });

  it('Ґа.* over an inferred temp table prints its columns', () => {
    expect(last(gen('ВЫБРАТЬ Ґа.Код КАК К ИЗ ВТ КАК Ґа;\nВЫБРАТЬ Ґа.* ИЗ ВТ КАК Ґа'))).toContain('\tҐа.Код КАК Код\n');
  });
});
