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
 * Заглушка `1` тієї ж довжини, що й замінений список полів: усі символи, крім
 * переносів рядка, стають пробілами, а `1` стає на друге місце (обабіч — пробіли,
 * тож лексер не зліпить її з `ВЫБРАТЬ`/`ИЗ`). Збережена довжина — інваріант, на
 * який спирається `buildSemanticSnapshotFromText`: зміщення в відремонтованому
 * тексті збігаються з оригінальними, тож `'recovered'`-снепшот теж може мати
 * `sourceMapEvents`. Сегмент коротший за 3 символи (`ВЫБРАТЬ ИЗ`) так не
 * вміщається — лишається стара заглушка `' 1 '`, що подовжує текст; тоді
 * довжини не збігаються і снепшот чесно лишається без позицій.
 */
function blankSelectList(segment: string): string {
  if (segment.length < 3) return ' 1 ';
  const blank = segment.replace(/[^\r\n]/g, ' ');
  return blank[0] + '1' + ' ' + blank.slice(3);
}
