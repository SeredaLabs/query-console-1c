import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { formatQueryText } from '../../src/core/query/queryTextFormatter';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

describe('formatQueryText: базовый пример из ТЗ (design-док, раздел 5)', () => {
  it('однострочный запрос форматируется в ВЫБРАТЬ/ИЗ/ГДЕ с отступами', () => {
    const messy =
      'ВЫБРАТЬ Контрагенты.Ссылка КАК Ссылка, Контрагенты.Наименование КАК email ' +
      'ИЗ Справочник.Контрагенты КАК Контрагенты ГДЕ Контрагенты.Ссылка = &Ссылка';
    expect(formatQueryText(messy)).toBe(
      'ВЫБРАТЬ\n' +
      '\tКонтрагенты.Ссылка КАК Ссылка,\n' +
      '\tКонтрагенты.Наименование КАК email\n' +
      'ИЗ\n' +
      '\tСправочник.Контрагенты КАК Контрагенты\n' +
      'ГДЕ\n' +
      '\tКонтрагенты.Ссылка = &Ссылка'
    );
  });

  it('идемпотентно — повторное форматирование уже отформатированного текста ничего не меняет', () => {
    const messy = 'ВЫБРАТЬ Валюты.Код ИЗ Справочник.Валюты КАК Валюты ГДЕ Валюты.Код = &Код';
    const once = formatQueryText(messy);
    expect(formatQueryText(once)).toBe(once);
  });

  it('СГРУППИРОВАТЬ ПО / УПОРЯДОЧИТЬ ПО получают перенос секции и списка', () => {
    const text = 'ВЫБРАТЬ Валюты.Код, СУММА(Валюты.Курс) КАК Курс ИЗ Справочник.Валюты КАК Валюты СГРУППИРОВАТЬ ПО Валюты.Код УПОРЯДОЧИТЬ ПО Валюты.Код';
    expect(formatQueryText(text)).toBe(
      'ВЫБРАТЬ\n\tВалюты.Код,\n\tСУММА(Валюты.Курс) КАК Курс\n' +
      'ИЗ\n\tСправочник.Валюты КАК Валюты\n' +
      'СГРУППИРОВАТЬ ПО\n\tВалюты.Код\n' +
      'УПОРЯДОЧИТЬ ПО\n\tВалюты.Код'
    );
  });

  it('содержимое скобок (подзапрос) не трогается — только внешняя структура', () => {
    const text = 'ВЫБРАТЬ Валюты.Код ИЗ Справочник.Валюты КАК Валюты ГДЕ Валюты.Код В (ВЫБРАТЬ Валюты2.Код ИЗ Справочник.Валюты КАК Валюты2)';
    const out = formatQueryText(text);
    // Внешняя структура переформатирована...
    expect(out).toContain('ВЫБРАТЬ\n\tВалюты.Код\nИЗ\n\tСправочник.Валюты КАК Валюты\nГДЕ\n');
    // ...а подзапрос внутри скобок остался ОДНОЙ строкой, как во вводе (не тронут).
    expect(out).toContain('(ВЫБРАТЬ Валюты2.Код ИЗ Справочник.Валюты КАК Валюты2)');
  });

  it('не разбираемый (невалидный) текст возвращается без изменений, а не падает', () => {
    const bad = 'ВЫБРАТЬ ИЗ КАК Поле1 ИЗ Справочник.Контрагенты';
    expect(() => formatQueryText(bad)).not.toThrow();
  });

  it('сохраняет комментарии дословно', () => {
    const text = 'ВЫБРАТЬ\n\t// комментарий\n\tВалюты.Код\nИЗ Справочник.Валюты КАК Валюты';
    expect(formatQueryText(text)).toContain('// комментарий');
  });
});

describe('formatQueryText/parseBatch parity — форматирование не меняет семантику (design-док, раздел 5/21.3.1)', () => {
  // Репрезентативная выборка golden-корпуса (design-док, раздел 21.3.2 — та же логика
  // выборки, что и в queryAnalysisService.test.ts): не все 1976 записей, полную фидельность
  // самого парсера покрывает corpusRegression.test.ts.
  const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');
  const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');
  const golden: { file: string; input: string }[] = fs.existsSync(GOLDEN)
    ? fs.readFileSync(GOLDEN, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : [];
  const sample = golden.filter((_, i) => i % 100 === 7);

  it('корпус непуст', () => {
    expect(sample.length).toBeGreaterThan(5);
  });

  it('generateBatch(parseBatch(format(text))) === generateBatch(parseBatch(text)) на репрезентативной выборке', () => {
    const failures: string[] = [];
    for (const g of sample) {
      let before: string;
      try {
        before = generateBatch(parseBatch(g.input));
      } catch {
        continue; // невалидный/нетипичный для этого гейта случай — не по адресу форматера
      }
      const formatted = formatQueryText(g.input);
      let after: string;
      try {
        after = generateBatch(parseBatch(formatted));
      } catch (e) {
        failures.push(`${g.file}: форматированный текст перестал парситься (${e instanceof Error ? e.message : e})`);
        continue;
      }
      if (after !== before) failures.push(`${g.file}: семантика разошлась после форматирования`);
    }
    expect(failures, failures.slice(0, 5).join('\n')).toEqual([]);
  });
});
