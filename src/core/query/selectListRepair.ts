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
 * 0) цим не покривається: список полів вкладеного підзапиту не підміняється.
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

/** Sections after the sources that recovery may drop (S2, C18/C19). */
const TRAILING_SECTIONS = new Set(['СГРУППИРОВАТЬ', 'ИМЕЮЩИЕ', 'УПОРЯДОЧИТЬ', 'ИТОГИ', 'ИНДЕКСИРОВАТЬ']);
/** Keywords that end such a section and start a new union member or statement. */
const MEMBER_BOUNDARIES = new Set(['ОБЪЕДИНИТЬ', 'ВЫБРАТЬ', 'УНИЧТОЖИТЬ']);

/** One query level: the statement, a parenthesized (sub)query or a `{…}` block. */
interface SectionFrame {
  /** Start of the section being blanked at this level. */
  open?: number;
  /** The current union member at this level already has `ГДЕ` (before `open`). */
  hasWhere: boolean;
}

/**
 * S2: for consumers that only need sources and aliases, blanks every
 * ГРУППИРОВКА/ИМЕЮЩИЕ/ПОРЯДОК/ИТОГИ/ИНДЕКС section (keyword included) with spaces
 * of the same length, up to the end of its level (`;`, ОБЪЕДИНИТЬ, the next
 * statement, ДЛЯ ИЗМЕНЕНИЯ, the closing `)` of a subquery, the end). A half-typed
 * `УПОРЯДОЧИТЬ ПО Т. ,` then no longer makes the whole package unavailable.
 * `nested: false` touches only statement-level sections; `nested: true` also those
 * inside subqueries. Called only after a normal parse failed; offsets are
 * preserved, so the recovered snapshot keeps positions.
 *
 * A union member's range ends at its last token, so the blank ends with a
 * placeholder, otherwise a cursor inside the blanked section would fall outside
 * every query: `ДЛЯ ИЗМЕНЕНИЯ` when it fits, else `И 1` (the member already has
 * `ГДЕ`) or `ГДЕ 1` (always fits: the shortest section keyword, ИТОГИ, is as long). Before an existing `ДЛЯ ИЗМЕНЕНИЯ` no placeholder is needed.
 * `undefined` if there is no such section.
 */
export function repairTrailingSectionsForRecovery(text: string, nested = false): string | undefined {
  const tokens = tokenize(text);
  const ranges: Array<{ start: number; end: number; placeholder?: string }> = [];
  const frames: SectionFrame[] = [{ hasWhere: false }];
  const close = (frame: SectionFrame, end: number, withPlaceholder = true): void => {
    if (frame.open === undefined) return;
    const length = end - frame.open;
    const short = frame.hasWhere ? 'И 1' : 'ГДЕ 1';
    // A section keyword starts a token, so the character before it cannot glue
    // to the placeholder; every section keyword is at least as long as `ГДЕ 1`.
    const placeholder = !withPlaceholder ? undefined
      : length > FOR_UPDATE.length ? FOR_UPDATE
      : length >= short.length ? short
      : undefined;
    ranges.push({ start: frame.open, end, placeholder });
    frame.open = undefined;
  };
  for (const t of tokens) {
    const frame = frames[frames.length - 1];
    if (t.type === 'eof') { frames.forEach(f => close(f, t.pos)); break; }
    if (t.type === 'punct') {
      if (t.value === '(' || t.value === '{') frames.push({ hasWhere: false });
      else if ((t.value === ')' || t.value === '}') && frames.length > 1) { close(frame, t.pos); frames.pop(); }
      else if (t.value === ';') { frames.forEach(f => close(f, t.pos)); frames.length = 1; frames[0].hasWhere = false; }
      continue;
    }
    if (t.type !== 'keyword') continue;
    const tracked = nested || frames.length === 1;
    if (MEMBER_BOUNDARIES.has(t.value)) { if (tracked) close(frame, t.pos); frame.hasWhere = false; }
    else if (t.value === 'ДЛЯ') { if (tracked) close(frame, t.pos, false); }
    else if (t.value === 'ГДЕ' && frame.open === undefined) frame.hasWhere = true;
    else if (tracked && TRAILING_SECTIONS.has(t.value) && frame.open === undefined) frame.open = t.pos;
  }
  if (ranges.length === 0) return undefined;
  ranges.sort((a, b) => a.start - b.start);
  let result = text;
  for (let k = ranges.length - 1; k >= 0; k--) {
    const { start, end, placeholder } = ranges[k];
    // Line breaks are blanked too: only offsets matter, and the placeholder must
    // end exactly where the section did.
    const blank = placeholder ? ' '.repeat(end - start - placeholder.length) + placeholder : ' '.repeat(end - start);
    result = result.slice(0, start) + blank + result.slice(end);
  }
  return result;
}

const FOR_UPDATE = 'ДЛЯ ИЗМЕНЕНИЯ';

/**
 * S2 (C06/C13/C11): an unclosed `(` makes the parser swallow the rest of its
 * statement (`ПОДСТРОКА(Т.` hides `ИЗ`), yet the parse may still succeed with no
 * sources. For recovery only, per batch statement (the batch splits at every
 * `;`, parentheses notwithstanding):
 * - any unclosed `(` not opening a subquery is replaced by a space;
 * - unclosed subqueries `(ВЫБРАТЬ …` get their `)` at the statement end: after
 *   the text for the last statement; otherwise over the whitespace just before
 *   its `;`, or over the whitespace just after it (the `;` then moves right),
 *   or, with no whitespace there (`КАК К;ВЫБРАТЬ`), inserted before the `;`.
 * In-place edits keep every offset. Each `)` added to the text (appended or
 * inserted) is listed in `inserted` by the SOURCE offset it precedes, so callers
 * can map positions back (`text.length` for the appended tail). `undefined` when
 * every `(` is closed.
 */
export interface ParenRepair {
  text: string;
  /** Sorted source offsets; one added `)` precedes the source character at each. */
  inserted: number[];
}

export function repairUnbalancedParensForRecovery(text: string): ParenRepair | undefined {
  const tokens = tokenize(text);
  // Token offsets are UTF-16 units, so edit a UTF-16 unit array.
  const units = text.split('');
  let changed = false;
  const inserted: number[] = [];
  let open: number[] = [];
  const finish = (semicolonPos: number | undefined): void => {
    let closers = 0;
    for (const i of open) {
      const next = tokens[i + 1];
      if (next?.type === 'keyword' && next.value === 'ВЫБРАТЬ') closers++;
      else { units[tokens[i].pos] = ' '; changed = true; }
    }
    open = [];
    if (closers === 0) return;
    if (semicolonPos === undefined) {
      for (let k = 0; k < closers; k++) inserted.push(text.length);
      changed = true;
      return;
    }
    const isSpace = (at: number): boolean => at >= 0 && at < units.length && /\s/.test(units[at]);
    let before = 0;
    while (before < closers && isSpace(semicolonPos - 1 - before)) before++;
    if (before === closers) {
      for (let k = 1; k <= closers; k++) units[semicolonPos - k] = ')';
      changed = true;
      return;
    }
    let after = 0;
    while (after < closers && isSpace(semicolonPos + 1 + after)) after++;
    if (after === closers) {
      for (let k = 0; k < closers; k++) units[semicolonPos + k] = ')';
      units[semicolonPos + closers] = ';';
      changed = true;
      return;
    }
    for (let k = 0; k < closers; k++) inserted.push(semicolonPos);
    changed = true;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'eof') { finish(undefined); break; }
    if (t.type !== 'punct') continue;
    if (t.value === '(') open.push(i);
    else if (t.value === ')') open.pop();
    else if (t.value === ';') finish(t.pos);
  }
  if (!changed) return undefined;
  let result = '';
  let from = 0;
  for (const at of inserted) {
    result += units.slice(from, at).join('') + ')';
    from = at;
  }
  return { text: result + units.slice(from).join(''), inserted };
}
