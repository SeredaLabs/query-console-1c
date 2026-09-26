import { highlightSegments } from '../queryHighlight';
import { HIGHLIGHT_TOKEN_STYLE } from '../cmHighlight';

export interface HighlightedPart {
  text: string;
  style?: { color: string; fontWeight?: string; fontStyle?: string };
}

/** Місце для заповнення шаблону каталогу (`<Значение>`) — приглушений курсив, як
 * поле сніпета в редакторі, а не токен мови (інакше `<Значение>` фарбувався б як
 * функція `ЗНАЧЕНИЕ`, а `<Условие>` — ні). */
export const PLACEHOLDER_STYLE = { color: 'var(--vscode-descriptionForeground, #9d9d9d)', fontStyle: 'italic' };

/** Той самий шаблон місця, що й у `templateToSnippet` (`<>` — оператор, не місце). */
const PLACEHOLDER_RE = /<[^<>\s][^<>]*>/g;

function codeParts(text: string): HighlightedPart[] {
  return highlightSegments(text).map(seg => (seg.type === 'plain' ? { text: seg.text } : { text: seg.text, style: HIGHLIGHT_TOKEN_STYLE[seg.type] }));
}

/**
 * Фрагмент SDBL (синтаксис/приклад у довідці функції, картка підказки), розмічений
 * тим самим токенізатором і тими самими кольорами, що й редактор виразу
 * (`highlightSegments` + `HIGHLIGHT_TOKEN_STYLE`), — щоб підсвітка не розходилась.
 * `placeholders` — для шаблонів каталогу: `<…>` фарбуються як місця для заповнення
 * (у прикладах їх немає, а `<` там — оператор порівняння).
 */
export function highlightParts(text: string, placeholders = false): HighlightedPart[] {
  if (!placeholders) return codeParts(text);
  const parts: HighlightedPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m.index! > last) parts.push(...codeParts(text.slice(last, m.index)));
    parts.push({ text: m[0], style: PLACEHOLDER_STYLE });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(...codeParts(text.slice(last)));
  return parts;
}

/** DOM-варіант для карток автодоповнення CodeMirror (поза React). */
export function appendHighlighted(parent: HTMLElement, text: string, placeholders = false): void {
  for (const part of highlightParts(text, placeholders)) {
    if (!part.style) { parent.append(part.text); continue; }
    const span = document.createElement('span');
    span.textContent = part.text;
    Object.assign(span.style, part.style);
    parent.append(span);
  }
}
