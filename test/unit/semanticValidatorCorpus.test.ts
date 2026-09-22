/**
 * Semantic-core hardening: false-positive sweep for checkFieldPaths
 * (semanticValidator.ts) against the FULL real 1976-query golden corpus —
 * the same "real corpus more important than synthetic happy-path tests" principle
 * as corpusRegression.test.ts, but for the NEW field-existence diagnostic rather
 * than parse/generate round-trip. Every one of these queries is a real, valid 1C
 * query (harvested from a real configuration and validated by the live 1C oracle
 * — see docs/development/corpus-testing.md); if checkFieldPaths ever reports
 * "Поле ... не найдено" for any of them, that is a genuine false-positive bug in
 * the new check, not evidence the corpus query is wrong.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { validateBatchSemantics, findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';

interface Golden { file: string; valid: boolean; input: string; query_text: string; }

const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');
const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');

const golden: Golden[] = fs.existsSync(GOLDEN)
  ? fs.readFileSync(GOLDEN, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : [];

describe('checkFieldPaths: нуль хибних спрацювань на реальному корпусі 1976 запитів', () => {
  const resolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));

  it('golden-эталон присутствует и непуст', () => {
    expect(golden.length).toBeGreaterThan(0);
  });

  // Review follow-up (2026-09-22): checkFieldPaths раньше проверял только
  // `model.fields`, пропуская `model.trailingFields` целиком (поля после
  // развёрнутой звезды `X.*`). Подтверждаем, что реальные golden-запросы
  // реально наполняют эту ветку — иначе "нуль хибних спрацювань" ниже ничего
  // бы не доказывал (некому было бы их вызвать).
  it('golden-запити реально наповнюють trailingFields (не мертва гілка обходу)', () => {
    let withTrailingFields = 0;
    for (const g of golden) {
      if (!g.valid) continue;
      let doc;
      try {
        doc = parseBatch(g.input, resolver);
      } catch {
        continue;
      }
      for (const member of doc.members) {
        for (const m of member.members) {
          if ((m.model.trailingFields ?? []).length > 0) withTrailingFields++;
        }
      }
    }
    expect(withTrailingFields, 'очікувався принаймні 1 реальний golden-запит з trailingFields').toBeGreaterThan(0);
  });

  // Review follow-up (2026-09-22): checkFieldPaths розширено ще на 5 гілок —
  // СГРУППИРОВАТЬ/УПОРЯДОЧИТЬ/ИТОГИ/ИНДЕКСИРОВАТЬ ПО та агрегат над
  // квалифицированным операндом (funcOperandQualified). Підтверджуємо, що
  // реальні golden-запити виконують КОЖНУ з них (крім totals.groupFields —
  // жоден запит корпусу не використовує квалифицированную ссылку саме в
  // ИТОГИ ПО; ця гілка перевірена вручну через прямий parseBatch-репро в
  // semanticValidator.test.ts, а не корпусом).
  // Review follow-up round 2 (2026-09-22): grouping.groupSets (ГРУППИРУЮЩИМ
  // НАБОРАМ) — теж перевіряється, але жоден запит золотого корпусу цю
  // (рідкісну) SDBL-конструкцію не використовує; ця гілка перевірена лише
  // прямим parseBatch-репро в semanticValidator.test.ts, як і totals.groupFields.
  it('golden-запити реально наповнюють нові гілки checkFieldPaths (окрім totals.groupFields і grouping.groupSets)', () => {
    const coverage = { grouping: 0, orderQualified: 0, indexingQualified: 0, funcOperandQualified: 0 };
    for (const g of golden) {
      if (!g.valid) continue;
      let doc;
      try {
        doc = parseBatch(g.input, resolver);
      } catch {
        continue;
      }
      for (const member of doc.members) {
        for (const m of member.members) {
          const model = m.model;
          if ((model.grouping?.groupFields ?? []).some(f => f.expression === undefined)) coverage.grouping++;
          if ((model.order?.fields ?? []).some(f => f.qualified)) coverage.orderQualified++;
          if ((model.indexing?.indexes ?? []).some(idx => idx.fields.some(f => f.qualified))) coverage.indexingQualified++;
          if ([...model.fields, ...(model.trailingFields ?? [])].some(f => f.funcOperandQualified)) coverage.funcOperandQualified++;
        }
      }
    }
    for (const [branch, count] of Object.entries(coverage)) {
      expect(count, `${branch}: очікувався принаймні 1 реальний golden-запит з цією гілкою`).toBeGreaterThan(0);
    }
  });

  it('жоден реальний запит не дає "Поле ... не найдено"', () => {
    const falsePositives: Array<{ file: string; messages: string[] }> = [];
    for (const g of golden) {
      if (!g.valid) continue;
      let errors;
      try {
        errors = validateBatchSemantics(parseBatch(g.input, resolver), resolver, g.input);
      } catch {
        continue; // не наша забота в этом тесте — только false positives самой field-проверки
      }
      const fieldErrors = errors.filter(e => e.message.includes('Поле "') && e.message.includes('не найдено'));
      if (fieldErrors.length > 0) {
        falsePositives.push({ file: g.file, messages: fieldErrors.map(e => e.message) });
      }
    }
    const preview = falsePositives.slice(0, 20)
      .map(f => `  ${f.file}:\n    ${f.messages.join('\n    ')}`)
      .join('\n');
    expect(falsePositives, `Хибних спрацювань: ${falsePositives.length}\n${preview}`).toEqual([]);
  });

  it('жоден реальний запит не дає "Повторяющийся псевдоним источника" (architecture audit P1 №4, 2026-09-22)', () => {
    const falsePositives: Array<{ file: string; messages: string[] }> = [];
    for (const g of golden) {
      if (!g.valid) continue;
      let errors;
      try {
        errors = validateBatchSemantics(parseBatch(g.input, resolver), resolver, g.input);
      } catch {
        continue;
      }
      const dupSourceErrors = errors.filter(e => e.message.includes('Повторяющийся псевдоним источника'));
      if (dupSourceErrors.length > 0) {
        falsePositives.push({ file: g.file, messages: dupSourceErrors.map(e => e.message) });
      }
    }
    const preview = falsePositives.slice(0, 20)
      .map(f => `  ${f.file}:\n    ${f.messages.join('\n    ')}`)
      .join('\n');
    expect(falsePositives, `Хибних спрацювань: ${falsePositives.length}\n${preview}`).toEqual([]);
  });

  it('жоден реальний запит не дає "Таблица не найдена" (issue #3: .Изменения — 4/1976, 0.2%)', () => {
    // Історична знахідка (PHASE_9, ~v0.1.22): повний прогін по золотому корпусу
    // давав 4 хибних спрацювання на «<Тип>.<Объект>.Изменения» — службовій
    // підтаблиці реєстрації плану обміну, яка не матеріалізується завантажником
    // метаданих НІ ДЛЯ ОДНОГО виду. Відтворено буквально (ті самі 4 файли, той
    // самий текст помилки) перед фіксом у semanticValidator.ts; цей тест фіксує
    // нульовий стан назавжди.
    const falsePositives: Array<{ file: string; messages: string[] }> = [];
    for (const g of golden) {
      if (!g.valid) continue;
      let errors;
      try {
        errors = validateBatchSemantics(parseBatch(g.input, resolver), resolver, g.input);
      } catch {
        continue;
      }
      const tableErrors = errors.filter(e => e.message.includes('Таблица не найдена'));
      if (tableErrors.length > 0) {
        falsePositives.push({ file: g.file, messages: tableErrors.map(e => e.message) });
      }
    }
    const preview = falsePositives.slice(0, 20)
      .map(f => `  ${f.file}:\n    ${f.messages.join('\n    ')}`)
      .join('\n');
    expect(falsePositives, `Хибних спрацювань: ${falsePositives.length}\n${preview}`).toEqual([]);
  });
});

/**
 * Architecture audit P1 №3 (2026-09-22): `findMalformedCustomExpressions`'s
 * traversal used to skip `trailingFields`/`grouping.groupFields`/
 * `totals.totalFields`/`order.fields`/`indexing.indexes[].fields`/
 * `tabSectionFields[].exprFields`/`.columns` entirely — a malformed custom
 * expression in any of them silently passed the Apply-gate. Beyond the usual
 * false-positive sweep, this also asserts the new branches are actually
 * EXERCISED by real corpus queries (not just theoretically reachable) — a
 * zero-false-positive result on code nobody's real query ever hits would prove
 * nothing.
 */
describe('findMalformedCustomExpressions: нове покриття обходу на реальному корпусі', () => {
  function walkDoc(qdoc: { members: { model: import('../../src/core/query/queryModel').QueryModel }[] }, fn: (m: import('../../src/core/query/queryModel').QueryModel) => void): void {
    for (const m of qdoc.members) fn(m.model);
  }

  it('golden-запити реально наповнюють кожну нову гілку обходу (не мертвий код)', () => {
    const coverage = { trailingFields: 0, groupFields: 0, totalFields: 0, orderFields: 0, indexing: 0, builderCondition: 0 };
    for (const g of golden) {
      if (!g.valid) continue;
      let doc;
      try {
        doc = parseBatch(g.input);
      } catch {
        continue;
      }
      for (const member of doc.members) {
        walkDoc(member, model => {
          if ((model.trailingFields ?? []).some(f => f.expression !== undefined)) coverage.trailingFields++;
          if ((model.grouping?.groupFields ?? []).some(f => f.expression !== undefined)) coverage.groupFields++;
          if ((model.totals?.totalFields ?? []).some(f => f.expression !== undefined)) coverage.totalFields++;
          if ((model.order?.fields ?? []).some(f => f.expression !== undefined)) coverage.orderFields++;
          if ((model.indexing?.indexes ?? []).some(idx => idx.fields.some(f => f.expression !== undefined))) coverage.indexing++;
          const builder = model.builder;
          if (builder && [...builder.fields, ...builder.conditions, ...builder.order, ...builder.totals].some(f => f.condition)) {
            coverage.builderCondition++;
          }
        });
      }
    }
    for (const [branch, count] of Object.entries(coverage)) {
      expect(count, `${branch}: очікувався принаймні 1 реальний golden-запит з цією гілкою`).toBeGreaterThan(0);
    }
  });

  it('жоден реальний запит не дає хибних спрацювань на розширеному обході', () => {
    const falsePositives: Array<{ file: string; hits: unknown[] }> = [];
    for (const g of golden) {
      if (!g.valid) continue;
      let doc;
      try {
        doc = parseBatch(g.input);
      } catch {
        continue;
      }
      const hits = findMalformedCustomExpressions(doc);
      if (hits.length > 0) falsePositives.push({ file: g.file, hits });
    }
    const preview = falsePositives.slice(0, 20)
      .map(f => `  ${f.file}:\n    ${JSON.stringify(f.hits)}`)
      .join('\n');
    expect(falsePositives, `Хибних спрацювань: ${falsePositives.length}\n${preview}`).toEqual([]);
  });
});
