/**
 * Регресс-гейт классификации корпуса (ТЗ v2.1 §33/§35, PR-01).
 *
 * Живьём пересчитывает SUPPORTED/RECOVERED/UNSUPPORTED/INVALID для всех 1976
 * записей `golden.jsonl` и сравнивает с замороженным `corpus-classes.json`
 * (сгенерирован `npm run corpus:classify`, см. заголовок скрипта). Гейт:
 * ни одна запись не должна ПОНИЗИТЬСЯ (SUPPORTED→RECOVERED/UNSUPPORTED/INVALID
 * и т.п.) без явного, осознанного обновления baseline — молчаливое обновление
 * запрещено (§37/§38: "No silent baseline updates").
 *
 * Обновление baseline после ОСОЗНАННОГО изменения парсера/генератора:
 * `npm run corpus:classify` (напечатает diff и объяснит регресс перед перезаписью,
 * `--allow-regressions` требуется явно, если регресс ожидаем и объясним в PR).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import {
  findRawFallbackHits, classify, isDowngrade, formatClassificationDiff,
  type CorpusClassMap, type CorpusClass,
} from '../../tooling/corpus-verify/classification';

interface Golden { file: string; valid: boolean; input: string; query_text: string; }

const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');
const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');
const CLASSES = path.join(CORPUS_DIR, 'corpus-classes.json');

const golden: Golden[] = fs.existsSync(GOLDEN)
  ? fs.readFileSync(GOLDEN, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  : [];

const baseline: CorpusClassMap = fs.existsSync(CLASSES)
  ? (JSON.parse(fs.readFileSync(CLASSES, 'utf8')) as { entries: CorpusClassMap }).entries
  : {};

function classifyLive(): CorpusClassMap {
  const resolver = buildYamlResolver(path.join(CORPUS_DIR, 'metadata', 'cf'));
  const result: CorpusClassMap = {};
  for (const g of golden) {
    let parseError: string | undefined;
    let roundTripMismatch = false;
    let rawFallbackCount = 0;
    try {
      const doc = parseBatch(g.input, resolver);
      rawFallbackCount = findRawFallbackHits(doc).length;
      roundTripMismatch = generateBatch(doc) !== g.query_text;
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
    result[g.file] = { class: classify({ parseError, roundTripMismatch, rawFallbackCount }), rawFallbackCount };
  }
  return result;
}

describe('классификация корпуса: baseline присутствует и покрывает весь golden.jsonl', () => {
  it('golden-корпус непуст', () => {
    expect(golden.length).toBeGreaterThan(0);
  });

  it('corpus-classes.json существует и содержит запись на каждый файл корпуса', () => {
    expect(Object.keys(baseline).length).toBeGreaterThan(0);
    const missing = golden.filter(g => !baseline[g.file]).map(g => g.file);
    expect(missing, `нет baseline-записи для: ${missing.slice(0, 10).join(', ')}`).toEqual([]);
  });
});

describe('SUPPORTED corpus invariant (ТЗ §35): ни одна запись не деградирует молча', () => {
  const live = classifyLive();

  it('живая классификация не содержит РЕГРЕСС относительно baseline', () => {
    const regressions: Array<{ file: string; from: CorpusClass; to: CorpusClass }> = [];
    for (const [file, entry] of Object.entries(baseline)) {
      const current = live[file];
      if (current && isDowngrade(entry.class, current.class)) {
        regressions.push({ file, from: entry.class, to: current.class });
      }
    }
    const report = formatClassificationDiff(baseline, live);
    expect(
      regressions,
      `Обнаружен регресс классификации (${regressions.length}) — baseline нужно обновить осознанно ` +
        `через "npm run corpus:classify" с объяснением в PR, а не молча.\n\n${report}`,
    ).toEqual([]);
  });

  it('ни одна запись сегодняшнего корпуса не классифицирована как UNSUPPORTED/INVALID', () => {
    // Текущий корпус — уже прошедшие oracle-приёмку записи (harvest → accept:oracle →
    // corpus:snapshot), поэтому сегодня это должно быть пусто. Не «заморожено навечно» —
    // если сюда попадёт запись, это самостоятельный, требующий explanation факт,
    // а не повод менять эту проверку без объяснения.
    const bad = Object.entries(live)
      .filter(([, e]) => e.class === 'UNSUPPORTED' || e.class === 'INVALID')
      .map(([file, e]) => `${file}: ${e.class}`);
    expect(bad).toEqual([]);
  });
});
