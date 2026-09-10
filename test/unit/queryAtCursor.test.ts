import { describe, it, expect } from 'vitest';
import { findQueryAt, findQueryKeywordRange, rawOffsetToQueryTextOffset } from '../../src/extension/queryAtCursor';

describe('findQueryAt', () => {
  it('returns the hit when offset is inside a query literal (text de-piped, start/end at quotes)', () => {
    const source =
      'Запрос = Новый Запрос;\n' +
      'Запрос.Текст =\n' +
      '"ВЫБРАТЬ\n' +
      '|	Валюты.Код\n' +
      '|ИЗ\n' +
      '|	Справочник.Валюты КАК Валюты";\n';
    const open = source.indexOf('"');
    const close = source.indexOf('";');
    const offset = source.indexOf('Валюты.Код');
    const hit = findQueryAt(source, offset);
    expect(hit).not.toBeNull();
    expect(hit!.start).toBe(open);
    expect(hit!.end).toBe(close + 1); // close quote included
    // de-piped reconstructed text
    expect(hit!.text).toBe(
      'ВЫБРАТЬ\n	Валюты.Код\nИЗ\n	Справочник.Валюты КАК Валюты'
    );
  });

  it('распознаёт запрос, начинающийся со строки-комментария (фаза 8.1)', () => {
    // 1С открывает такой текст конструктором: перед ВЫБРАТЬ — комментарий, и почти
    // на каждой строке хвостовой `//`. Наш экстрактор должен его опознать как запрос.
    const source = [
      'Запрос.Текст = " // ШЛЯПА !',
      '|ВЫБРАТЬ // ШЛЯПА !',
      '|\tВалюты.Ссылка КАК Ссылка // ШЛЯПА !',
      '|ИЗ // ШЛЯПА !',
      '|\tСправочник.Валюты КАК Валюты";',
    ].join('\n');
    const offset = source.indexOf('ВЫБРАТЬ');
    const hit = findQueryAt(source, offset);
    expect(hit).not.toBeNull();
    // Восстановленный текст СОХРАНЯЕТ ведущий комментарий (для парсера/связывателя).
    expect(hit!.text.startsWith(' // ШЛЯПА !\nВЫБРАТЬ')).toBe(true);
  });

  it('returns null when offset falls outside any string literal', () => {
    const source = 'Запрос.Текст = "ВЫБРАТЬ Валюты.Код ИЗ Справочник.Валюты КАК Валюты";';
    const offset = 2; // inside `Запрос`, before the quote
    expect(findQueryAt(source, offset)).toBeNull();
  });

  it('returns null when offset is inside a non-query string', () => {
    const source = 'Сообщить("Просто текст, не запрос");';
    const offset = source.indexOf('Просто');
    expect(findQueryAt(source, offset)).toBeNull();
  });

  it('returns the second hit when offset is in the second of two query literals', () => {
    const source =
      'А = "ВЫБРАТЬ Первый.Поле ИЗ Справочник.Первый КАК Первый";\n' +
      'Б = "ВЫБРАТЬ Второй.Поле ИЗ Справочник.Второй КАК Второй";\n';
    const secondOpen = source.indexOf('"', source.indexOf('Б ='));
    const offset = source.indexOf('Второй.Поле');
    const hit = findQueryAt(source, offset);
    expect(hit).not.toBeNull();
    expect(hit!.start).toBe(secondOpen);
    expect(hit!.text).toBe('ВЫБРАТЬ Второй.Поле ИЗ Справочник.Второй КАК Второй');
  });

  it('includes the quotes in [start,end) — offset on the opening quote returns the hit', () => {
    const source = 'Х = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";';
    const open = source.indexOf('"');
    const hit = findQueryAt(source, open);
    expect(hit).not.toBeNull();
    expect(hit!.start).toBe(open);
  });

  it('recognises УНИЧТОЖИТЬ queries', () => {
    const source = 'Х = "УНИЧТОЖИТЬ ВТ";';
    const offset = source.indexOf('УНИЧТОЖИТЬ');
    const hit = findQueryAt(source, offset);
    expect(hit).not.toBeNull();
    expect(hit!.text).toBe('УНИЧТОЖИТЬ ВТ');
  });
});

describe('findQueryKeywordRange', () => {
  it('finds the keyword right after the opening quote', () => {
    const source = 'Х = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    const range = findQueryKeywordRange(source, hit);
    expect(range).toEqual({ start: source.indexOf('ВЫБРАТЬ'), end: source.indexOf('ВЫБРАТЬ') + 'ВЫБРАТЬ'.length });
  });

  it('finds УНИЧТОЖИТЬ', () => {
    const source = 'Х = "УНИЧТОЖИТЬ ВТ";';
    const hit = findQueryAt(source, source.indexOf('УНИЧТОЖИТЬ'))!;
    const range = findQueryKeywordRange(source, hit);
    expect(range).toEqual({
      start: source.indexOf('УНИЧТОЖИТЬ'),
      end: source.indexOf('УНИЧТОЖИТЬ') + 'УНИЧТОЖИТЬ'.length,
    });
  });

  it('skips leading whitespace/pipe continuation on the first line', () => {
    const source = 'Х = "  \tВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    const range = findQueryKeywordRange(source, hit);
    expect(range).toEqual({ start: source.indexOf('ВЫБРАТЬ'), end: source.indexOf('ВЫБРАТЬ') + 'ВЫБРАТЬ'.length });
  });

  it('skips a leading comment line before the keyword (фаза 8.1)', () => {
    const source = [
      'Запрос.Текст = " // ШЛЯПА !',
      '|ВЫБРАТЬ // ШЛЯПА !',
      '|\tВалюты.Ссылка КАК Ссылка // ШЛЯПА !',
      '|ИЗ // ШЛЯПА !',
      '|\tСправочник.Валюты КАК Валюты";',
    ].join('\n');
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    const range = findQueryKeywordRange(source, hit);
    const kwStart = source.indexOf('ВЫБРАТЬ');
    expect(range).toEqual({ start: kwStart, end: kwStart + 'ВЫБРАТЬ'.length });
  });

  it('still finds the keyword when the literal is unclosed (no trailing quote)', () => {
    const source = 'Х = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    expect(hit.end).toBe(source.length); // подтверждаем сам «баг», из-за которого не берём hit.end как диапазон
    const range = findQueryKeywordRange(source, hit);
    expect(range).toEqual({ start: source.indexOf('ВЫБРАТЬ'), end: source.indexOf('ВЫБРАТЬ') + 'ВЫБРАТЬ'.length });
  });
});

describe('rawOffsetToQueryTextOffset (Phase 3d: hover migration, memory: project-semantic-core-roadmap)', () => {
  it('maps a raw offset 1:1 when the literal has no continuation lines or escapes', () => {
    const source = 'Х = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    const rawOffset = source.indexOf('Т.Поле');
    const textOffset = rawOffsetToQueryTextOffset(source, hit, rawOffset);
    expect(textOffset).toBe(hit.text.indexOf('Т.Поле'));
  });

  it('shifts offsets AFTER a stripped |-continuation prefix on a later line', () => {
    const source =
      'Х = "ВЫБРАТЬ\n' +
      '|\tТ.Поле\n' +
      '|ИЗ\n' +
      '|\tСправочник.Т КАК Т";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    const rawOffset = source.indexOf('Т.Поле');
    const textOffset = rawOffsetToQueryTextOffset(source, hit, rawOffset);
    expect(textOffset).toBe(hit.text.indexOf('Т.Поле'));
    expect(hit.text.slice(textOffset, textOffset! + 'Т.Поле'.length)).toBe('Т.Поле');
  });

  it('shifts offsets AFTER an escaped "" pair earlier in the literal', () => {
    const source = 'Х = "ВЫБРАТЬ """"Т.Поле"""" ИЗ Справочник.Т КАК Т";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    const rawOffset = source.indexOf('Справочник.Т');
    const textOffset = rawOffsetToQueryTextOffset(source, hit, rawOffset);
    expect(textOffset).toBe(hit.text.indexOf('Справочник.Т'));
  });

  it('returns undefined for an offset outside the literal body', () => {
    const source = 'Х = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    expect(rawOffsetToQueryTextOffset(source, hit, 0)).toBeUndefined();
    expect(rawOffsetToQueryTextOffset(source, hit, source.length)).toBeUndefined();
  });

  it('returns undefined for an offset pointing at a stripped |-prefix character (not reproduced in hit.text)', () => {
    const source = 'Х = "ВЫБРАТЬ\n|\tТ.Поле ИЗ Справочник.Т КАК Т";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    const pipeOffset = source.indexOf('|');
    expect(rawOffsetToQueryTextOffset(source, hit, pipeOffset)).toBeUndefined();
  });

  it('round-trips every alias-token offset found by findChainAt across a realistic multi-join query', () => {
    const source =
      'Х = "ВЫБРАТЬ\n' +
      '|\tТ1.Код,\n' +
      '|\tТ2.Наименование\n' +
      '|ИЗ\n' +
      '|\tСправочник.А КАК Т1\n' +
      '|\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Б КАК Т2\n' +
      '|\tПО Т1.Код = Т2.Код";';
    const hit = findQueryAt(source, source.indexOf('ВЫБРАТЬ'))!;
    for (const needle of ['Т1.Код', 'Т2.Наименование', 'Т1.Код = Т2.Код']) {
      let rawOffset = source.indexOf(needle);
      while (rawOffset !== -1) {
        const textOffset = rawOffsetToQueryTextOffset(source, hit, rawOffset);
        expect(textOffset).toBeDefined();
        expect(hit.text.slice(textOffset, textOffset! + needle.length)).toBe(needle);
        rawOffset = source.indexOf(needle, rawOffset + 1);
      }
    }
  });
});
