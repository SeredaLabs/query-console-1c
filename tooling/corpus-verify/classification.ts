import type { BatchDocument } from '../../src/core/query/batchModel';
import type { QueryDocument } from '../../src/core/query/unionModel';
import type { QueryModel, Condition } from '../../src/core/query/queryModel';

/**
 * Уровень поддержки корпусной записи (ТЗ v2.1, §33 "Corpus classification").
 *
 * НЕ определяется механически через valid=true/false или custom=true/false
 * по одному узлу (§33 явно это запрещает) — SUPPORTED/RECOVERED различаются по
 * тому, есть ли ХОТЬ ОДИН узел модели, сохранённый через "сырой"/custom fallback,
 * при этом запись всё равно обязана пройти байт-в-байт round-trip (иначе она
 * UNSUPPORTED/INVALID, см. classify()). custom=true сам по себе не является
 * потерей — просто не полностью структурным пониманием конструкции.
 */
export type CorpusClass = 'SUPPORTED' | 'RECOVERED' | 'UNSUPPORTED' | 'INVALID';

/** Один узел модели, попавший в "сырой"/custom fallback — для документирования,
 * почему запись RECOVERED, а не SUPPORTED (не для UI, только для отчёта/диагностики). */
export interface RawFallbackHit {
  kind: 'condition' | 'joinCondition' | 'join' | 'field' | 'totalGroupField';
  detail: string;
}

function walkConditions(conditions: Condition[] | undefined, hits: RawFallbackHit[]): void {
  for (const c of conditions ?? []) {
    if (c.custom) hits.push({ kind: 'condition', detail: c.expression ?? '' });
    if (c.subquery) walkDocument(c.subquery, hits);
  }
}

function walkModel(model: QueryModel, hits: RawFallbackHit[]): void {
  for (const t of model.tables) {
    if (t.subquery) walkDocument(t.subquery, hits);
  }
  for (const j of model.joins ?? []) {
    if (j.custom) hits.push({ kind: 'join', detail: j.expression ?? '' });
    for (const c of j.conditions ?? []) {
      if (c.custom) hits.push({ kind: 'joinCondition', detail: c.expression ?? '' });
    }
  }
  for (const f of model.fields) {
    if (f.expression) hits.push({ kind: 'field', detail: f.expression });
  }
  for (const f of model.totals?.groupFields ?? []) {
    if (f.expression) hits.push({ kind: 'totalGroupField', detail: f.expression });
  }
  walkConditions(model.conditions, hits);
  walkConditions(model.having, hits);
}

function walkDocument(qdoc: QueryDocument, hits: RawFallbackHit[]): void {
  for (const member of qdoc.members) walkModel(member.model, hits);
}

/**
 * Найти все узлы, сохранённые через "сырой"/custom fallback (Condition/JoinCondition/
 * Join.custom, непрозрачное expression поля выборки/группировочного поля итогов) —
 * по всему пакету, рекурсивно по вложенным подзапросам (источники, условия В (...)).
 */
export function findRawFallbackHits(batch: BatchDocument): RawFallbackHit[] {
  const hits: RawFallbackHit[] = [];
  for (const doc of batch.members) walkDocument(doc, hits);
  return hits;
}

/**
 * Итоговая классификация одной корпусной записи. Чистая функция от уже вычисленных
 * фактов (parse/round-trip делает вызывающий код — см. corpusClassify.ts CLI и
 * corpusClassification.test.ts) — здесь только сама решающая таблица, без I/O.
 */
export function classify(input: {
  /** Сообщение исключения парсера, если parseBatch бросил — иначе undefined. */
  parseError?: string;
  /** generateBatch(parseBatch(input)) !== ожидаемый query_text. */
  roundTripMismatch: boolean;
  rawFallbackCount: number;
}): CorpusClass {
  if (input.parseError !== undefined) return 'INVALID';
  if (input.roundTripMismatch) return 'UNSUPPORTED';
  return input.rawFallbackCount > 0 ? 'RECOVERED' : 'SUPPORTED';
}

/** Один файл в замороженном baseline-артефакте (`corpus-classes.json`). */
export interface CorpusClassEntry {
  class: CorpusClass;
  rawFallbackCount: number;
}

export type CorpusClassMap = Record<string, CorpusClassEntry>;

const CLASS_RANK: Record<CorpusClass, number> = { SUPPORTED: 3, RECOVERED: 2, UNSUPPORTED: 1, INVALID: 0 };

/** true, если запись стала СЛАБЕЕ (SUPPORTED→RECOVERED и т.п.) — именно это
 * запрещено §33/§35 ТЗ ("SUPPORTED must not regress") без явного объяснения. */
export function isDowngrade(before: CorpusClass, after: CorpusClass): boolean {
  return CLASS_RANK[after] < CLASS_RANK[before];
}

/**
 * Отчёт о разнице между замороженным baseline и заново вычисленной классификацией —
 * §37/§38 ТЗ: любое изменение baseline обязано объяснять, что изменилось и почему,
 * а не молча регенерироваться. Используется и CLI-скриптом (`corpusClassify.ts`,
 * перед перезаписью артефакта), и регресс-тестом (при падении гейта).
 */
export function formatClassificationDiff(before: CorpusClassMap, after: CorpusClassMap): string {
  const files = new Set([...Object.keys(before), ...Object.keys(after)]);
  const added: string[] = [];
  const removed: string[] = [];
  const transitions: Array<{ file: string; from: CorpusClass; to: CorpusClass; downgrade: boolean }> = [];

  for (const file of files) {
    const b = before[file];
    const a = after[file];
    if (!b) { added.push(file); continue; }
    if (!a) { removed.push(file); continue; }
    if (b.class !== a.class) transitions.push({ file, from: b.class, to: a.class, downgrade: isDowngrade(b.class, a.class) });
  }

  const lines: string[] = [];
  lines.push('# Диф классификации корпуса', '');
  lines.push(`- Файлов в старом baseline: ${Object.keys(before).length}`);
  lines.push(`- Файлов в новой классификации: ${Object.keys(after).length}`);
  lines.push(`- Добавлено записей: ${added.length}`);
  lines.push(`- Удалено записей: ${removed.length}`);
  lines.push(`- Изменили класс: ${transitions.length}`);
  const downgrades = transitions.filter(t => t.downgrade);
  lines.push(`- Из них РЕГРЕСС (SUPPORTED и сильнее → слабее): ${downgrades.length}`, '');

  if (downgrades.length > 0) {
    lines.push('## РЕГРЕССЫ (требуют explicit объяснения, см. ТЗ §33/§35/§37)');
    for (const t of downgrades) lines.push(`- \`${t.file}\`: ${t.from} → ${t.to}`);
    lines.push('');
  }
  const upgrades = transitions.filter(t => !t.downgrade);
  if (upgrades.length > 0) {
    lines.push('## Улучшения класса');
    for (const t of upgrades) lines.push(`- \`${t.file}\`: ${t.from} → ${t.to}`);
    lines.push('');
  }
  if (added.length > 0) {
    lines.push('## Новые записи корпуса');
    for (const f of added.slice(0, 20)) lines.push(`- \`${f}\`: ${after[f].class}`);
    if (added.length > 20) lines.push(`- … и ещё ${added.length - 20}`);
    lines.push('');
  }
  if (removed.length > 0) {
    lines.push('## Записи, исчезнувшие из корпуса');
    for (const f of removed.slice(0, 20)) lines.push(`- \`${f}\` (была ${before[f].class})`);
    if (removed.length > 20) lines.push(`- … и ещё ${removed.length - 20}`);
    lines.push('');
  }
  if (transitions.length === 0 && added.length === 0 && removed.length === 0) {
    lines.push('Baseline не изменился.');
  }
  return lines.join('\n') + '\n';
}
