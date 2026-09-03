import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { lintBatch } from '../../src/core/query/queryLinter';

function lint(text: string) {
  return lintBatch(parseBatch(text));
}

describe('queryLinter — full-join', () => {
  it('flags ПОЛНОЕ СОЕДИНЕНИЕ (ВСЕ с обеих сторон)', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ПОЛНОЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код';
    const warnings = lint(text);
    expect(warnings.map(w => w.code)).toEqual(['full-join']);
  });

  it('не срабатывает на ЛЕВОЕ/ПРАВОЕ/ВНУТРЕННЕЕ соединение', () => {
    const left = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код';
    const right = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ПРАВОЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код';
    const inner = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код';
    for (const text of [left, right, inner]) {
      expect(lint(text).filter(w => w.code === 'full-join')).toEqual([]);
    }
  });
});

describe('queryLinter — join-with-subquery', () => {
  it('flags соединение с вложенным запросом-источником', () => {
    const text =
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ' +
      'ВНУТРЕННЕЕ СОЕДИНЕНИЕ (ВЫБРАТЬ Т2.Код ИЗ Справочник.Т2 КАК Т2) КАК ВТ ПО Т1.Код = ВТ.Код';
    const warnings = lint(text);
    expect(warnings.map(w => w.code)).toContain('join-with-subquery');
  });

  it('не срабатывает на соединение обычных таблиц', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код';
    expect(lint(text).filter(w => w.code === 'join-with-subquery')).toEqual([]);
  });
});

describe('queryLinter — top-without-order', () => {
  it('flags ПЕРВЫЕ N без УПОРЯДОЧИТЬ ПО', () => {
    const text = 'ВЫБРАТЬ ПЕРВЫЕ 10 Т1.Код ИЗ Справочник.Т1 КАК Т1';
    expect(lint(text).map(w => w.code)).toEqual(['top-without-order']);
  });

  it('не срабатывает, если есть УПОРЯДОЧИТЬ ПО', () => {
    const text = 'ВЫБРАТЬ ПЕРВЫЕ 10 Т1.Код ИЗ Справочник.Т1 КАК Т1 УПОРЯДОЧИТЬ ПО Т1.Код';
    expect(lint(text).filter(w => w.code === 'top-without-order')).toEqual([]);
  });

  it('не срабатывает, если есть АВТОУПОРЯДОЧИВАНИЕ', () => {
    const text = 'ВЫБРАТЬ ПЕРВЫЕ 10 Т1.Код ИЗ Справочник.Т1 КАК Т1 УПОРЯДОЧИТЬ ПО АВТОУПОРЯДОЧИВАНИЕ';
    expect(lint(text).filter(w => w.code === 'top-without-order')).toEqual([]);
  });

  it('не срабатывает без ПЕРВЫЕ вообще', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1';
    expect(lint(text).filter(w => w.code === 'top-without-order')).toEqual([]);
  });
});

describe('queryLinter — like-leading-wildcard', () => {
  it('flags ПОДОБНО с литералом, начинающимся с "%"', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ГДЕ Т1.Наименование ПОДОБНО "%АБВ"';
    expect(lint(text).map(w => w.code)).toEqual(['like-leading-wildcard']);
  });

  it('не срабатывает на экранированный ~% (буквальный процент)', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ГДЕ Т1.Наименование ПОДОБНО "~%АБВ"';
    expect(lint(text).filter(w => w.code === 'like-leading-wildcard')).toEqual([]);
  });

  it('не срабатывает на литерал без ведущего "%"', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ГДЕ Т1.Наименование ПОДОБНО "АБВ%"';
    expect(lint(text).filter(w => w.code === 'like-leading-wildcard')).toEqual([]);
  });

  it('не срабатывает на ПОДОБНО &Параметр (структурное условие, не сырой текст)', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ГДЕ Т1.Наименование ПОДОБНО &Шаблон';
    expect(lint(text).filter(w => w.code === 'like-leading-wildcard')).toEqual([]);
  });

  it('находит ПОДОБНО с ведущим "%" внутри условия соединения (ПО)', () => {
    const text =
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ' +
      'ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т2.Наименование ПОДОБНО "%АБВ"';
    expect(lint(text).map(w => w.code)).toContain('like-leading-wildcard');
  });
});

describe('queryLinter — регрессия на ложные срабатывания', () => {
  it('обычный, хорошо сформированный запрос не даёт ни одного предупреждения', () => {
    const text =
      'ВЫБРАТЬ\n' +
      '\tТ1.Код,\n' +
      '\tТ2.Наименование\n' +
      'ИЗ\n' +
      '\tСправочник.Т1 КАК Т1\n' +
      '\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2\n' +
      '\tПО Т1.Код = Т2.Код\n' +
      'ГДЕ\n' +
      '\tТ1.Наименование ПОДОБНО "АБВ%"\n' +
      'УПОРЯДОЧИТЬ ПО\n' +
      '\tТ1.Код';
    expect(lint(text)).toEqual([]);
  });
});
