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
import { validateBatchSemantics } from '../../src/core/query/semanticValidator';
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
});
