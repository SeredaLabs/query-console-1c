/**
 * A1-7 / R5: `inferUndefinedTempTables` (фаза 6.19) выводит колонки неопределённой ВТ
 * из ссылок `<алиас>.<кол>` пакета, чтобы развернуть по ней звезду. Ссылки и звёзды
 * берутся из токенов лексера:
 *  - имя колонки — по алфавиту лексера (`Т.Ціна` раньше выводилась как колонка `Ц`,
 *    и звезда печатала несуществующее поле `Т.Ц КАК Ц`);
 *  - комментарий или строковый литерал колонок не создают и звезду не включают
 *    (`// см. Т.Фантом` и `"Т.Строка"` раньше добавляли колонки `Фантом`/`Строка`).
 * Путь Designer (открытие без метаданных) выводит ВТ так же, как генератор.
 *
 * C24 step 1a: the inferred columns are visible only through the constructor-parity
 * expansion (`wildcardPolicy: 'constructor'`, oracle/corpus). The Designer keeps a
 * wildcard over an inferred temp table as written (D2: the batch mentions only some
 * of its columns).
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';

const SEP = '////////////////////////////////////////////////////////////////////////////////';
const gen = (text: string): string =>
  generateBatch(parseBatch(text, undefined, { preserveComments: true, wildcardPolicy: 'constructor' }));
/** Последний оператор пакета — тот, где разворачивается звезда. */
const starStatement = (text: string): string => gen(text).split(SEP).pop()!;
const batch = (first: string, star = 'ВЫБРАТЬ Т.* ИЗ ВТ КАК Т'): string => `${first}\n;\n${star}`;

function designer(text: string): { text: string; applyOk: boolean } {
  const open = tryOpenDesignerBatch(text);
  if (!open.ok) throw new Error(open.error);
  const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: open.doc });
  const out = computeBatchTextSafe(state, true);
  return { text: out.text, applyOk: decideApply(out.text, out.error, findStaticApplyBlocker(state), undefined).ok };
}

describe('inferred temp-table columns: names come from the lexer', () => {
  const firsts = [
    'ВЫБРАТЬ Т.$ КАК Х ИЗ ВТ КАК Т',
    'ВЫБРАТЬ Т.Код КАК К ИЗ ВТ КАК Т ГДЕ Т.$ = 1',
    'ВЫБРАТЬ ЕСТЬNULL(Т.$, 0) КАК Х ИЗ ВТ КАК Т',
  ];
  const stars = ['ВЫБРАТЬ Т.* ИЗ ВТ КАК Т', 'ВЫБРАТЬ\n\t*\nИЗ ВТ КАК Т'];
  it.each(['Ціна', 'Gültig', 'Straße', 'Ґанок'])('%s behaves exactly like Цена', name => {
    for (const first of firsts) for (const star of stars) {
      const reference = gen(batch(first.replace('$', 'Цена'), star));
      expect(gen(batch(first.replace('$', name), star))).toBe(reference.split('Цена').join(name));
    }
  });

  it('the star prints the whole name', () => {
    expect(starStatement(batch('ВЫБРАТЬ Т.Ціна КАК Х ИЗ ВТ КАК Т'))).toContain('\tТ.Ціна КАК Ціна\n');
  });

  it('Designer path: the wildcard is kept (D2), Apply allowed, reopen stable', () => {
    const { text, applyOk } = designer(batch('ВЫБРАТЬ Т.Gültig КАК Х ИЗ ВТ КАК Т'));
    expect(text).toContain('\tТ.Gültig КАК Х\n');
    expect(text.split(SEP).pop()).toBe('\nВЫБРАТЬ\n\tТ.*\nИЗ\n\tВТ КАК Т');
    expect(applyOk).toBe(true);
    expect(designer(text).text).toBe(text);
  });
});

describe('R5: comments and literals do not create columns', () => {
  const first = 'ВЫБРАТЬ Т.Цена КАК Х$ ИЗ ВТ КАК Т';
  const plain = starStatement(batch(first.replace('$', '')));

  it.each([
    [', "Т.Фантом" КАК Ф', '"Т.Фантом"'],
    [', "Т.*" КАК Ф', '"Т.*"'],
  ])('literal %j: the star equals the one without it, the literal is kept', (payload, literal) => {
    const out = gen(batch(first.replace('$', payload)));
    expect(out.split(SEP).pop()).toBe(plain);
    expect(out).toContain(literal);
  });

  it.each(['// см. Т.Фантом', '// Т.*'])('comment %j: the star equals the one without it', comment => {
    const out = gen(batch(`${first.replace('$', '')} ${comment}`));
    expect(out.split(SEP).pop()).toBe(plain);
    expect(out).toContain(comment);
  });

  it('a code reference still adds its column (and a multi-segment path does not)', () => {
    const out = starStatement(batch('ВЫБРАТЬ Т.Цена КАК Х, Т.Реквизит.Под КАК П ИЗ ВТ КАК Т ГДЕ Т.Код = 1'));
    expect(out).toContain('Т.Цена КАК Цена');
    expect(out).toContain('Т.Код КАК Код');
    expect(out).not.toContain('Т.Реквизит КАК');
  });

  it('Designer path: no column from a comment, Apply allowed', () => {
    const { text, applyOk } = designer(batch('ВЫБРАТЬ Т.Цена КАК Х ИЗ ВТ КАК Т // см. Т.Фантом'));
    expect(text).not.toContain('Т.Фантом КАК');
    expect(text).toContain('// см. Т.Фантом');
    expect(applyOk).toBe(true);
  });
});
