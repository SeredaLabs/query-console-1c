import { describe, expect, it } from 'vitest';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { validateBatchText } from '../../src/core/query/validateBatch';
import type { MetaTable } from '../../src/core/metadata/types';

// C41 stage 1b: with metadata already loaded, editor diagnostics report a missing field
// with the same check as open / Query Text / Apply (`validateBatchSemantics`). Without
// metadata they behave as before. Only field errors are added: the other semantic checks
// (tables, duplicate aliases, UNION width) stay out of the diagnostics.

const ТЕСТ: MetaTable = {
  kind: 'Справочник', name: 'Тест', fullName: 'Справочник.Тест',
  fields: [
    { name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] },
    { name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Тест' } }] },
  ],
};
const resolver = buildResolverFromTables([ТЕСТ]);
const MISSING = 'Поле "Нет" не найдено в "Справочник.Тест"';
const literal = (query: string) => `Запрос.Текст = "${query}";`;

describe('C41 1b: editor diagnostics check fields when metadata is loaded', () => {
  it('reports a missing field with the validator message, on the query keyword', () => {
    const source = literal('ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т');
    const problems = computeQueryParseProblems(source, resolver);
    const start = source.indexOf('ВЫБРАТЬ');
    expect(problems).toEqual([{ kind: 'fieldNotFound', message: MISSING, start, end: start + 'ВЫБРАТЬ'.length }]);
  });

  it('is silent without metadata, as before', () => {
    expect(computeQueryParseProblems(literal('ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т'))).toEqual([]);
    expect(computeQueryParseProblems(literal('ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т'), undefined)).toEqual([]);
  });

  it('is silent for existing fields', () => {
    expect(computeQueryParseProblems(literal('ВЫБРАТЬ Т.Код КАК Х ИЗ Справочник.Тест КАК Т ГДЕ Т.Ссылка = &С'), resolver)).toEqual([]);
  });

  it('a parse or malformed problem comes first, one problem per literal', () => {
    expect(computeQueryParseProblems(literal('ВЫБРАТЬ ИЗ Справочник.Тест КАК Т'), resolver).map(p => p.kind)).toEqual(['parse']);
    expect(computeQueryParseProblems(literal('ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т ГДЕ Т.Код = 1 И'), resolver)
      .map(p => p.kind)).toEqual(['malformedExpression']);
  });

  it('reports only field errors: unknown tables, duplicate aliases and UNION width stay out', () => {
    for (const query of [
      'ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.НетТакого КАК Т',
      'ВЫБРАТЬ Т.Код КАК Х, Т.Ссылка КАК Х ИЗ Справочник.Тест КАК Т',
      'ВЫБРАТЬ Т.Код КАК Х ИЗ Справочник.Тест КАК Т ОБЪЕДИНИТЬ ВЫБРАТЬ Т.Код, Т.Ссылка ИЗ Справочник.Тест КАК Т',
    ]) {
      expect(validateBatchText(query, resolver).ok).toBe(false);
      expect(computeQueryParseProblems(literal(query), resolver)).toEqual([]);
    }
  });

  it('agrees with Apply on field errors', () => {
    for (const query of [
      'ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т',
      'ВЫБРАТЬ Т.Код КАК Х ИЗ Справочник.Тест КАК Т УПОРЯДОЧИТЬ ПО Т.Нет',
      'ВЫБРАТЬ Т.Код КАК Х ИЗ Справочник.Тест КАК Т ГДЕ Т.Нет = &П',
      'ВЫБРАТЬ Т.Код КАК Х ИЗ Справочник.Тест КАК Т',
    ]) {
      const apply = validateBatchText(query, resolver);
      const problems = computeQueryParseProblems(literal(query), resolver);
      expect(problems.map(p => p.message)).toEqual(apply.ok ? [] : [apply.error]);
    }
  });

  it('checks each literal of a module on its own', () => {
    const source = [
      literal('ВЫБРАТЬ Т.Код КАК Х ИЗ Справочник.Тест КАК Т'),
      literal('ВЫБРАТЬ Т.Нет КАК Х ИЗ Справочник.Тест КАК Т'),
    ].join('\n');
    const problems = computeQueryParseProblems(source, resolver);
    expect(problems).toHaveLength(1);
    expect(problems[0].start).toBe(source.lastIndexOf('ВЫБРАТЬ'));
  });
});
