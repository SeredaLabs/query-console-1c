import type { MetaField, MetaTable } from '../../core/metadata/types';
import type { MetadataResolver } from '../../core/query/metadataResolver';
import { resolveFieldPath } from '../../core/query/fieldPathResolver';
import { describeFieldTypes } from '../../core/metadata/describeType';
import { tokenize, isWordToken, SdblLexError, type Token } from '../../core/query/sdblLexer';
import { isStructurallyValidExpression } from '../../core/query/expressionSyntaxCheck';

/**
 * Джерело полів для довільного виразу — вибрана в конструкторі таблиця під своїм
 * псевдонімом. Це лише ПРЕДСТАВЛЕННЯ `QueryState.selectedTables` (+ метадані з
 * `allTables`), яке будує `ConstructorView`, а не окрема модель: вираз як і раніше
 * повертається рядком через `onOk(text)` у ті самі reducer-actions.
 */
export interface ExpressionSource {
  alias: string;
  meta: MetaTable;
  /** Origin of field types for arithmetic hints; omitted means unproven. */
  typeOrigin?: 'metadata' | 'derived';
}

export interface ExpressionContext {
  sources: ExpressionSource[];
  /** `true` — поля адресуються `Псевдоним.Поле` (поля/умови/зв'язки запиту);
   * `false` — голе `Поле` єдиного джерела (умова параметрів віртуальної таблиці). */
  qualified: boolean;
  resolver?: MetadataResolver;
}

const EMPTY_RESOLVER: MetadataResolver = { tableByFullName: () => undefined };

/** Текст посилання на поле `path` джерела `source` у поточному режимі адресації. */
export function fieldReference(ctx: ExpressionContext, source: ExpressionSource, path: string[]): string {
  return ctx.qualified ? [source.alias, ...path].join('.') : path.join('.');
}

function findSource(ctx: ExpressionContext, alias: string): ExpressionSource | undefined {
  const up = alias.toUpperCase();
  return ctx.sources.find(s => s.alias.toUpperCase() === up);
}

/** Розкладає ланцюжок ідентифікаторів на (джерело, шлях по полях). */
function locate(ctx: ExpressionContext, chain: string[]): { source: ExpressionSource; path: string[] } | undefined {
  if (chain.length === 0) return undefined;
  if (!ctx.qualified) {
    const only = ctx.sources[0];
    return only ? { source: only, path: chain } : undefined;
  }
  const source = findSource(ctx, chain[0]);
  return source ? { source, path: chain.slice(1) } : undefined;
}

/**
 * Таблиця, чиї поля треба запропонувати після `chain.` — той самий `resolveFieldPath`
 * (core), що й completion у `.bsl`. `undefined` — fail-open: невідомий псевдонім,
 * шлях через скалярне поле або target без метаданих — нічого не вгадуємо.
 */
export function completionTargetFor(
  ctx: ExpressionContext,
  chain: string[],
): { source: ExpressionSource; meta: MetaTable } | undefined {
  const loc = locate(ctx, chain);
  if (!loc) return undefined;
  if (loc.path.length === 0) return { source: loc.source, meta: loc.source.meta };
  const r = resolveFieldPath(loc.source.meta, loc.path, ctx.resolver ?? EMPTY_RESOLVER);
  if (r.unresolvedTail.length > 0) return undefined;
  const last = r.resolved[r.resolved.length - 1];
  if (!last || last.kind !== 'reference' || !last.refTarget) return undefined;
  return { source: loc.source, meta: last.refTarget };
}

/** Таблиця-target єдиного ссилочного типу поля (для розгортання в дереві «Поля»). */
export function referenceTarget(field: MetaField, resolver: MetadataResolver | undefined): MetaTable | undefined {
  if (field.types.length !== 1) return undefined;
  const ref = field.types[0].ref;
  if (!ref || !resolver) return undefined;
  return resolver.tableByFullName(`${ref.kind}.${ref.name}`);
}

export interface ExpressionIssue {
  /** Діапазон у тексті; відсутній, коли позицію довести не можна (структурна помилка). */
  from?: number;
  to?: number;
  severity: 'error' | 'warning';
  kind: 'lexical' | 'syntax' | 'fieldNotFound';
  /** Для `lexical` — сире повідомлення лексера (локалізується `localizeDiagnostic`). */
  message?: string;
  field?: string;
  table?: string;
}

export interface ExpressionAnalysis {
  empty: boolean;
  /** Структурна перевірка `isStructurallyValidExpression` — та сама, що блокує Apply
   * конструктора для custom-виразів (PR-14). */
  syntaxValid: boolean;
  issues: ExpressionIssue[];
  /** Підпис для UI: поле, літерал або доведена числова арифметика; не валідація. */
  resultType?: string;
}

interface Chain {
  segments: Token[];
  start: number;
  end: number;
}

function isNameToken(t: Token | undefined): t is Token {
  return !!t && (t.type === 'ident' || t.type === 'keyword');
}

function isDot(t: Token | undefined): boolean {
  return !!t && t.type === 'punct' && t.value === '.';
}

/** Ланцюжки `Имя(.Имя)*` з токенів лексера (не з regex по сирому тексту). */
function collectChains(tokens: Token[]): Chain[] {
  const chains: Chain[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isNameToken(tokens[i])) continue;
    if (isDot(tokens[i - 1])) continue;
    const segments = [tokens[i]];
    let j = i;
    while (isDot(tokens[j + 1]) && isNameToken(tokens[j + 2])) {
      segments.push(tokens[j + 2]);
      j += 2;
    }
    chains.push({ segments, start: i, end: j });
    i = j;
  }
  return chains;
}

function lexicalIssue(text: string, e: unknown): ExpressionIssue {
  const message = e instanceof Error ? e.message : String(e);
  if (!(e instanceof SdblLexError)) return { severity: 'error', kind: 'lexical', message };
  const from = Math.min(text.length, e.pos);
  return { from, to: Math.min(text.length, from + 1), severity: 'error', kind: 'lexical', message };
}

/** Display facts only; the existing structural check owns expression grammar. */
function constantResultType(tokens: Token[]): string | undefined {
  if (tokens.length === 1) {
    if (tokens[0].type === 'string') return 'Строка';
    if (tokens[0].type === 'number') return 'Число';
    if (isWordToken(tokens[0], 'ИСТИНА', 'ЛОЖЬ')) return 'Булево';
  }
  return undefined;
}

/** Numeric operands only; precedence cannot change their primitive result type.
 * Syntax/arity, evaluation and precision remain outside this display fact. */
function numericArithmeticType(tokens: Token[], fields: ReadonlyMap<number, number>): string | undefined {
  let hasOperand = false;
  for (let i = 0; i < tokens.length; i++) {
    const end = fields.get(i);
    if (end !== undefined) { hasOperand = true; i = end; continue; }
    const t = tokens[i];
    if (t.type === 'number') { hasOperand = true; continue; }
    if (t.type !== 'punct' || !['+', '-', '*', '/', '(', ')'].includes(t.value)) return undefined;
    // The structural acceptor permits empty parentheses in some contexts.
    if (t.value === ')' && tokens[i - 1]?.value === '(') return undefined;
  }
  return hasOperand ? 'Число' : undefined;
}

/**
 * Діагностика довільного виразу для статус-рядка й маркерів редактора. Не блокує OK
 * (поточна форма не має блокуючих правил — Apply конструктора перевіряє вирази сам).
 *
 * «Поле не знайдено» — лише для ланцюжка, чия голова — ВІДОМИЙ псевдонім джерела з
 * непорожнім списком полів, і лише при `stoppedReason === 'fieldNotFound'` (правило
 * «unknown != invalid» з `resolveFieldPath`). Невідомі голови (функції, типи
 * `Справочник.X`, параметри) не оцінюються; вираз із вкладеним `ВЫБРАТЬ` — теж
 * (псевдоніми підзапиту можуть перекривати зовнішні). `cursor` — позиція курсора:
 * недописане ім'я під ним не оцінюється.
 */
export function analyzeExpression(text: string, ctx: ExpressionContext, cursor?: number): ExpressionAnalysis {
  if (text.trim() === '') return { empty: true, syntaxValid: true, issues: [] };

  let tokens: Token[];
  try {
    tokens = tokenize(text).filter(t => t.type !== 'eof');
  } catch (e) {
    return { empty: false, syntaxValid: false, issues: [lexicalIssue(text, e)] };
  }

  const syntaxValid = isStructurallyValidExpression(text);
  const issues: ExpressionIssue[] = [];
  if (!syntaxValid) issues.push({ severity: 'error', kind: 'syntax' });

  const resolver = ctx.resolver ?? EMPTY_RESOLVER;
  const hasSubquery = tokens.some(t => t.type === 'keyword' && t.value === 'ВЫБРАТЬ');
  const chains = collectChains(tokens);
  let resultType = constantResultType(tokens);
  const numericFields = new Map<number, number>();

  for (const chain of chains) {
    const names = chain.segments.map(s => s.text);
    // Голе ім'я в qualified-режимі — функція/ключове слово/параметр, не поле.
    if (ctx.qualified && names.length < 2) continue;
    const loc = locate(ctx, names);
    if (!loc || loc.path.length === 0) continue;
    const r = resolveFieldPath(loc.source.meta, loc.path, resolver);

    if (r.unresolvedTail.length === 0) {
      const onlyToken = chains.length === 1 && tokens.length === chain.segments.length * 2 - 1;
      const last = r.resolved[r.resolved.length - 1];
      if (onlyToken && last) resultType = describeFieldTypes(last.field) || undefined;
      // Direct fields only: composite reference navigation and derived-column
      // compatibility types do not prove an arithmetic operand's type.
      if (loc.source.typeOrigin === 'metadata' && loc.path.length === 1 && last
        && last.field.types.length === 1 && last.field.types[0].primitive === 'Число') {
        numericFields.set(chain.start, chain.end);
      }
      continue;
    }
    if (hasSubquery || r.stoppedReason !== 'fieldNotFound') continue;
    const owner = r.resolved.length === 0 ? loc.source.meta : r.resolved[r.resolved.length - 1].refTarget;
    if (!owner || owner.fields.length === 0) continue;
    const bad = chain.segments[chain.segments.length - loc.path.length + r.resolved.length];
    // Сегмент, що закінчується під курсором, ще набирається (`Остатки.Кол|`).
    if (cursor !== undefined && bad.pos + bad.text.length === cursor) continue;
    issues.push({
      from: bad.pos,
      to: bad.pos + bad.text.length,
      severity: 'warning',
      kind: 'fieldNotFound',
      field: bad.text,
      table: owner.fullName,
    });
  }

  resultType ??= numericArithmeticType(tokens, numericFields);
  return { empty: false, syntaxValid, issues, resultType: syntaxValid ? resultType : undefined };
}

/**
 * Прибирає відступ, який `formatExpression` додає рядкам 2..n під позицію виразу
 * всередині тексту запиту: у редакторі вираз стоїть сам по собі.
 */
export function dedentContinuationLines(text: string): string {
  const lines = text.split('\n');
  if (lines.length < 2) return text;
  const rest = lines.slice(1).filter(l => l.trim() !== '');
  if (rest.length === 0) return text;
  const indent = Math.min(...rest.map(l => l.match(/^\t*/)![0].length));
  if (indent === 0) return text;
  return [lines[0], ...lines.slice(1).map(l => (l.startsWith('\t'.repeat(indent)) ? l.slice(indent) : l))].join('\n');
}
