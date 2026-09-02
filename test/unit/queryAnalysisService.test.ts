import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyze } from '../../src/core/query/queryAnalysisService';
import { tryOpenBatch } from '../../src/core/query/validateBatch';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';

describe('analyze: разбор полей/источников/соединений/условий/параметров', () => {
  const TEXT =
    'ВЫБРАТЬ\n' +
    '\tКонтрагенты.Ссылка КАК Ссылка,\n' +
    '\tКонтрагенты.Наименование КАК email\n' +
    'ИЗ\n' +
    '\tСправочник.Контрагенты КАК Контрагенты\n' +
    '\t\tЛЕВОЕ СОЕДИНЕНИЕ Справочник.Получатели КАК Получатели\n' +
    '\t\t\tПО Контрагенты.ОсновнойПолучатель = Получатели.Ссылка\n' +
    'ГДЕ\n' +
    '\tКонтрагенты.Ссылка = &Ссылка';

  it('поля: alias + человекочитаемое выражение', () => {
    const r = analyze(TEXT);
    expect(r.diagnostics).toEqual([]);
    expect(r.fields).toEqual([
      { alias: 'Ссылка', expression: 'Контрагенты.Ссылка' },
      { alias: 'email', expression: 'Контрагенты.Наименование' },
    ]);
  });

  it('источники: alias + полное имя', () => {
    const r = analyze(TEXT);
    expect(r.sources).toEqual([
      { alias: 'Контрагенты', fullName: 'Справочник.Контрагенты' },
      { alias: 'Получатели', fullName: 'Справочник.Получатели' },
    ]);
  });

  it('соединения: ключевое слово + псевдонимы сторон', () => {
    const r = analyze(TEXT);
    expect(r.joins).toEqual([
      { keyword: 'ЛЕВОЕ', leftAlias: 'Контрагенты', rightAlias: 'Получатели' },
    ]);
  });

  it('условия: текст условия', () => {
    const r = analyze(TEXT);
    expect(r.conditions).toEqual([{ text: 'Контрагенты.Ссылка = &Ссылка' }]);
  });

  it('параметры: имя + количество использований (по сырому тексту, не только из Condition.param)', () => {
    const r = analyze(TEXT);
    expect(r.parameters).toEqual([{ name: 'Ссылка', usageCount: 1 }]);
  });

  it('невалидный текст → diagnostics с сообщением ошибки, пустые остальные поля', () => {
    const r = analyze('ВЫБРАТЬ ИЗ КАК Поле1 ИЗ Справочник.Контрагенты');
    expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(r.fields).toEqual([]);
    expect(r.sources).toEqual([]);
  });

  it('синтаксическая ошибка: diagnostics несут line/col из сообщения парсера', () => {
    const r = analyze('ВЫБРАТЬ ИЗ КАК Поле1 ИЗ Справочник.Контрагенты');
    expect(r.diagnostics[0].line).toBe(1);
    expect(r.diagnostics[0].col).toBe(9);
  });

  it('семантическая ошибка (таблица не найдена): diagnostics тоже несут line/col', () => {
    const resolver = buildResolverFromTables([
      { fullName: 'Справочник.Валюты', kind: 'Справочник', name: 'Валюты', fields: [{ name: 'Код', kind: 'standard', types: [] }] } as MetaTable,
    ]);
    const r = analyze('ВЫБРАТЬ Валюты.Код КАК Код ИЗ Справочник.Валюты1 КАК Валюты', resolver);
    expect(r.diagnostics.length).toBe(1);
    expect(r.diagnostics[0].line).toBe(1);
    expect(r.diagnostics[0].col).toBe(31);
  });

  it('несколько использований одного параметра считаются все', () => {
    const r = analyze(
      'ВЫБРАТЬ 1 КАК Поле\nИЗ Справочник.Валюты КАК Валюты\nГДЕ Валюты.Код = &Код И Валюты.Наименование <> &Код'
    );
    expect(r.parameters).toEqual([{ name: 'Код', usageCount: 2 }]);
  });
});

describe('analyze/tryOpenBatch parity (design-док, риск п.0.2/0.14; план, стадия 3)', () => {
  // Репрезентативная выборка golden-корпуса (design-док, раздел 21.3.2): байт-в-байт
  // фидельность парсера на ВСЁМ корпусе уже покрывает corpusRegression.test.ts —
  // дублировать это здесь для всех 1976 записей было бы избыточной нагрузкой на CI
  // без дополнительной пользы. Здесь проверяется только СОГЛАСОВАННОСТЬ analyze()
  // с tryOpenBatch (одна и та же корректность/некорректность), а не сама фидельность.
  const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');
  const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');
  const golden: { file: string; input: string }[] = fs.existsSync(GOLDEN)
    ? fs.readFileSync(GOLDEN, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : [];
  // Каждый 100-й запрос корпуса — ~20 записей разной формы (джойны/параметры/ВТ и т.п.).
  const sample = golden.filter((_, i) => i % 100 === 0);

  it('корпус непуст (иначе тест ниже молча ничего не проверяет)', () => {
    expect(sample.length).toBeGreaterThan(5);
  });

  it('analyze().diagnostics пусты ⇔ tryOpenBatch успешен — на репрезентативной выборке', () => {
    for (const g of sample) {
      const opened = tryOpenBatch(g.input);
      const analyzed = analyze(g.input);
      expect(analyzed.diagnostics.length === 0, `${g.file}: analyze/tryOpenBatch разошлись`).toBe(opened.ok);
    }
  });

  it('analyze().diagnostics непусты, когда tryOpenBatch проваливается — на рукописных невалидных запросах', () => {
    const invalid = [
      'ВЫБРАТЬ ИЗ КАК Поле1 ИЗ Справочник.Контрагенты',
      'ВЫБРАТЬ Валюты.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК Валюты, ?ВТ КАК ВТ',
    ];
    for (const text of invalid) {
      const opened = tryOpenBatch(text);
      const analyzed = analyze(text);
      expect(analyzed.diagnostics.length === 0).toBe(opened.ok);
    }
  });
});
