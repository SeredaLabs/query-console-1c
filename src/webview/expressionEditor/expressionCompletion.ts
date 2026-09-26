import { snippet, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import type { MetaField, MetaTable } from '../../core/metadata/types';
import { describeFieldTypes } from '../../core/metadata/describeType';
import { buildFieldCard } from '../../core/metadata/fieldCard';
import { findChainForCompletion } from '../../core/query/fieldChain';
import { t } from '../i18n';
import { completionTargetFor, fieldReference, type ExpressionContext, type ExpressionSource } from './expressionContext';
import { appendHighlighted } from './highlightedCode';
import { allCatalogLeaves, completionWord, functionDescription, functionSignature, templateToSnippet } from './functionCatalogView';

type Rect = { left: number; right: number; top: number; bottom: number };

const INFO_MAX_WIDTH = 360;
const INFO_MIN_SIDE_WIDTH = 220;
const INFO_GAP = 4;

/**
 * Розміщення картки активної підказки (`autocompletion({ positionInfo })`) —
 * ніколи НЕ поверх самого списку. Типове розміщення CodeMirror, коли картка не
 * влазить ні праворуч, ні ліворуч у свою природну ширину, кладе її всередину
 * списку під активним пунктом («вікно на вікні»). Тут: праворуч/ліворуч, якщо є
 * хоча б `INFO_MIN_SIDE_WIDTH` (текст переноситься), інакше — під списком або над ним.
 */
export function positionCompletionInfo(
  _view: unknown,
  list: Rect,
  option: Rect,
  info: Rect,
  space: Rect,
  // Шостий аргумент CodeMirror передає, але в його .d.ts його немає — тому необов'язковий.
  tooltip?: { offsetWidth: number; offsetHeight: number },
): { style: string; class: string } {
  const scaleY = tooltip?.offsetHeight ? (list.bottom - list.top) / tooltip.offsetHeight : 1;
  const scaleX = tooltip?.offsetWidth ? (list.right - list.left) / tooltip.offsetWidth : 1;
  const spaceRight = space.right - list.right - INFO_GAP;
  const spaceLeft = list.left - space.left - INFO_GAP;
  const infoHeight = info.bottom - info.top;
  const wanted = Math.min(INFO_MAX_WIDTH, info.right - info.left);

  const sideWidth = spaceRight >= Math.max(wanted, INFO_MIN_SIDE_WIDTH) || spaceRight >= spaceLeft ? spaceRight : spaceLeft;
  if (sideWidth >= INFO_MIN_SIDE_WIDTH) {
    const right = sideWidth === spaceRight;
    const top = Math.max(space.top, Math.min(option.top, space.bottom - infoHeight)) - list.top;
    return {
      style: `top: ${top / scaleY}px; max-width: ${Math.min(INFO_MAX_WIDTH, sideWidth) / scaleX}px`,
      class: right ? 'cm-completionInfo-right qc-info-side' : 'cm-completionInfo-left qc-info-side',
    };
  }
  const maxWidth = Math.min(INFO_MAX_WIDTH, space.right - list.left) / scaleX;
  const spaceBelow = space.bottom - list.bottom;
  const spaceAbove = list.top - space.top;
  const below = spaceBelow >= infoHeight + INFO_GAP || spaceBelow >= spaceAbove;
  const offset = (list.bottom - list.top + INFO_GAP) / scaleY;
  return {
    style: `${below ? 'top' : 'bottom'}: ${offset}px; left: 0; max-width: ${maxWidth}px`,
    class: 'qc-info-stacked',
  };
}

/** Ключові слова виразу, яких немає серед листів каталогу функцій/операторів. */
const EXPRESSION_KEYWORDS = ['КОГДА', 'ТОГДА', 'ИНАЧЕ', 'КОНЕЦ', 'ЕСТЬ', 'NULL', 'ИСТИНА', 'ЛОЖЬ', 'НЕОПРЕДЕЛЕНО', 'КАК', 'РАЗЛИЧНЫЕ'];

const WORD_RE = /[\p{L}\p{N}_]*$/u;

/** Курсор усередині рядкового літерала або `//`-коментаря — не доповнюємо. */
function inStringOrComment(docText: string, pos: number): boolean {
  const before = docText.slice(0, pos);
  const lineStart = before.lastIndexOf('\n') + 1;
  let inString = false;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (c === '"') inString = !inString;
    else if (!inString && c === '/' && before[i + 1] === '/' && i >= lineStart) return true;
  }
  return inString;
}

function el(tag: string, text?: string, style?: Partial<CSSStyleDeclaration>): HTMLElement {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (style) Object.assign(node.style, style);
  return node;
}

const MUTED: Partial<CSSStyleDeclaration> = { color: 'var(--vscode-descriptionForeground, #9d9d9d)' };

/** Контекстна картка вибраного поля — показується лише поки активна підказка. */
function fieldInfo(ctx: ExpressionContext, field: MetaField, owner: MetaTable, reference: string): HTMLElement {
  const card = buildFieldCard(field, ctx.resolver ? fullName => ctx.resolver!.tableByFullName(fullName) : undefined);
  const root = el('div', undefined, { display: 'flex', flexDirection: 'column', gap: '6px' });
  const head = el('div', undefined, { display: 'flex', gap: '16px', justifyContent: 'space-between' });
  head.append(el('b', field.name), el('span', describeFieldTypes(field), MUTED));
  root.append(head, el('div', reference, { ...MUTED, fontFamily: 'var(--vscode-editor-font-family, monospace)' }));
  if (card.synonym) root.append(el('div', card.synonym));
  const grid = el('div', undefined, { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '10px', rowGap: '2px' });
  grid.append(el('span', t('exprEditor.card.source'), MUTED), el('span', owner.fullName));
  if (card.target) grid.append(el('span', t('exprEditor.card.type'), MUTED), el('span', card.target));
  else if (card.variants?.length) grid.append(el('span', t('exprEditor.card.type'), MUTED), el('span', card.variants.join(' | ')));
  root.append(grid);
  return root;
}

function functionInfo(label: string, signature: string, description: string | undefined, example: string | undefined): HTMLElement {
  const root = el('div', undefined, { display: 'flex', flexDirection: 'column', gap: '6px' });
  root.append(el('b', label));
  const code = (text: string, placeholders: boolean) => {
    const pre = el('pre', undefined, { margin: '0', whiteSpace: 'pre-wrap', tabSize: '4', fontFamily: 'var(--vscode-editor-font-family, monospace)' });
    appendHighlighted(pre, text, placeholders);
    return pre;
  };
  root.append(code(signature, true));
  if (description) root.append(el('div', description));
  if (example) {
    root.append(el('div', t('exprEditor.example'), MUTED));
    root.append(code(example, false));
  }
  return root;
}

function fieldOptions(ctx: ExpressionContext, source: ExpressionSource, owner: MetaTable, chainPath: string[]): Completion[] {
  return owner.fields.map(field => ({
    label: field.name,
    type: field.types.some(tp => tp.ref) ? 'class' : 'property',
    detail: describeFieldTypes(field) || undefined,
    info: () => fieldInfo(ctx, field, owner, fieldReference(ctx, source, [...chainPath, field.name])),
  }));
}

function functionOptions(): Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const { leaf } of allCatalogLeaves()) {
    const word = completionWord(leaf);
    if (!word || seen.has(leaf.label)) continue;
    seen.add(leaf.label);
    const hasPlaceholders = /<[^<>\s][^<>]*>/.test(leaf.template);
    options.push({
      label: leaf.label,
      type: hasPlaceholders || leaf.template.includes('(') ? 'function' : 'keyword',
      detail: hasPlaceholders ? functionSignature(leaf).split('\n')[0] : undefined,
      apply: hasPlaceholders ? snippet(templateToSnippet(leaf.template)) : leaf.template,
      info: () => functionInfo(leaf.label, functionSignature(leaf), functionDescription(leaf), leaf.example),
    });
  }
  return options;
}

/**
 * Автодоповнення редактора довільних виразів.
 *
 * - Після `Псевдоним.` / `Псевдоним.Поле.` — поля саме цього джерела/target-таблиці
 *   (`completionTargetFor` → core `resolveFieldPath`), а не глобальний пошук по
 *   метаданих; невідомий ланцюжок → нічого (fail-open, як і в `.bsl`).
 * - Інакше, на набраному слові (або Ctrl+Space) — псевдоніми джерел (чи поля
 *   єдиного джерела в unqualified-режимі), функції каталогу як сніпети, ключові слова.
 *
 * Свідомо НЕ реалізовано (немає API в core, див. звіт): ранжування за очікуваним
 * типом (`КОГДА |` → булеві), значення-перелічення аргументів функцій
 * (`ДОБАВИТЬКДАТЕ(<Дата>, |`), параметри `&`.
 *
 * `getContext` читається на кожен запит — розширення створюється один раз на
 * редактор, а джерела живуть у React-пропсах.
 */
export function expressionCompletionSource(getContext: () => ExpressionContext): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const ctx = getContext();
    const docText = context.state.doc.toString();
    const pos = context.pos;
    if (inStringOrComment(docText, pos)) return null;
    const word = context.matchBefore(WORD_RE);
    const from = word ? word.from : pos;
    if (from > 0 && docText[from - 1] === '&') return null;

    const chain = findChainForCompletion(docText, pos);
    if (chain) {
      const names = chain.map(s => s.text);
      const target = completionTargetFor(ctx, names);
      if (!target) return null;
      const chainPath = ctx.qualified ? names.slice(1) : names;
      return { from, options: fieldOptions(ctx, target.source, target.meta, chainPath), validFor: /^[\p{L}\p{N}_]*$/u };
    }
    if (docText[from - 1] === '.') return null;
    if (from === pos && !context.explicit) return null;

    const options: Completion[] = [];
    if (ctx.qualified) {
      for (const s of ctx.sources) {
        options.push({ label: s.alias, type: 'variable', detail: s.meta.fullName, boost: 2 });
      }
    } else if (ctx.sources[0]) {
      options.push(...fieldOptions(ctx, ctx.sources[0], ctx.sources[0].meta, []).map(o => ({ ...o, boost: 2 })));
    }
    options.push(...functionOptions());
    for (const kw of EXPRESSION_KEYWORDS) options.push({ label: kw, type: 'keyword' });
    return { from, options, validFor: /^[\p{L}\p{N}_]*$/u };
  };
}
