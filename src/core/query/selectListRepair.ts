/**
 * Moved from `src/extension/hoverFieldInfo.ts` (v0.1.33) into `src/core/query` so
 * it can be shared by the semantic-core roadmap's tolerant snapshot (Phase 1c,
 * memory: project-semantic-core-roadmap) without duplicating the repair
 * heuristic — `src/core/semantic` may depend on `src/core/query`, but not on
 * `src/extension` (core must not depend on the extension layer). Behavior
 * unchanged from the original, except that the placeholder now preserves the
 * replaced segment's length (see `blankSelectList`).
 */
import { tokenize } from './sdblLexer';

/**
 * Best-effort відновлення для консьюмерів, яким потрібен лише блок `ИЗ` (звідки
 * псевдонім), а не сам список полів `ВЫБРАТЬ` — саме він ламкий ПІД ЧАС
 * редагування (нове поле на новому рядку, кома до нього ще не додана;
 * незавершений вираз; тощо). ОДНА така недописана справа будь-де в пакеті раніше
 * валила `parseBatch` цілком, мовчки ламаючи hover/completion УСЮДИ — навіть для
 * псевдоніма з `ИЗ`, який структурно ніяк не пов'язаний з помилкою.
 *
 * Для КОЖНОГО учасника `ОБЪЕДИНЕНИЯ` на ВЕРХНЬОМУ рівні (не всередині вкладеного
 * підзапиту) підміняє все між `ВЫБРАТЬ` і найближчим `ИЗ` тієї ж глибини на
 * тривіальну заглушку `1` тієї ж довжини (див. `blankSelectList`) — той самий
 * прийом токенізації з відстеженням глибини дужок/фігурних дужок, що вже й
 * перевірено використовує `splitUnionMemberTexts`
 * (sdblParser.ts) для розбиття учасників об'єднання.
 *
 * Викликається ТІЛЬКИ коли звичайний розбір вже провалився — жодного впливу на
 * будь-що, що й так парситься. `undefined`, якщо жодного `ВЫБРАТЬ` на верхньому
 * рівні не знайдено (нічого відновлювати).
 *
 * ВІДОМЕ СПРОЩЕННЯ: незавершене поле ВСЕРЕДИНІ вкладеного підзапиту (глибше рівня
 * 0) цим не покривається — той самий "лише верхній рівень" компроміс, що й у
 * alias-scope (див. docs/development/known-issues.md).
 */
export function repairSelectListsForRecovery(text: string): string | undefined {
  const tokens = tokenize(text);
  const replacements: Array<{ start: number; end: number }> = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'eof') break;
    if (t.type === 'punct') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth--;
      else if (t.value === '{') braceDepth++;
      else if (t.value === '}') braceDepth--;
    }
    if (t.type === 'keyword' && t.value === 'ВЫБРАТЬ' && parenDepth === 0 && braceDepth === 0) {
      const selectStart = t.pos + t.text.length;
      let j = i + 1;
      let depth = 0;
      let izTok: typeof t | undefined;
      while (j < tokens.length) {
        const u = tokens[j];
        if (u.type === 'eof') break;
        if (u.type === 'punct') {
          if (u.value === '(' || u.value === '{') depth++;
          else if (u.value === ')' || u.value === '}') {
            if (depth === 0) break; // вийшли за межі поточного ВЫБРАТЬ, не знайшовши ИЗ
            depth--;
          }
        }
        if (u.type === 'keyword' && u.value === 'ИЗ' && depth === 0) { izTok = u; break; }
        j++;
      }
      if (izTok) replacements.push({ start: selectStart, end: izTok.pos });
      i = j;
      continue;
    }
    i++;
  }

  if (replacements.length === 0) return undefined;
  let result = text;
  for (let k = replacements.length - 1; k >= 0; k--) {
    const { start, end } = replacements[k];
    result = result.slice(0, start) + blankSelectList(result.slice(start, end)) + result.slice(end);
  }
  return result;
}

/**
 * Заглушка тієї ж довжини, що й замінений список полів: усі символи, крім
 * переносів рядка, стають пробілами, а `1` стає на друге місце (обабіч — пробіли,
 * тож лексер не зліпить її з `ВЫБРАТЬ`/`ИЗ`). Сегмент із 1-2 символів
 * (`ВЫБРАТЬ ИЗ`) цього не вміщає — тоді заглушка `*`: це пунктуація, тож
 * `ВЫБРАТЬ*ИЗ` лексується як три токени й без пробілів. Збережена довжина —
 * інваріант, на який спирається `buildSemanticSnapshotFromText`: зміщення в
 * відремонтованому тексті збігаються з оригінальними, тож `'recovered'`-снепшот
 * має `sourceMapEvents`.
 */
function blankSelectList(segment: string): string {
  const blank = segment.replace(/[^\r\n]/g, ' ');
  if (segment.length < 3) return '*' + blank.slice(1);
  return blank[0] + '1' + ' ' + blank.slice(3);
}

/** Top-level sections after the sources that recovery may drop (S2, C18/C19). */
const TRAILING_SECTIONS = new Set(['СГРУППИРОВАТЬ', 'ИМЕЮЩИЕ', 'УПОРЯДОЧИТЬ', 'ИТОГИ', 'ИНДЕКСИРОВАТЬ']);
/** Keywords that end such a section at statement level. */
const SECTION_BOUNDARIES = new Set(['ОБЪЕДИНИТЬ', 'ВЫБРАТЬ', 'УНИЧТОЖИТЬ', 'ДЛЯ']);

/**
 * S2: for consumers that only need sources and aliases, blanks every top-level
 * ГРУППИРОВКА/ИМЕЮЩИЕ/ПОРЯДОК/ИТОГИ/ИНДЕКС section (keyword included) with spaces
 * of the same length, up to the next section boundary (`;`, ОБЪЕДИНИТЬ, the next
 * statement, ДЛЯ ИЗМЕНЕНИЯ, the end). A half-typed `УПОРЯДОЧИТЬ ПО Т. ,` then no
 * longer makes the whole package unavailable. Called only after a normal parse
 * failed; offsets are preserved, so the recovered snapshot keeps positions.
 * The blank ends with a `ДЛЯ ИЗМЕНЕНИЯ` placeholder (valid at the end of any
 * member) when it fits: a union member's range ends at its last token, so without
 * it a cursor inside the blanked section would fall outside every query.
 * Sections inside subqueries are not touched. `undefined` if there is no such
 * section.
 */
export function repairTrailingSectionsForRecovery(text: string): string | undefined {
  const tokens = tokenize(text);
  const ranges: Array<{ start: number; end: number; placeholder: boolean }> = [];
  let depth = 0;
  let open: number | undefined;
  const close = (end: number, placeholder = true): void => {
    if (open !== undefined) ranges.push({ start: open, end, placeholder });
    open = undefined;
  };
  for (const t of tokens) {
    if (t.type === 'eof') { close(t.pos); break; }
    if (t.type === 'punct') {
      if (t.value === '(' || t.value === '{') depth++;
      else if (t.value === ')' || t.value === '}') depth--;
      else if (t.value === ';' && depth === 0) close(t.pos);
      continue;
    }
    if (depth !== 0 || t.type !== 'keyword') continue;
    if (SECTION_BOUNDARIES.has(t.value)) close(t.pos, t.value !== 'ДЛЯ');
    else if (TRAILING_SECTIONS.has(t.value) && open === undefined) open = t.pos;
  }
  if (ranges.length === 0) return undefined;
  let result = text;
  for (let k = ranges.length - 1; k >= 0; k--) {
    const { start, end, placeholder } = ranges[k];
    // Line breaks are blanked too: only offsets matter, and the placeholder must
    // end exactly where the section did.
    let blank = ' '.repeat(end - start);
    if (placeholder && blank.length > FOR_UPDATE.length) {
      blank = blank.slice(FOR_UPDATE.length) + FOR_UPDATE;
    }
    result = result.slice(0, start) + blank + result.slice(end);
  }
  return result;
}

const FOR_UPDATE = 'ДЛЯ ИЗМЕНЕНИЯ';

/**
 * S2 (C06/C13/C11): an unclosed `(` makes the parser swallow the rest of the
 * statement (`ПОДСТРОКА(Т.` hides `ИЗ`), yet the parse may still succeed with no
 * sources. For recovery only: an unclosed subquery `(ВЫБРАТЬ …` is closed by `)`
 * appended at the very end of the text; any other unclosed `(` is replaced by a
 * space. Every original offset is unchanged (in-place blanking, appended tail).
 * `undefined` when every `(` is closed.
 */
export function repairUnbalancedParensForRecovery(text: string): string | undefined {
  const tokens = tokenize(text);
  const open: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'punct') continue;
    if (t.value === '(') open.push(i);
    else if (t.value === ')') open.pop();
  }
  if (open.length === 0) return undefined;
  let result = text;
  let closers = '';
  for (const i of open) {
    const next = tokens[i + 1];
    if (next?.type === 'keyword' && next.value === 'ВЫБРАТЬ') closers += ')';
    else result = result.slice(0, tokens[i].pos) + ' ' + result.slice(tokens[i].pos + 1);
  }
  return result + closers;
}
