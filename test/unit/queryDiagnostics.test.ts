import { describe, it, expect } from 'vitest';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';

describe('computeQueryParseProblems', () => {
  it('returns nothing for a query that parses', () => {
    const source = 'Х = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";';
    expect(computeQueryParseProblems(source)).toEqual([]);
  });

  it('reports a problem for a query with a missing comma between SELECT-list items (real repro)', () => {
    const source = [
      'Запрос.Текст =',
      '"ВЫБРАТЬ',
      '|	Остатки.Товар',
      '|	Остатки.Аптека КАК Аптека',
      '|ИЗ',
      '|	РегистрНакопления.ОстаткиТоваров КАК Остатки";',
    ].join('\n');
    const problems = computeQueryParseProblems(source);
    expect(problems).toHaveLength(1);
    expect(problems[0].message.length).toBeGreaterThan(0);
    const kwStart = source.indexOf('ВЫБРАТЬ');
    expect(problems[0].start).toBe(kwStart);
    expect(problems[0].end).toBe(kwStart + 'ВЫБРАТЬ'.length);
  });

  it('reports one problem per broken literal, none for the valid ones', () => {
    const source = [
      'А = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";',
      'Б = "ВЫБРАТЬ ИЗ Справочник.Т КАК Т";', // сломано: нет полей перед ИЗ
      'В = "ВЫБРАТЬ Т.Поле ИЗ Справочник.Т КАК Т";',
    ].join('\n');
    const problems = computeQueryParseProblems(source);
    expect(problems).toHaveLength(1);
    const bLine = source.split('\n')[1];
    const kwStart = source.indexOf(bLine) + bLine.indexOf('ВЫБРАТЬ');
    expect(problems[0].start).toBe(kwStart);
  });

  it('does not redline the rest of the document for an unclosed literal', () => {
    // Обычное переходное состояние во время набора нового запроса — литерал ещё
    // не закрыт кавычкой. `findAllQueryLiterals` в этом случае растягивает
    // `hit.end` до конца документа; диапазон диагностики НЕ должен наследовать это.
    const source = 'Х = "ВЫБРАТЬ ИЗ'; // сломан и не закрыт
    const problems = computeQueryParseProblems(source);
    expect(problems).toHaveLength(1);
    const kwStart = source.indexOf('ВЫБРАТЬ');
    expect(problems[0].end).toBe(kwStart + 'ВЫБРАТЬ'.length);
    expect(problems[0].end).toBeLessThan(source.length);
  });

  it('is a known, accepted false positive for a query built by string concatenation', () => {
    // Задокументоване в дизайні обмеження: запит, зібраний конкатенацією рядків
    // (перший фрагмент — сам по собі неповний, валідний лише разом з наступним),
    // все одно отримає проблему — детектор літералів працює по одному рядку-
    // літералу за раз, без повного BSL AST, який відрізняв би це від дійсно
    // зламаного запиту.
    const source = 'Текст = "ВЫБРАТЬ";\nТекст = Текст + " Т.Поле ИЗ Справочник.Т КАК Т";';
    const problems = computeQueryParseProblems(source);
    expect(problems).toHaveLength(1);
  });
});
