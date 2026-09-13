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
    // Раскладка регистра расчета подтверждена (Хрусталёва, «Язык запросов
    // "1С:Предприятия 8"», 2-е изд., с. 327-334) — semantic-core roadmap
    // follow-up (memory: project-semantic-core-roadmap), не PR-04/05.
    ['РегистрРасчета.ФактическийПериодДействия (арность 1, подтверждено)', 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ФактическийПериодДействия(Регистратор = &Регистратор) КАК Т'],
    ['РегистрРасчета.ДанныеГрафика (арность 1, подтверждено)', 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(Регистратор = &Регистратор) КАК Т'],
    ['РегистрРасчета.База<Имя> (арность 4, подтверждено)', 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.БазаНачисленияБазовые(&ИзмОсн, &ИзмБаза, &Разрезы, ИСТИНА) КАК Т'],
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
  // ОБНОВЛЕНО (semantic-core roadmap follow-up, memory:
  // project-semantic-core-roadmap): раскладка ДанныеГрафика/
  // ФактическийПериодДействия подтверждена — арность РІВНО 1 (Условие), а не
  // [period, condition] (арность 2), як вважалося раніше. Поріг "зайвого"
  // аргументу тепер коректно 1, а не 2.
  it('РегистрРасчета.*.ДанныеГрафика: 1 аргумент — LOSSLESS, 2-й аргумент — помечается unsafe и теряется', () => {
    const oneArg = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А) КАК Т';
    const oneArgDoc = parseBatch(oneArg);
    expect(generateBatch(oneArgDoc)).toContain('&А');
    expect(firstTable(oneArgDoc).virtual?.unsafeExtraArgs).toBeUndefined();

    const twoArgs = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б) КАК Т';
    const twoArgsDoc = parseBatch(twoArgs);
    const out = generateBatch(twoArgsDoc);
    expect(out, 'подтверждённая арность 1 — 2-й аргумент вне модели, теряется').not.toContain('&Б');
    // PR-05 (ТЗ §54 P0.5): потерянный аргумент помечен для Apply-blocking.
    expect(firstTable(twoArgsDoc).virtual?.unsafeExtraArgs).toBe(true);
    expect(findUnsafeVirtualTables(twoArgsDoc)).toEqual(['РегистрРасчета.Начисления.ДанныеГрафика']);
  });

  it('РегистрРасчета.*.ФактическийПериодДействия: тот же класс потери на 2-м аргументе', () => {
    const twoArgs = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ФактическийПериодДействия(&А, &Б) КАК Т';
    const doc = parseBatch(twoArgs);
    const out = generateBatch(doc);
    expect(out).not.toContain('&Б');
    expect(firstTable(doc).virtual?.unsafeExtraArgs).toBe(true);
    expect(findUnsafeVirtualTables(doc)).toHaveLength(1);
  });

  it('РегистрРасчета.База<Имя>: 4 аргумента — LOSSLESS, 5-й — помечается unsafe и теряется', () => {
    const fourArgs = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.БазаНачисленияБазовые(&А, &Б, &В, &Г) КАК Т';
    const fourArgsDoc = parseBatch(fourArgs);
    const outFour = generateBatch(fourArgsDoc);
    expect(outFour).toContain('&А, &Б, &В, &Г');
    expect(firstTable(fourArgsDoc).virtual?.unsafeExtraArgs).toBeUndefined();

    const fiveArgs = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.БазаНачисленияБазовые(&А, &Б, &В, &Г, &Д) КАК Т';
    const fiveArgsDoc = parseBatch(fiveArgs);
    const outFive = generateBatch(fiveArgsDoc);
    expect(outFive).not.toContain('&Д');
    expect(firstTable(fiveArgsDoc).virtual?.unsafeExtraArgs).toBe(true);
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
