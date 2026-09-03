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
    expect(r.tempTables).toEqual([]); // одиночный запрос без ПОМЕСТИТЬ — это result, а не временная таблица
    expect(r.result?.fields).toEqual([
      { alias: 'Ссылка', expression: 'Контрагенты.Ссылка' },
      { alias: 'email', expression: 'Контрагенты.Наименование' },
    ]);
  });

  it('источники: alias + полное имя', () => {
    const r = analyze(TEXT);
    expect(r.result?.sources).toEqual([
      { alias: 'Контрагенты', fullName: 'Справочник.Контрагенты' },
      { alias: 'Получатели', fullName: 'Справочник.Получатели' },
    ]);
  });

  it('соединения: ключевое слово + псевдонимы сторон', () => {
    const r = analyze(TEXT);
    expect(r.result?.joins).toEqual([
      { keyword: 'ЛЕВОЕ', leftAlias: 'Контрагенты', rightAlias: 'Получатели' },
    ]);
  });

  it('условия: текст условия', () => {
    const r = analyze(TEXT);
    expect(r.result?.conditions).toEqual([{ text: 'Контрагенты.Ссылка = &Ссылка' }]);
  });

  it('параметры: имя + количество использований (по сырому тексту, не только из Condition.param)', () => {
    const r = analyze(TEXT);
    expect(r.parameters).toEqual([{ name: 'Ссылка', usageCount: 1 }]);
  });

  it('невалидный текст → diagnostics с сообщением ошибки, пустой result', () => {
    const r = analyze('ВЫБРАТЬ ИЗ КАК Поле1 ИЗ Справочник.Контрагенты');
    expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(r.result).toBeNull();
    expect(r.tempTables).toEqual([]);
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

describe('analyze: пакетные запросы (ПОМЕСТИТЬ/ДОБАВИТЬ, несколько ;-блоков)', () => {
  // Реальные отчётные запросы 1С почти всегда состоят из нескольких временных
  // таблиц + финального запроса — v1 показывал только ПЕРВЫЙ ;-блок, что вводило
  // в заблуждение (пользовательский баг-репорт на реальном 11-блочном запросе).
  const BATCH =
    'ВЫБРАТЬ\n\tВалюты.Ссылка КАК Ссылка\nПОМЕСТИТЬ ВТ_Валюты\nИЗ\n\tСправочник.Валюты КАК Валюты\n' +
    ';\n\n' + '/'.repeat(80) + '\n' +
    'ВЫБРАТЬ\n\tВТ_Валюты.Ссылка КАК Ссылка\nИЗ\n\tВТ_Валюты КАК ВТ_Валюты\nГДЕ\n\tВТ_Валюты.Ссылка = &Ссылка';

  it('result — это ПОСЛЕДНИЙ запрос пакета (что реально возвращает Запрос.Выполнить())', () => {
    const r = analyze(BATCH);
    expect(r.diagnostics).toEqual([]);
    expect(r.result?.sources).toEqual([{ alias: 'ВТ_Валюты', fullName: 'ВТ_Валюты' }]);
  });

  it('tempTables содержит все ;-блоки ДО последнего, под именем временной таблицы', () => {
    const r = analyze(BATCH);
    expect(r.tempTables).toHaveLength(1);
    expect(r.tempTables[0].name).toBe('ВТ_Валюты');
    expect(r.tempTables[0].sources).toEqual([{ alias: 'Валюты', fullName: 'Справочник.Валюты' }]);
  });

  it('параметры считаются по ВСЕМУ пакету, а не только по последнему ;-блоку', () => {
    const r = analyze(BATCH);
    expect(r.parameters).toEqual([{ name: 'Ссылка', usageCount: 1 }]);
  });

  it('textRange у result/tempTables — непересекающиеся диапазоны СВОИХ ;-блоков (навигация не должна путать блоки)', () => {
    // Регресс на баг-репорт: клик по полю в «Результате» находил одноимённое поле
    // в чужом временном блоке, потому что навигация искала по всему тексту пакета.
    const r = analyze(BATCH);
    const tt = r.tempTables[0];
    const res = r.result!;
    expect(tt.textRange).toBeDefined();
    expect(res.textRange).toBeDefined();
    expect(tt.textRange!.end).toBeLessThanOrEqual(res.textRange!.start);
    expect(BATCH.slice(tt.textRange!.start, tt.textRange!.end)).toContain('ПОМЕСТИТЬ ВТ_Валюты');
    expect(BATCH.slice(tt.textRange!.start, tt.textRange!.end)).not.toContain('&Ссылка');
    expect(BATCH.slice(res.textRange!.start, res.textRange!.end)).toContain('&Ссылка');
    expect(BATCH.slice(res.textRange!.start, res.textRange!.end)).not.toContain('ПОМЕСТИТЬ');
  });

  it('одиночный запрос без ПОМЕСТИТЬ — result без временных таблиц (обычный случай не меняется)', () => {
    const r = analyze('ВЫБРАТЬ Валюты.Код ИЗ Справочник.Валюты КАК Валюты');
    expect(r.tempTables).toEqual([]);
    expect(r.result?.sources).toEqual([{ alias: 'Валюты', fullName: 'Справочник.Валюты' }]);
  });

  it('ОБЪЕДИНИТЬ внутри ПОМЕСТИТЬ-блока: имя временной таблицы у ОБЕИХ ветвей, не только первой', () => {
    // Регресс конкретно на баг, найденный вручную: парсер ставит tempTableName только
    // на первую ветвь UnionMember — вторая ветвь не должна из-за этого «терять» ВТ в имени.
    //
    // Известная неточность (сознательно не решается сейчас — редкий случай): «result» =
    // последний запрос ВСЕГО пакета, без знания о том, что обе ветви ОБЪЕДИНИТЬ питают
    // ОДНУ временную таблицу. Если ПОМЕСТИТЬ+ОБЪЕДИНИТЬ — ПОСЛЕДНИЙ и единственный блок
    // пакета (как здесь, без завершающего обычного ВЫБРАТЬ), вторая ветвь попадёт в
    // `result`, а не в `tempTables`, хотя семантически обе ветви — один временный блок.
    // В реальных отчётных запросах (см. пользовательский пример) временная таблица
    // почти всегда не последняя — после неё идёт обычный ВЫБРАТЬ-результат, и этот
    // случай не возникает.
    const text =
      'ВЫБРАТЬ\n\tВалюты.Ссылка КАК Ссылка\nПОМЕСТИТЬ ВТ_Тест\nИЗ\n\tСправочник.Валюты КАК Валюты\n' +
      '\nОБЪЕДИНИТЬ ВСЕ\n\n' +
      'ВЫБРАТЬ\n\tБанки.Ссылка\nИЗ\n\tСправочник.Банки КАК Банки';
    const r = analyze(text);
    expect(r.result?.name).toBe('ВТ_Тест · Запрос 2');
    expect(r.tempTables.map(t => t.name)).toEqual(['ВТ_Тест · Запрос 1']);
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

  // queryLinter (advisory-предупреждения о качестве) — smoke-прогон по той же выборке:
  // проверяем только отсутствие падений, НЕ «ноль предупреждений» — реальные запросы
  // корпуса вполне законно могут содержать ПОЛНОЕ соединение и т.п.
  it('warnings не падает на репрезентативной выборке корпуса', () => {
    for (const g of sample) {
      expect(() => analyze(g.input), g.file).not.toThrow();
    }
  });
});
