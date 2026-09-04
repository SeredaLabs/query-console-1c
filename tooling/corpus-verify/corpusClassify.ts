/**
 * Классификация корпуса (ТЗ v2.1, §33 "Corpus classification", PR-01) — вычисляет
 * SUPPORTED/RECOVERED/UNSUPPORTED/INVALID для каждой записи `test/fixtures/corpus/
 * golden.jsonl` и перезаписывает закоммиченный baseline `corpus-classes.json`.
 *
 * НЕ меняет production-поведение парсера/генератора — читает уже закоммиченный
 * корпус и метаданные, ничего не harvest'ит заново (в отличие от `corpus:snapshot`).
 *
 * Перед перезаписью печатает diff против текущего baseline (§37/§38 ТЗ — никаких
 * молчаливых обновлений). Любой РЕГРЕСС (SUPPORTED и сильнее → более слабый класс)
 * возвращает ненулевой exit code, если явно не передан --allow-regressions.
 *
 * Запуск: node out/corpus-verify/corpusClassify.js [--check] [--allow-regressions]
 *   --check              не перезаписывать corpus-classes.json, только напечатать diff
 *                         и вернуть ненулевой код при любом расхождении с текущим файлом.
 *   --allow-regressions   разрешить перезапись даже при обнаруженном регрессе класса.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { findRawFallbackHits, classify, formatClassificationDiff, type CorpusClassMap } from './classification';

interface Golden { file: string; valid: boolean; input: string; query_text: string; }

const CORPUS_DIR = path.resolve('test/fixtures/corpus');
const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');
const CLASSES = path.join(CORPUS_DIR, 'corpus-classes.json');

function loadGolden(): Golden[] {
  if (!fs.existsSync(GOLDEN)) { console.error(`Нет ${GOLDEN}`); process.exit(1); }
  return fs.readFileSync(GOLDEN, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

function loadExistingClasses(): CorpusClassMap {
  if (!fs.existsSync(CLASSES)) return {};
  return (JSON.parse(fs.readFileSync(CLASSES, 'utf8')) as { entries: CorpusClassMap }).entries ?? {};
}

function classifyAll(golden: Golden[]): CorpusClassMap {
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

function summarize(map: CorpusClassMap): Record<string, number> {
  const summary: Record<string, number> = { SUPPORTED: 0, RECOVERED: 0, UNSUPPORTED: 0, INVALID: 0 };
  for (const e of Object.values(map)) summary[e.class]++;
  return summary;
}

function run(): void {
  const checkOnly = process.argv.includes('--check');
  const allowRegressions = process.argv.includes('--allow-regressions');

  const golden = loadGolden();
  const before = loadExistingClasses();
  const after = classifyAll(golden);

  const diff = formatClassificationDiff(before, after);
  console.log(diff);
  console.log('Итог по классам:', JSON.stringify(summarize(after)));

  const hasAnyChange = diff.trim() !== '' && !diff.includes('Baseline не изменился');
  const hasRegression = /Из них РЕГРЕСС.*: (?!0\b)\d/.test(diff);

  if (hasRegression && !allowRegressions) {
    console.error('\nОбнаружен регресс класса без --allow-regressions — baseline НЕ обновлён.');
    process.exit(1);
  }

  if (checkOnly) {
    process.exit(hasAnyChange ? 1 : 0);
  }

  const payload = { entries: after, summary: summarize(after) };
  fs.writeFileSync(CLASSES, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`\nBaseline записан: ${CLASSES}`);
}

if (require.main === module) run();
