/**
 * Фаза 8.1 (шаг 3) — извлечение комментариев `//…` одного запроса-участника и
 * привязка их к якорям модели. Чистая функция: токенизирует исходный текст
 * участника (с комментариями), классифицирует каждый комментарий по 4 видам и
 * мутирует переданную `QueryModel` НА МЕСТЕ.
 *
 * Виды комментариев (терминология фазы 8.1):
 *   1) хвостовой `//…` после поля на ТОЙ ЖЕ строке      → field.commentTrailing
 *   2) `//…` отдельной строкой ПЕРЕД полем              → field.commentLeading[]
 *   3) `//…` перед `ВЫБРАТЬ` (без авто-разделителя)     → model.comments.beforeSelect[]
 *   4) `//…` после `ИЗ`, перед телом источника          → model.comments.afterFrom[]
 *
 * Функция НИКОГДА не бросает исключений: вся рискованная логика обёрнута, и при
 * неожиданной форме входа просто привязывается то, что удалось разобрать (или
 * ничего). Сопоставление сегментов выборки с полями модели — сперва по точному
 * совпадению синонима (`fieldAlias`), затем без учёта регистра (1С регистро-
 * независим), затем — позиционный фолбэк по orderedSelectElements (включая ТЧ и хвостовые поля).
 */

import { tokenize, type Token } from './sdblLexer';
import type { QueryModel, SelectedField, SelectedTabSectionField } from './queryModel';
import { orderedSelectElements, elementAlias, type QueryDocument } from './unionModel';

/** Авто-разделитель конструктора: `//` и далее ТОЛЬКО слеши (`////…`). */
function isAutoSeparator(text: string): boolean {
  return /^\/+$/.test(text);
}

/** Есть ли на строке `line` НЕ-комментарийный токен ЛЕВЕЕ позиции `pos`. */
function hasCodeBeforeOnLine(toks: Token[], line: number, pos: number): boolean {
  return toks.some(
    t => t.type !== 'comment' && t.type !== 'eof' && t.line === line && t.pos < pos
  );
}

/**
 * C16: indices of comments inside the argument list of a virtual-table or
 * selection-criterion call (a dotted name directly followed by `(`) or of
 * `ПЕРИОДАМИ(…)`. With `preserveComments` the parser keeps them in those raw
 * argument slices, so relocating them to `afterFrom` would duplicate them.
 */
function commentsInKeptArgs(toks: Token[]): Set<number> {
  const inside = new Set<number>();
  const stack: boolean[] = [];
  let code: Token[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'comment') {
      if (stack.includes(true)) inside.add(i);
      continue;
    }
    if (t.type === 'punct' && t.value === '(') {
      const [a, b] = [code[code.length - 1], code[code.length - 2]];
      const call = a?.type === 'ident' && (b?.type === 'punct' && b.value === '.' || a.value.toUpperCase() === 'ПЕРИОДАМИ');
      stack.push(!!call);
    } else if (t.type === 'punct' && t.value === ')') {
      stack.pop();
    }
    code.push(t);
    if (code.length > 2) code = code.slice(-2);
  }
  return inside;
}

// Parser-owned comments and bound nested projection comments are excluded by source position, not text:
// identical comments in other slots must still be bound independently. Positions
// are SELECT-relative so UNION member slicing does not change their identity.
const conditionCommentPositions = new WeakMap<QueryModel, Set<number>>();
export function rememberConditionComments(model: QueryModel, positions: Set<number>, selectPos: number): void {
  if (positions.size) conditionCommentPositions.set(model, new Set([...positions].map(p => p - selectPos)));
}

/** Translate a source subquery's parser-owned positions into its parent cursor. */
export function rememberNestedConditionComments(positions: Set<number>, text: string, offset: number, doc: QueryDocument): void {
  let depth = 0;
  let member = 0;
  for (const t of tokenize(text)) {
    if (t.type === 'punct' && (t.value === '(' || t.value === '{')) depth++;
    else if (t.type === 'punct' && (t.value === ')' || t.value === '}')) depth--;
    else if (depth === 0 && t.type === 'keyword' && t.value === 'ВЫБРАТЬ') {
      const model = doc.members[member++]?.model;
      if (model) for (const pos of conditionCommentPositions.get(model) ?? []) positions.add(offset + t.pos + pos);
    }
  }
}

export function extractComments(memberText: string, model: QueryModel): void {
  try {
    const toks = tokenize(memberText, { comments: true });

    // --- 1. Поиск ключевых точек на глубине 0 -------------------------------
    let depth = 0;
    let selectIdx = -1;
    let fromIdx = -1;
    let placeIdx = -1;
    let clauseIdx = -1;
    let previousCode: Token | undefined;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const prev = previousCode;
      if (t.type !== 'comment') previousCode = t;
      if (t.type === 'punct') {
        if (t.value === '(' || t.value === '[') depth++;
        else if (t.value === ')' || t.value === ']') depth = Math.max(0, depth - 1);
        continue;
      }
      if (t.type !== 'keyword' || depth !== 0) continue;
      // Keyword-shaped paths and explicit aliases are not clause boundaries.
      if (toks.slice(i + 1).find(t => t.type !== 'comment')?.value === '.' ||
          prev?.value === '.' || prev?.value === 'КАК') continue;
      // Source-less queries still end their SELECT list at the next clause.
      if (selectIdx >= 0 && clauseIdx < 0 &&
          ['ГДЕ', 'СГРУППИРОВАТЬ', 'ИМЕЮЩИЕ', 'УПОРЯДОЧИТЬ', 'ИТОГИ', 'ИНДЕКСИРОВАТЬ', 'ОБЪЕДИНИТЬ', 'ДЛЯ'].includes(t.value)) clauseIdx = i;
      if (selectIdx < 0 && t.value === 'ВЫБРАТЬ') selectIdx = i;
      else if (selectIdx >= 0 && fromIdx < 0 && t.value === 'ИЗ') fromIdx = i;
      else if (
        selectIdx >= 0 &&
        placeIdx < 0 &&
        (t.value === 'ПОМЕСТИТЬ' || t.value === 'ДОБАВИТЬ')
      ) {
        placeIdx = i;
      }
    }
    if (selectIdx < 0) {
      // C17: a statement without ВЫБРАТЬ (УНИЧТОЖИТЬ) keeps its comments in front
      // of the statement; generated package separators are not user comments.
      const own = toks.filter(t => t.type === 'comment' && !isAutoSeparator(t.value)).map(t => t.value);
      if (own.length) (model.comments ??= {}).beforeSelect = own;
      return;
    }

    // SELECT ends at the first placement/source/following-clause boundary.
    const candidates = [placeIdx, fromIdx, clauseIdx].filter(x => x >= 0);
    const regionEnd = candidates.length ? Math.min(...candidates) : toks.length;

    // --- 2. Разбиение региона выборки на сегменты по запятым глубины 0 -------
    // Каждый сегмент — это {startPos, endPos} в исходном тексте + найденный синоним.
    interface Segment {
      startTok: number; // индекс первого токена сегмента (внутри региона)
      endTok: number;   // индекс последнего токена сегмента (включительно)
      synonym?: string;
    }
    const segments: Segment[] = [];
    {
      let segDepth = 0;
      let segStart = selectIdx + 1;
      const pushSeg = (endExclusive: number) => {
        // Последний значимый токен сегмента (без хвостовых комментариев/eof).
        let last = endExclusive - 1;
        while (last >= segStart && (toks[last].type === 'comment' || toks[last].type === 'eof')) {
          last--;
        }
        let first = segStart;
        while (first <= last && (toks[first].type === 'comment' || toks[first].type === 'eof')) {
          first++;
        }
        if (first > last) return; // пустой сегмент (например, висячая запятая)
        const seg: Segment = { startTok: first, endTok: last };
        // Синоним: токен после ключевого `КАК` внутри сегмента (на глубине 0 сегмента).
        let d = 0;
        for (let j = first; j <= last; j++) {
          const tk = toks[j];
          if (tk.type === 'punct') {
            if (tk.value === '(' || tk.value === '[') d++;
            else if (tk.value === ')' || tk.value === ']') d = Math.max(0, d - 1);
            continue;
          }
          if (d === 0 && tk.type === 'keyword' && tk.value === 'КАК') {
            const next = toks[j + 1];
            if (next && (next.type === 'ident' || next.type === 'keyword')) {
              seg.synonym = next.text;
            }
            break;
          }
        }
        segments.push(seg);
      };
      for (let i = selectIdx + 1; i < regionEnd; i++) {
        const t = toks[i];
        if (t.type === 'punct') {
          if (t.value === '(' || t.value === '[') segDepth++;
          else if (t.value === ')' || t.value === ']') segDepth = Math.max(0, segDepth - 1);
          else if (t.value === ',' && segDepth === 0) {
            pushSeg(i);
            segStart = i + 1;
          }
        }
      }
      pushSeg(regionEnd);
    }

    // --- 3. Сопоставление сегментов с полями модели ------------------------
    type CommentField = SelectedField | SelectedTabSectionField;
    const elements = orderedSelectElements(model);
    const projection = elements.map(el => el.kind === 'field' ? el.field : el.tsf);
    const usedFields = new Set<CommentField>();
    const fieldForSegment = (segIdx: number): CommentField | undefined => {
      const syn = segments[segIdx]?.synonym;
      let index = syn === undefined ? -1 : elements.findIndex((el, i) =>
        !usedFields.has(projection[i]) && elementAlias(el, model) === syn);
      if (index < 0 && syn !== undefined) index = elements.findIndex((el, i) =>
        !usedFields.has(projection[i]) && elementAlias(el, model).toLowerCase() === syn.toLowerCase());
      const field = projection[index >= 0 ? index : segIdx];
      if (field) usedFields.add(field);
      return field;
    };
    const segField = segments.map((_, k) => fieldForSegment(k));

    // --- 4. Классификация и привязка комментариев --------------------------
    const beforeSelect: string[] = [];
    const afterFrom: string[] = [];
    const inKeptArgs = commentsInKeptArgs(toks);
    const rememberBoundComment = (pos: number): void => {
      let positions = conditionCommentPositions.get(model);
      if (!positions) conditionCommentPositions.set(model, positions = new Set());
      positions.add(pos - toks[selectIdx].pos);
    };

    for (let ci = 0; ci < toks.length; ci++) {
      const c = toks[ci];
      if (c.type !== 'comment') continue;
      if (conditionCommentPositions.get(model)?.has(c.pos - toks[selectIdx].pos)) continue;
      const text = c.value;

      // (3) beforeSelect — до ВЫБРАТЬ; авто-разделители отбрасываем.
      if (ci < selectIdx) {
        if (!isAutoSeparator(text)) { beforeSelect.push(text); rememberBoundComment(c.pos); }
        continue;
      }

      // Регион списка выборки (между ВЫБРАТЬ и regionEnd).
      if (ci > selectIdx && ci < regionEnd) {
        // Interior comments belong to the projection, not a raw expression.
        // Relocate them to leading anchors so structured fields remain editable.
        const interior = segments.findIndex(s => ci > s.startTok && ci < s.endTok);
        if (interior >= 0) {
          const field = segField[interior];
          if (field) { (field.commentLeading ??= []).push(text); rememberBoundComment(c.pos); }
          continue;
        }
        const trailing = ci > (segments[0]?.startTok ?? ci) && hasCodeBeforeOnLine(toks, c.line, c.pos);
        // (1) Хвостовой — поле сегмента, на чьей последней строке стоит комментарий.
        // C17: a line holding only a separator (`\t, // c`) ends no projection; that
        // comment leads the next one like a standalone comment instead of being dropped.
        const trailingSeg = trailing
          ? segments.reduce((found, s, index) => toks[s.endTok].pos < c.pos && toks[s.endTok].line === c.line ? index : found, -1)
          : -1;
        if (trailingSeg >= 0 && segField[trailingSeg]) {
          const fld = segField[trailingSeg]!;
          fld.commentTrailing = fld.commentTrailing ? `${fld.commentTrailing} ${text}` : text;
          rememberBoundComment(c.pos);
          continue;
        }
        // (2) Полностью-строчный — commentLeading СЛЕДУЮЩЕГО сегмента
        // (первый сегмент, начинающийся ПОСЛЕ позиции комментария).
        const next = segments.findIndex(s => toks[s.startTok].pos > c.pos);
        const segIdx = next >= 0 ? next : segments.length - 1;
        // A comment after the final projection stays anchored to that projection;
        // with no projection to anchor to it goes before ВЫБРАТЬ, never dropped.
        const fld = segIdx >= 0 ? segField[segIdx] : undefined;
        (fld ? (fld.commentLeading ??= []) : beforeSelect).push(text);
        rememberBoundComment(c.pos);
        continue;
      }

      // (4) afterFrom — после ИЗ: отдельной строкой, а также (C17) хвостовой
      // комментарий, не принадлежащий ни одной секции (имя/псевдоним источника,
      // ИНДЕКСИРОВАТЬ, ДЛЯ ИЗМЕНЕНИЯ, …). Переносится за `ИЗ` дословно.
      if (fromIdx >= 0 && ci > fromIdx) {
        if (!inKeptArgs.has(ci)) { afterFrom.push(text); rememberBoundComment(c.pos); }
        continue;
      }

      // C17: anything else no section owns (the ПОМЕСТИТЬ line, a source-less
      // tail) is relocated, never dropped: after ИЗ when there is one, otherwise
      // before ВЫБРАТЬ, where reopening finds it again.
      if (inKeptArgs.has(ci)) continue;
      if (fromIdx >= 0) afterFrom.push(text); else beforeSelect.push(text);
      rememberBoundComment(c.pos);
    }

    // --- 5. Запись контейнерных комментариев (только при наличии) ----------
    if (beforeSelect.length || afterFrom.length) {
      model.comments ??= {};
      if (beforeSelect.length) model.comments.beforeSelect = beforeSelect;
      if (afterFrom.length) model.comments.afterFrom = afterFrom;
    }
  } catch {
    // Никогда не бросаем: при неожиданной форме входа оставляем модель как есть.
  }
}
