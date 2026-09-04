import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import {
  findRawFallbackHits, classify, isDowngrade, formatClassificationDiff, type CorpusClassMap,
} from '../../tooling/corpus-verify/classification';

describe('findRawFallbackHits', () => {
  it('запрос без единого custom-узла — ноль попаданий', () => {
    const doc = parseBatch('ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ГДЕ Т1.Код = &Код');
    expect(findRawFallbackHits(doc)).toEqual([]);
  });

  it('произвольное условие ГДЕ (custom) — одно попадание kind:condition', () => {
    const doc = parseBatch('ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ГДЕ Т1.Код = &А ИЛИ Т1.Код = &Б');
    const hits = findRawFallbackHits(doc);
    expect(hits.some(h => h.kind === 'condition')).toBe(true);
  });

  it('произвольное выражение в списке полей — попадание kind:field', () => {
    const doc = parseBatch('ВЫБРАТЬ ВЫБОР КОГДА Т1.Код = 1 ТОГДА "А" ИНАЧЕ "Б" КОНЕЦ КАК Поле1 ИЗ Справочник.Т1 КАК Т1');
    const hits = findRawFallbackHits(doc);
    expect(hits.some(h => h.kind === 'field')).toBe(true);
  });

  it('произвольное условие соединения (ПО) — попадание kind:join или kind:joinCondition', () => {
    const doc = parseBatch(
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ' +
      'ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = &Парам'
    );
    const hits = findRawFallbackHits(doc);
    expect(hits.some(h => h.kind === 'join' || h.kind === 'joinCondition')).toBe(true);
  });

  it('находит custom-узел внутри вложенного подзапроса-источника', () => {
    const doc = parseBatch(
      'ВЫБРАТЬ Т.Код ИЗ (ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ГДЕ Т1.Код = &А ИЛИ Т1.Код = &Б) КАК Т'
    );
    const hits = findRawFallbackHits(doc);
    expect(hits.some(h => h.kind === 'condition')).toBe(true);
  });
});

describe('classify', () => {
  it('parseError — всегда INVALID независимо от прочих полей', () => {
    expect(classify({ parseError: 'boom', roundTripMismatch: true, rawFallbackCount: 5 })).toBe('INVALID');
  });

  it('round-trip не совпал (и нет parseError) — UNSUPPORTED', () => {
    expect(classify({ roundTripMismatch: true, rawFallbackCount: 0 })).toBe('UNSUPPORTED');
  });

  it('успешный round-trip, ни одного raw-узла — SUPPORTED', () => {
    expect(classify({ roundTripMismatch: false, rawFallbackCount: 0 })).toBe('SUPPORTED');
  });

  it('успешный round-trip, хотя бы один raw-узел — RECOVERED', () => {
    expect(classify({ roundTripMismatch: false, rawFallbackCount: 1 })).toBe('RECOVERED');
  });
});

describe('isDowngrade', () => {
  it('SUPPORTED → RECOVERED — регресс', () => {
    expect(isDowngrade('SUPPORTED', 'RECOVERED')).toBe(true);
  });
  it('RECOVERED → SUPPORTED — НЕ регресс (улучшение)', () => {
    expect(isDowngrade('RECOVERED', 'SUPPORTED')).toBe(false);
  });
  it('SUPPORTED → INVALID — регресс', () => {
    expect(isDowngrade('SUPPORTED', 'INVALID')).toBe(true);
  });
  it('одинаковый класс — не регресс', () => {
    expect(isDowngrade('SUPPORTED', 'SUPPORTED')).toBe(false);
  });
});

describe('formatClassificationDiff', () => {
  it('пустой diff при идентичных baseline', () => {
    const map: CorpusClassMap = { 'a.txt': { class: 'SUPPORTED', rawFallbackCount: 0 } };
    expect(formatClassificationDiff(map, map)).toContain('Baseline не изменился');
  });

  it('обнаруживает регресс SUPPORTED → RECOVERED и помечает его отдельно от улучшений', () => {
    const before: CorpusClassMap = {
      'a.txt': { class: 'SUPPORTED', rawFallbackCount: 0 },
      'b.txt': { class: 'RECOVERED', rawFallbackCount: 1 },
    };
    const after: CorpusClassMap = {
      'a.txt': { class: 'RECOVERED', rawFallbackCount: 1 },
      'b.txt': { class: 'SUPPORTED', rawFallbackCount: 0 },
    };
    const report = formatClassificationDiff(before, after);
    expect(report).toContain('РЕГРЕСС');
    expect(report).toContain('a.txt');
    expect(report).toMatch(/Из них РЕГРЕСС.*: 1/);
  });

  it('новые/исчезнувшие файлы отражены отдельно от transitions', () => {
    const before: CorpusClassMap = { 'a.txt': { class: 'SUPPORTED', rawFallbackCount: 0 } };
    const after: CorpusClassMap = {
      'a.txt': { class: 'SUPPORTED', rawFallbackCount: 0 },
      'new.txt': { class: 'SUPPORTED', rawFallbackCount: 0 },
    };
    const report = formatClassificationDiff(before, after);
    expect(report).toContain('Добавлено записей: 1');
    expect(report).toContain('new.txt');
  });
});
