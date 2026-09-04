/**
 * Virtual table round-trip verification (PR-04, ТЗ v2.1 §31/§54 P0.4).
 *
 * Паттерн: parse → (несвязанная правка модели, как сделал бы визуальный
 * конструктор) → generate. Классификация каждой формы:
 *   LOSSLESS       — параметры виртуальной таблицы переживают цикл без потерь.
 *   FORMATTING ONLY — значения сохранены, но точный текст может отличаться
 *                     (напр. лишняя пустая позиция) — не потеря данных.
 *   SEMANTIC LOSS  — хотя бы один параметр молча пропадает.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { findUnsafeVirtualTables } from '../../src/core/query/semanticValidator';
import type { BatchDocument } from '../../src/core/query/batchModel';

/** Первая (единственная в фикстурах этого файла) виртуальная таблица разобранного пакета. */
function firstTable(doc: BatchDocument) {
  return doc.members[0].members[0].model.tables[0];
}

/** Несвязанная правка: добавляет ещё одно простое поле выборки к первой модели
 * пакета — имитация того, что пользователь в конструкторе добавил колонку,
 * никак не трогая саму виртуальную таблицу-источник. */
function withUnrelatedFieldAdded(doc: BatchDocument): BatchDocument {
  const model = doc.members[0].members[0].model;
  const tableId = model.tables[0].id;
  return {
    members: [{
      members: [{
        ...doc.members[0].members[0],
        model: { ...model, fields: [...model.fields, { tableId, path: 'НеСвязанноеПоле' }] },
      }],
    }],
  };
}

function roundTripWithUnrelatedEdit(text: string): string {
  return generateBatch(withUnrelatedFieldAdded(parseBatch(text)));
}

describe('VT round-trip — LOSSLESS (несвязанная правка не трогает параметры ВТ)', () => {
  const cases: Array<[string, string]> = [
    ['РегистрНакопления.Остатки', 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т'],
    ['РегистрНакопления.Обороты', 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.Обороты(&Начало, &Конец, Месяц, ИСТИНА) КАК Т'],
    ['РегистрСведений.СрезПоследних', 'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&Дата, ИСТИНА) КАК Т'],
    // 3-я позиция — ВидыСубконто (PR-04: раньше был безымянным null-слотом,
    // любое значение здесь молча пропадало при generate — теперь subcontoTypes).
    ['РегистрБухгалтерии.Остатки (+ ВидыСубконто, PR-04 fix)', 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.Остатки(&Дата, &УсловиеСчета, ИСТИНА, &Условие) КАК Т'],
    ['РегистрБухгалтерии.Обороты (+ ВидыСубконто с обеих сторон corr, PR-04 fix)', 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.Обороты(&Начало, &Конец, Месяц, &УсловиеСчета, ИСТИНА, &Условие, &УсловиеКорСчета, ЛОЖЬ) КАК Т'],
    ['РегистрБухгалтерии.ОборотыДтКт (+ ВидыСубконто Дт/Кт, PR-04 fix)', 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.ОборотыДтКт(&Начало, &Конец, Месяц, &УсловиеДт, ИСТИНА, &УсловиеКт, ЛОЖЬ, &Условие) КАК Т'],
    ['РегистрБухгалтерии.Субконто (PR-04 fix)', 'ВЫБРАТЬ Т.Период ИЗ РегистрБухгалтерии.ХозОперации.Субконто(&Период, &УсловиеСчета) КАК Т'],
  ];

  for (const [label, text] of cases) {
    it(label, () => {
      const out = roundTripWithUnrelatedEdit(text);
      // Все аргументы исходного вызова ВТ должны присутствовать в выводе —
      // сравниваем множество параметров, а не байт-в-байт (несвязанная правка
      // и канонический форматтер меняют остальной текст законно).
      const vtCallIn = text.match(/\(([^)]*)\)/)![1];
      const vtCallOut = out.match(/\(([^)]*)\)/)![1];
      for (const param of vtCallIn.split(',').map(s => s.trim()).filter(Boolean)) {
        expect(vtCallOut, `параметр "${param}" пропал из "${vtCallIn}" → "${vtCallOut}"`).toContain(param);
      }
      // Несвязанное поле реально появилось — подтверждает, что правка была настоящей.
      expect(out).toContain('НеСвязанноеПоле');
    });
  }
});

describe('VT round-trip — SEMANTIC LOSS (подтверждённые, известные границы)', () => {
  it('РегистрРасчета.*.ДанныеГрафика: ≤2 аргумента — LOSSLESS, 3-й аргумент — теряется молча', () => {
    const twoArgs = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б) КАК Т';
    const twoArgsDoc = parseBatch(twoArgs);
    expect(generateBatch(twoArgsDoc)).toContain('&А, &Б');
    // ≤2 аргумента — раскладка [period, condition] полная, unsafeExtraArgs НЕ ставится
    // (иначе Apply блокировал бы безопасные запросы — см. findUnsafeVirtualTables).
    expect(firstTable(twoArgsDoc).virtual?.unsafeExtraArgs).toBeUndefined();

    const threeArgs = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК Т';
    const threeArgsDoc = parseBatch(threeArgs);
    const out = generateBatch(threeArgsDoc);
    expect(out, 'известная, ещё не исправленная потеря 3-го параметра — см. docs/KNOWN_ISSUES.md').not.toContain('&В');
    // PR-05 (ТЗ §54 P0.5): потерянный аргумент помечен для Apply-blocking.
    expect(firstTable(threeArgsDoc).virtual?.unsafeExtraArgs).toBe(true);
    expect(findUnsafeVirtualTables(threeArgsDoc)).toEqual(['РегистрРасчета.Начисления.ДанныеГрафика']);
  });

  it('РегистрРасчета.*.ФактическийПериодДействия: тот же класс потери на 3-м аргументе', () => {
    const threeArgs = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ФактическийПериодДействия(&А, &Б, &В) КАК Т';
    const doc = parseBatch(threeArgs);
    const out = generateBatch(doc);
    expect(out).not.toContain('&В');
    expect(firstTable(doc).virtual?.unsafeExtraArgs).toBe(true);
    expect(findUnsafeVirtualTables(doc)).toHaveLength(1);
  });
});

describe('VT round-trip — FORMATTING ONLY (значение сохранено, текст может отличаться)', () => {
  it('Последовательность.*.Границы с одним аргументом: значение на месте, но появляется пустая позиция', () => {
    const oneArg = 'ВЫБРАТЬ Т.Период ИЗ Последовательность.Тест.Границы(&А) КАК Т';
    const doc = parseBatch(oneArg);
    const out = generateBatch(doc);
    expect(out).toContain('&А'); // значение НЕ потеряно
    // Не byte-identical (генератор добавляет пустую вторую позицию) — задокументировано
    // как формат-квирк, не потеря данных; не входит в SUPPORTED corpus (маленькие
    // синтетические фикстуры этого файла, не golden.jsonl).
    expect(firstTable(doc).virtual?.unsafeExtraArgs).toBeUndefined();
  });
});
