import type { QueryModel, FieldRef, SelectedTable } from './queryModel';
import { defaultTableAlias } from './queryModel';
import type { MetadataResolver } from './metadataResolver';
import type { MetaTable } from '../metadata/types';
import { tokenize, tryTokenize, isWordToken, isNameToken, type Token } from './sdblLexer';
import { META_FUNCTION_WORDS } from './sdblKeywordSets';
import { resolveFieldPath } from './fieldPathResolver';

/*
 * R11 step 2: the gates below read expressions through the shared lexer — a word
 * inside a string literal or a comment is not code (СхемаЗапроса reads a neutral and
 * a code-like literal alike: S2, S3b, S6, L1–L4 in
 * test/fixtures/platform/r11-group-by.json). Field names still match
 * case-sensitively, as before.
 * An expression the lexer cannot read never lets a rule fire.
 */

/** Code tokens of `expr` (comments dropped); `undefined` when it does not tokenize. */
function codeTokens(expr: string): Token[] | undefined {
  return tryTokenize(expr)?.filter(t => t.type !== 'eof');
}

const isPunct = (t: Token | undefined, v: string): boolean => t?.type === 'punct' && t.value === v;

/** Aggregate names (English ones belong to C2 and stay as they were). */
const AGG_WORDS = ['СУММА', 'КОЛИЧЕСТВО', 'МАКСИМУМ', 'МИНИМУМ', 'СРЕДНЕЕ', 'SUM', 'COUNT', 'MAX', 'MIN', 'AVG'];

/** `expr` calls an aggregate: an aggregate name followed by `(`. */
function hasAggregateCall(expr: string): boolean {
  const toks = codeTokens(expr);
  return !!toks && toks.some((t, i) => isWordToken(t, ...AGG_WORDS) && isPunct(toks[i + 1], '('));
}

/**
 * Start indexes in `toks` where the name chain `rendered` (`Алиас.Путь`, compared
 * case-sensitively) begins as whole names — not a tail of a longer chain (`X.` before
 * it). `whole` also requires the chain to end there (no `.` after it).
 */
function fieldChainStarts(toks: Token[], rendered: string, whole: boolean): number[] {
  const segs = rendered.split('.');
  const starts: number[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (isPunct(toks[i - 1], '.')) continue;
    let ok = true;
    for (let k = 0; k < segs.length && ok; k++) {
      const name = toks[i + 2 * k];
      ok = isNameToken(name) && name.text === segs[k] && (k === 0 || isPunct(toks[i + 2 * k - 1], '.'));
    }
    if (ok && (!whole || !isPunct(toks[i + 2 * segs.length - 1], '.'))) starts.push(i);
  }
  return starts;
}

/** `ЗНАЧЕНИЕ ( ВидДвиженияНакопления|ВидДвиженияБухгалтерии .` starts at `toks[i]`. */
function isMovementValueAt(toks: Token[], i: number): boolean {
  return isWordToken(toks[i], 'ЗНАЧЕНИЕ') && isPunct(toks[i + 1], '(')
    && isWordToken(toks[i + 2], 'ВИДДВИЖЕНИЯНАКОПЛЕНИЯ', 'ВИДДВИЖЕНИЯБУХГАЛТЕРИИ') && isPunct(toks[i + 3], '.');
}

/**
 * Тихий дроп ИЗБЫТОЧНОЙ многосегментной ссылки `Алиас.A.B…` из СГРУППИРОВАТЬ ПО
 * (фаза 6.18, по метаданным). Подтверждено живым оракулом (mcp validate_query) и
 * корпусом «другой конфигурации» (accept:oracle): элемент группировки `Алиас.A.B`
 * (навигация ЧЕРЕЗ ссылочное поле `A`) конструктор 1С ОТБРАСЫВАЕТ тогда и только
 * тогда, когда:
 *   1) в той же группировке РАНЬШЕ него присутствует элемент `Алиас.P`, где `P` —
 *      СОБСТВЕННЫЙ ПРЕФИКС пути `A.B…` (любой, не обязательно непосредственный) —
 *      группировка по префиксу-ссылке функционально определяет навигацию через неё.
 *      Порядок важен: при `Алиас.A.B` ПЕРЕД `Алиас.A` оракул СОХРАНЯЕТ оба (корпус
 *      ФормированиеПартийЗЕРНО bsl_5, сверено validate_query);
 *   2) `Алиас.A.B` НЕ присутствует отдельной колонкой в ВЫБРАТЬ (выбранное поле
 *      backs колонку результата и сохраняется в группировке);
 *   3) ПРЕФИКС `P` ДОКАЗУЕМО резолвится по метаданным в ССЫЛОЧНЫЙ РЕКВИЗИТ источника
 *      (`attribute`/`standard`-ссылка). Источник — реальная таблица метаданных, а не
 *      ВТ/подзапрос/параметр. При нерезолвимом источнике (ВТ `ВТСтрокиДоходов`,
 *      подзапрос, параметр `&Имя`) оракул не знает типов и элемент СОХРАНЯЕТ.
 *      Головной сегмент-ИЗМЕРЕНИЕ/РЕСУРС регистра — НЕ дропается (см.
 *      prefixResolvesToReference).
 *
 * Без резолвера правило не применяется (поведение webview/extension без метаданных
 * прежнее). Дроп затрагивает ТОЛЬКО ЯВНУЮ часть `groupFields`; граница
 * `explicitGroupCount` пересчитывается.
 */
export function dropRedundantGroupDerefs(model: QueryModel, resolver?: MetadataResolver): void {
  if (!resolver) return;
  const grouping = model.grouping;
  if (!grouping || grouping.multiple) return;
  const fields = grouping.groupFields;
  if (fields.length === 0) return;

  const explicitCount = grouping.explicitGroupCount ?? fields.length;
  const aliasToTable = new Map<string, SelectedTable>();
  for (const t of model.tables) aliasToTable.set(t.id, t);

  // Ключи простых полей группировки → САМЫЙ РАННИЙ индекс (для поиска префиксов).
  const groupKeyIdx = new Map<string, number>();
  for (let gi = 0; gi < fields.length; gi++) {
    const f = fields[gi];
    if (f.expression !== undefined) continue;
    if (!f.tableId || !f.path) continue;
    const gk = keyOf(f.tableId, f.path);
    if (!groupKeyIdx.has(gk)) groupKeyIdx.set(gk, gi);
  }
  // Ключи простых НЕагрегатных полей ВЫБРАТЬ (выбранное поле сохраняется в группировке).
  const selectKeys = new Set<string>();
  // Тексты НЕагрегатных выражений выборки: ссылка, чьё ЗНАЧЕНИЕ потребляется такой
  // выборкой (стоит в РЕЗУЛЬТАТЕ ТОГДА/ИНАЧЕ), оракулом СОХРАНЯЕТСЯ (Взаимозачет bsl_21).
  const nonAggSelectExprs: string[] = [];
  for (const f of [...model.fields, ...(model.trailingFields ?? [])]) {
    if (f.expression !== undefined) {
      if (f.func === undefined && !hasAggregateCall(f.expression)) nonAggSelectExprs.push(f.expression);
      continue;
    }
    if (f.func !== undefined) continue;
    if (!f.tableId || !f.path) continue;
    selectKeys.add(keyOf(f.tableId, f.path));
  }

  const dropIdx = new Set<number>();
  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression !== undefined || !f.tableId || !f.path) continue;
    if (selectKeys.has(keyOf(f.tableId, f.path))) continue; // выбранное поле — сохраняем
    const segs = f.path.split('.');
    if (segs.length < 2) continue; // не многосегментная навигация
    // Ссылка, чьё ЗНАЧЕНИЕ стоит в РЕЗУЛЬТАТЕ (после ТОГДА/ИНАЧЕ) НЕагрегатного выражения
    // выборки, потребляется им — оракул её НЕ дропает (Взаимозачет bsl_21).
    {
      const t = aliasToTable.get(f.tableId);
      const rendered = (t ? defaultTableAlias(t) : f.tableId) + '.' + f.path;
      if (nonAggSelectExprs.some(e => derefInResultPosition(e, rendered))) continue;
    }
    // Ищем СОБСТВЕННЫЙ префикс пути среди ПРЕДШЕСТВУЮЩИХ элементов группировки.
    let prefixGrouped = '';
    for (let k = segs.length - 1; k >= 1; k--) {
      const prefix = segs.slice(0, k).join('.');
      const pidx = groupKeyIdx.get(keyOf(f.tableId, prefix));
      if (pidx !== undefined && pidx < i) { prefixGrouped = prefix; break; }
    }
    if (!prefixGrouped) continue;
    // Префикс должен ДОКАЗУЕМО резолвиться по метаданным в ссылочный реквизит.
    if (!prefixResolvesToReference(aliasToTable.get(f.tableId), prefixGrouped, resolver)) continue;
    dropIdx.add(i);
  }

  if (dropIdx.size === 0) return;
  const kept: FieldRef[] = [];
  let droppedBeforeExplicit = 0;
  for (let i = 0; i < fields.length; i++) {
    if (dropIdx.has(i)) { if (i < explicitCount) droppedBeforeExplicit++; continue; }
    kept.push(fields[i]);
  }
  grouping.groupFields = kept;
  grouping.explicitGroupCount = explicitCount - droppedBeforeExplicit;
}

/**
 * Перенос в КОНЕЦ явного списка СГРУППИРОВАТЬ ПО многосегментной ссылки `Алиас.A.B`,
 * которая стоит ПЕРЕД своим префиксом `Алиас.A` (тоже сгруппированным ссылочным
 * реквизитом) и НЕ выбрана отдельной колонкой, НО участвует в АГРЕГАТНОМ выражении
 * выборки (`ВЫБОР … СУММА(…) … ИНАЧЕ Алиас.A.B КОНЕЦ`). Сверено живым оракулом
 * (validate_query) и корпусом (ФормированиеПартийЗЕРНО bsl_5):
 *   - `Алиас.A.B` ПЕРЕД `Алиас.A`, `A` — ссылочный реквизит, `Алиас.A.B` не в ВЫБРАТЬ,
 *     но текст `Алиас.A.B` есть внутри агрегатного выражения выборки → элемент
 *     СОХРАНЯЕТСЯ и СТАВИТСЯ ПОСЛЕДНИМ в явной части (после префикса).
 * Без агрегатного выражения-потребителя оракул такую ссылку отбрасывает (этот
 * подслучай корпусом не затронут и здесь НЕ трогается — нулевые регрессии).
 *
 * Применяется ПОСЛЕ dropRedundantGroupDerefs. Без резолвера не работает.
 */
export function moveBeforePrefixGroupDerefToEnd(model: QueryModel, resolver?: MetadataResolver): void {
  if (!resolver) return;
  const grouping = model.grouping;
  if (!grouping || grouping.multiple) return;
  const fields = grouping.groupFields;
  if (fields.length < 2) return;
  const explicitCount = grouping.explicitGroupCount ?? fields.length;
  if (explicitCount < 2) return;

  const aliasToTable = new Map<string, SelectedTable>();
  for (const t of model.tables) aliasToTable.set(t.id, t);

  // Самый РАННИЙ индекс каждого простого поля группировки (для поиска префикса).
  const groupKeyIdx = new Map<string, number>();
  for (let gi = 0; gi < explicitCount && gi < fields.length; gi++) {
    const f = fields[gi];
    if (f.expression !== undefined || !f.tableId || !f.path) continue;
    const gk = keyOf(f.tableId, f.path);
    if (!groupKeyIdx.has(gk)) groupKeyIdx.set(gk, gi);
  }
  // Выбранные простые поля — сохраняются как есть (отдельная колонка результата).
  const selectKeys = new Set<string>();
  for (const f of [...model.fields, ...(model.trailingFields ?? [])]) {
    if (f.expression !== undefined || f.func !== undefined) continue;
    if (!f.tableId || !f.path) continue;
    selectKeys.add(keyOf(f.tableId, f.path));
  }
  // Тексты агрегатных выражений выборки (для проверки «потребителя» ссылки).
  const aggExprTexts: string[] = [];
  for (const f of [...model.fields, ...(model.trailingFields ?? [])]) {
    if (f.expression !== undefined && hasAggregateCall(f.expression)) aggExprTexts.push(f.expression);
  }
  if (aggExprTexts.length === 0) return;

  let moveIdx = -1;
  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression !== undefined || !f.tableId || !f.path) continue;
    if (selectKeys.has(keyOf(f.tableId, f.path))) continue;
    const segs = f.path.split('.');
    if (segs.length < 2) continue;
    // Префикс должен быть сгруппирован ПОЗЖЕ (ссылка стоит ПЕРЕД префиксом).
    let prefixGrouped = '';
    for (let k = segs.length - 1; k >= 1; k--) {
      const prefix = segs.slice(0, k).join('.');
      const pidx = groupKeyIdx.get(keyOf(f.tableId, prefix));
      if (pidx !== undefined && pidx > i) { prefixGrouped = prefix; break; }
    }
    if (!prefixGrouped) continue;
    if (!prefixResolvesToReference(aliasToTable.get(f.tableId), prefixGrouped, resolver)) continue;
    // Ссылка должна употребляться в каком-либо агрегатном выражении выборки.
    const table = aliasToTable.get(f.tableId);
    const alias = table ? defaultTableAlias(table) : f.tableId;
    const rendered = alias + '.' + f.path;
    // A further navigation through the reference (`Алиас.Путь.X`) is a use too.
    const used = aggExprTexts.some(t => {
      const toks = codeTokens(t);
      return !!toks && fieldChainStarts(toks, rendered, false).length > 0;
    });
    if (!used) continue;
    moveIdx = i;
    break; // переносим ровно одну такую ссылку (корпус: единственный случай)
  }
  if (moveIdx < 0) return;

  const moved = fields[moveIdx];
  const explicit = fields.slice(0, explicitCount);
  const rest = fields.slice(explicitCount);
  explicit.splice(moveIdx, 1);
  explicit.push(moved);
  grouping.groupFields = [...explicit, ...rest];
  // explicitGroupCount не меняется — перестановка внутри явной части.
}

function keyOf(tableId: string, path: string): string {
  return tableId + '' + path;
}

/**
 * Ключ выражения для сравнения «уже в группировке»: его токены через пробел —
 * раскладка и комментарии не важны, литералы сравниваются байт-в-байт.
 * `undefined`, если лексер выражение не читает: такое выражение ни с чем не сравнимо.
 */
function normExpr(s: string): string | undefined {
  return codeTokens(s)?.map(t => t.text).join(' ');
}

/** `expr` is not grouped yet; one the lexer cannot read never qualifies. */
function isNewGroupExpr(expr: string, grouped: ReadonlySet<string>): boolean {
  const key = normExpr(expr);
  return key !== undefined && !grouped.has(key);
}

/** `expr` содержит ссылку `rendered` (`Алиас.Путь`) как ЦЕЛУЮ токен-цепочку. */
function containsFieldRef(expr: string, rendered: string): boolean {
  const toks = codeTokens(expr);
  return !!toks && fieldChainStarts(toks, rendered, true).length > 0;
}

/**
 * Замена ПРОСТОГО поля группировки `Алиас.Имя` выражением-CASE выборки `ВЫБОР…КОНЕЦ
 * КАК Имя` (с переносом в КОНЕЦ явной части СГРУППИРОВАТЬ ПО). Конструктор 1С требует,
 * чтобы каждое НЕагрегатное выражение выборки присутствовало в группировке; когда
 * разработчик сгруппировал по ЛИСТУ выражения (`Алиас.Имя`), а не по самому выражению,
 * 1С заменяет лист выражением. Сверено живым оракулом (validate_query) и ПОЛНЫМ
 * корпусом accept:oracle (17933).
 *
 * ГЛАВНЫЙ различитель (0 регрессий на полном корпусе 17933): ТОЛЬКО во ВЛОЖЕННОМ
 * подзапросе-источнике `ИЗ (ВЫБРАТЬ …)` — ВЕРХНЕУРОВНЕВУЮ группировку конструктор 1С
 * сохраняет дословно (top-level лист НЕ заменяется: ЗаполнениеОбъектов, РаспределениеЗатрат,
 * АвансовыйОтчет — все сверены полным accept:oracle), а группировку подзапроса реконструирует
 * из схемы. Доп. узкий гейт: E — `ВЫБОР…КОНЕЦ` БЕЗ агрегата (агрегатный `ВЫБОР…СУММА…` сохраняет
 * лист, НаборыСервер bsl_5), псевдоним == пути поля, лист-вхождение `Алиас.Имя`, есть поле-якорь
 * раньше, и E ЕЩЁ НЕ в группировке (дубль не плодим). Заменяется РОВНО ОДНО поле.
 */
export function substituteGroupFieldWithSelectExpr(model: QueryModel, resolver?: MetadataResolver, isSubquery = false): void {
  if (!resolver) return;
  // ТОЛЬКО во вложенном подзапросе-источнике: верхнеуровневую группировку конструктор
  // 1С сохраняет дословно (ЗаполнениеОбъектов/РаспределениеЗатрат/АвансовыйОтчет —
  // top-level, лист НЕ заменяется), а в подзапросе — реконструирует из схемы.
  if (!isSubquery) return;
  const grouping = model.grouping;
  if (!grouping || grouping.multiple) return;
  const fields = grouping.groupFields;
  if (fields.length < 2) return;
  const explicitCount = grouping.explicitGroupCount ?? fields.length;
  if (explicitCount < 2) return;

  const aliasToTable = new Map<string, SelectedTable>();
  for (const t of model.tables) aliasToTable.set(t.id, t);

  const selectKeys = new Set<string>();
  const exprCols: { alias: string; expression: string }[] = [];
  for (const f of [...model.fields, ...(model.trailingFields ?? [])]) {
    if (f.expression !== undefined) {
      if (
        f.func === undefined && f.alias &&
        /^ВЫБОР(?![\p{L}\p{N}_])/iu.test(f.expression.trim()) &&
        !hasAggregateCall(f.expression)
      ) {
        exprCols.push({ alias: f.alias, expression: f.expression });
      }
      continue;
    }
    if (f.func !== undefined || !f.tableId || !f.path) continue;
    selectKeys.add(keyOf(f.tableId, f.path));
  }
  if (exprCols.length === 0) return;

  // Выражения, УЖЕ присутствующие в группировке (нормализованные) — лист не заменяем.
  // A grouped expression the lexer cannot read could not be compared: no substitution.
  const groupedExprNorm = new Set<string>();
  for (const g of fields) {
    if (g.expression === undefined) continue;
    const key = normExpr(g.expression);
    if (key === undefined) return;
    groupedExprNorm.add(key);
  }

  const anchorBefore: boolean[] = [];
  let seenAnchor = false;
  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    anchorBefore.push(seenAnchor);
    const f = fields[i];
    if (f.expression === undefined && f.tableId && f.path && selectKeys.has(keyOf(f.tableId, f.path))) {
      seenAnchor = true;
    }
  }

  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression !== undefined || !f.tableId || !f.path) continue;
    if (selectKeys.has(keyOf(f.tableId, f.path))) continue; // backs колонку — сохраняем
    if (!anchorBefore[i]) continue;
    const table = aliasToTable.get(f.tableId);
    const nameUp = f.path.toUpperCase();
    const alias = table ? defaultTableAlias(table) : f.tableId;
    const rendered = alias + '.' + f.path;
    const expr = exprCols.find(
      e => e.alias.toUpperCase() === nameUp &&
        containsFieldRef(e.expression, rendered) &&
        isNewGroupExpr(e.expression, groupedExprNorm)
    );
    if (!expr) continue;
    const explicit = fields.slice(0, explicitCount);
    const rest = fields.slice(explicitCount);
    explicit.splice(i, 1);
    explicit.push({ tableId: '', path: '', expression: expr.expression });
    grouping.groupFields = [...explicit, ...rest];
    grouping.explicitGroupCount = explicitCount;
    return; // ровно одна замена
  }
}

/**
 * Перенос ВЕДУЩЕГО элемента группировки `ВЫБОР…КОНЕЦ` в КОНЕЦ списка, когда его
 * результат — системное перечисление вида движения регистра (`ЗНАЧЕНИЕ(
 * ВидДвиженияНакопления.…)` / `ЗНАЧЕНИЕ(ВидДвиженияБухгалтерии.…)`). Сверено живым
 * оракулом (validate_query) и корпусом accept:oracle (ПеремещениеЗапасов bsl_6,
 * ВводНачальныхОстатков bsl_16): ведущий `ВЫБОР`, возвращающий ЗНАЧЕНИЕ системного
 * вида движения, конструктор 1С ставит ПОСЛЕДНИМ в СГРУППИРОВАТЬ ПО, тогда как
 * `ВЫБОР` с результатом-`Перечисление.X` или булевым (`ЛОЖЬ/ИСТИНА`) — ОСТАЁТСЯ на
 * месте (ПроизводствоСервер bsl_9, БольничныйЛист bsl_2 — проходят). Различитель —
 * ссылка на системный вид движения в тексте выражения. Переносится РОВНО ОДИН
 * ведущий такой элемент; при отсутствии — список не меняется (байт-в-байт).
 */
export function moveLeadingMovementCaseToEnd(model: QueryModel): void {
  const grouping = model.grouping;
  if (!grouping || grouping.multiple) return;
  const fields = grouping.groupFields;
  if (fields.length < 2) return;
  const explicitCount = grouping.explicitGroupCount ?? fields.length;
  if (explicitCount < 2) return;
  const head = fields[0];
  if (head.expression === undefined) return;
  if (!isMovementCaseExpr(head.expression)) return;
  const moved = fields[0];
  const rest = fields.slice(1, explicitCount);
  const appended = fields.slice(explicitCount);
  grouping.groupFields = [...rest, moved, ...appended];
  grouping.explicitGroupCount = explicitCount;
}

/**
 * Выражение — `ВЫБОР`, результат которого ссылается на системный вид движения
 * регистра (`ВидДвиженияНакопления`/`ВидДвиженияБухгалтерии`) через `ЗНАЧЕНИЕ(…)`.
 */
function isMovementCaseExpr(expr: string): boolean {
  const toks = codeTokens(expr);
  if (!toks || !toks.some(t => isWordToken(t, 'ВЫБОР'))) return false;
  return toks.some((_, i) => isMovementValueAt(toks, i));
}

/**
 * ДОКАЗУЕМО ли путь `path` (от таблицы-источника `table`) резолвится в ССЫЛОЧНЫЙ
 * реквизит по метаданным. false при нерезолвимом источнике (ВТ/подзапрос/параметр/
 * пробел метаданных) — тогда дроп не делаем.
 *
 * ВАЖНО: дроп НЕ применяется, когда головной сегмент пути — ИЗМЕРЕНИЕ/РЕСУРС
 * регистра (`dimension`/`resource`). Сверено корпусом accept:oracle: навигация через
 * измерение регистра (`СведенияОДоходахНДФЛ.КодДохода.СтавкаНалога…` над
 * РегистрНакопления, `ДвиженияТоваров.Номенклатура.ВидАлкогольнойПродукции` над
 * РегистрНакопления.Запасы) оракулом СОХРАНЯЕТСЯ, тогда как навигация через РЕКВИЗИТ
 * табличной части/справочника (`СпецификацииСостав.Номенклатура.ЕдиницаИзмерения`,
 * `…Сотрудники.Ссылка.ОтчетныйПериод`) — отбрасывается. Различитель — категория
 * головного поля источника.
 */
function prefixResolvesToReference(
  table: SelectedTable | undefined,
  path: string,
  resolver: MetadataResolver
): boolean {
  if (!table || table.subquery) return false;
  if (!table.fullName || table.fullName.startsWith('&')) return false;
  const cur = metaFor(table.fullName, resolver);
  if (!cur) return false;
  const segs = path.split('.');
  if (segs.length === 0) return false;

  // Делегируем сам проход по цепочке в resolveFieldPath (semantic-core hardening) —
  // раньше здесь была третья независимая копия findField/firstRef/walk-цикла,
  // идентичная canonicalizeFieldCasing.ts/resolveBuilderStar.ts (обе уже
  // мигрированы). metaFor (fullName → MetaTable с фолбеком на табличную часть/срез
  // регистра, выше) остаётся своим — resolveFieldPath берёт уже готовый MetaTable.
  const resolution = resolveFieldPath(cur, segs, resolver);

  // Головной сегмент-измерение/ресурс регистра: навигацию через него оракул
  // сохраняет — дроп не делаем (только реквизит/стандартное ссылочное поле). Это
  // единственное поведение этого правила, которого resolveFieldPath намеренно НЕ
  // знает (см. его doc comment) — проверяем сами поверх структурированного
  // результата, а не внутри общего прохода.
  const head = resolution.resolved[0]?.field.kind;
  if (head === 'dimension' || head === 'resource') return false;

  // Путь резолвился целиком (ничего не осталось в "сыром" хвосте) И последний
  // сегмент — ссылка: ровно то же условие, что раньше проверял `ref !== undefined`
  // на последней итерации цикла.
  return resolution.unresolvedTail.length === 0 && resolution.kind === 'reference';
}

function metaFor(fullName: string, resolver: MetadataResolver): MetaTable | undefined {
  const direct = resolver.tableByFullName(fullName);
  if (direct) return direct;
  // Источник-табличная часть `Тип.Объект.ТЧ` (`Справочник.Спецификации.Состав`):
  // состав колонок — `tabularSections[].fields` родительской таблицы.
  const parts = fullName.split('.');
  if (parts.length === 3 && !parts[0].startsWith('Регистр')) {
    const owner = resolver.tableByFullName(parts[0] + '.' + parts[1]);
    const ts = owner?.tabularSections?.find(s => s.name.toUpperCase() === parts[2].toUpperCase());
    if (ts) return ts;
  }
  // Срез виртуальной таблицы регистра → базовый регистр.
  const m = fullName.match(/^(Регистр\p{L}+\.[^.]+)\.\p{L}+$/u);
  return m ? resolver.tableByFullName(m[1]) : undefined;
}

// ── FD-минимизация GROUP BY (CASE-вид-движения): фаза 6.19, Взаимозачет ──
// CASE-вид-движения = выражение, РЕЗУЛЬТАТ которого (после ТОГДА/ИНАЧЕ) —
// `ЗНАЧЕНИЕ(ВидДвиженияНакопления/Бухгалтерии.…)`. CASE, лишь СРАВНИВАЮЩИЙ поле с видом
// движения в УСЛОВИИ (`КОГДА X.ВидДвижения = ЗНАЧЕНИЕ(…) ТОГДА <другое>`), сюда НЕ
// относится — иначе оверфайр (УчетНДФЛ bsl_65/66, ФормаРасшифровкиПлатежа, РаботаСПодарочными).
function isMovementResultExpr(expr: string): boolean {
  const toks = codeTokens(expr);
  return !!toks && toks.some((t, i) =>
    isWordToken(t, 'ТОГДА', 'ИНАЧЕ') && isMovementValueAt(toks, isPunct(toks[i + 1], '-') ? i + 2 : i + 1));
}
const META_FUNCS = META_FUNCTION_WORDS;

/**
 * Извлекает множество ссылок-цепочек `Алиас.путь` (в исходном написании), реально
 * читающих ДАННЫЕ, из произвольного выражения. НЕ считаются полями: содержимое
 * мета-вызовов `ЗНАЧЕНИЕ/ТИП/ПРЕДСТАВЛЕНИЕ(…)`, имена функций (за идентификатором
 * сразу `(`). Голова цепочки должна быть известным псевдонимом источника.
 */
function extractFieldRefs(expr: string, aliasUp: Set<string>): Set<string> {
  let toks;
  try { toks = tokenize(expr); } catch { return new Set(); }
  const sig = toks.filter(t => t.type !== 'eof');
  const refs = new Set<string>();
  let depth = 0;
  const metaDepths: number[] = [];
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i];
    if (t.type === 'punct' && t.value === '(') {
      const head = sig[i - 1];
      const hv = head ? (head.text ?? head.value).toUpperCase() : '';
      depth++;
      if (META_FUNCS.has(hv)) metaDepths.push(depth);
      continue;
    }
    if (t.type === 'punct' && t.value === ')') {
      if (metaDepths.length && metaDepths[metaDepths.length - 1] === depth) metaDepths.pop();
      depth--;
      continue;
    }
    if (metaDepths.length) continue; // внутри ЗНАЧЕНИЕ/ТИП/ПРЕДСТАВЛЕНИЕ — не поле
    if (t.type === 'ident' || t.type === 'keyword') {
      let j = i;
      const parts = [sig[j].value];
      while (
        j + 2 < sig.length &&
        sig[j + 1].type === 'punct' && sig[j + 1].value === '.' &&
        (sig[j + 2].type === 'ident' || sig[j + 2].type === 'keyword')
      ) {
        parts.push(sig[j + 2].value);
        j += 2;
      }
      const after = sig[j + 1];
      const isCall = after && after.type === 'punct' && after.value === '(';
      if (parts.length >= 2 && !isCall && aliasUp.has(parts[0].toUpperCase())) {
        refs.add(parts.join('.'));
      }
      i = j;
    }
  }
  return refs;
}

/**
 * Ссылка `rendered` стоит в РЕЗУЛЬТАТЕ выражения: непосредственно после `ТОГДА`/`ИНАЧЕ`,
 * как ЦЕЛАЯ токен-цепочка. Условие `КОГДА … rendered …` под предикат НЕ подпадает.
 */
function derefInResultPosition(expr: string, rendered: string): boolean {
  const toks = codeTokens(expr);
  // An expression the lexer cannot read counts as a consumer: the reference stays.
  if (!toks) return true;
  return fieldChainStarts(toks, rendered, true).some(i => isWordToken(toks[i - 1], 'ТОГДА', 'ИНАЧЕ'));
}

/**
 * Минимизация GROUP BY конструктором 1С: НЕагрегатное выражение-CASE с результатом-
 * ВИДОМ-ДВИЖЕНИЯ регистра (`ЗНАЧЕНИЕ(ВидДвиженияНакопления/Бухгалтерии.…)`), которое
 * функционально определено остальными полями группировки, конструктор 1С ОТБРАСЫВАЕТ —
 * НО только когда определимость НЕ опирается на сгруппированную САМУ ссылку (`Алиас.Ссылка`).
 * Сверено живым оракулом validate_query на корпусе Взаимозачет bsl_21 (члены 185/729) и
 * серии минимальных проб: при сгруппированной `Алиас.Ссылка` тот же CASE СОХРАНЯЕТСЯ
 * (член-185), без неё — ДРОПАЕТСЯ (член-729, минимальные пробы).
 *
 * Условие дропа выражения E:
 *   (a) КАЖДАЯ ссылка-поле внутри E присутствует ОТДЕЛЬНЫМ полем группировки;
 *   (b) НИ ОДНА dereference `Алиас.A.B…` внутри E не навигирует через сгруппированный
 *       префикс `Алиас.A` (если навигирует — определимость идёт через ссылку и E СОХРАНЯЕТСЯ).
 * Ограничено выражениями-ВИДА-ДВИЖЕНИЯ (как существующий moveLeadingMovementCaseToEnd):
 * `ВЫБОР` с результатом-`Перечисление.X`/булевым оракул сохраняет (член-729: ТипРасчетов).
 * Без резолвера/при группировке-наборах правило не применяется.
 */
export function dropFunctionallyDeterminedMovementCase(model: QueryModel, resolver?: MetadataResolver): void {
  if (!resolver) return;
  const grouping = model.grouping;
  if (!grouping || grouping.multiple) return;
  const fields = grouping.groupFields;
  if (fields.length < 2) return;
  const explicitCount = grouping.explicitGroupCount ?? fields.length;

  const aliasUp = new Set<string>();
  for (const t of model.tables) aliasUp.add(defaultTableAlias(t).toUpperCase());

  // Отрендеренные ключи (UPPER) простых полей группировки в ЯВНОЙ части.
  const groupedUp = new Set<string>();
  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression !== undefined || !f.tableId || !f.path) continue;
    const t = model.tables.find(tb => tb.id === f.tableId);
    groupedUp.add(((t ? defaultTableAlias(t) : f.tableId) + '.' + f.path).toUpperCase());
  }

  const dropIdx = new Set<number>();
  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression === undefined) continue;
    if (!isMovementResultExpr(f.expression)) continue; // только вид-движения
    const refs = extractFieldRefs(f.expression, aliasUp);
    if (refs.size === 0) continue;
    let allGrouped = true;
    let navThroughGroupedRef = false;
    for (const r of refs) {
      if (!groupedUp.has(r.toUpperCase())) { allGrouped = false; break; }
      const segs = r.split('.');
      // префиксы длиной >= 2 сегментов и короче полного пути
      for (let k = 2; k < segs.length; k++) {
        if (groupedUp.has(segs.slice(0, k).join('.').toUpperCase())) { navThroughGroupedRef = true; break; }
      }
    }
    if (allGrouped && !navThroughGroupedRef) dropIdx.add(i);
  }
  if (dropIdx.size === 0) return;

  const kept: FieldRef[] = [];
  let droppedBeforeExplicit = 0;
  for (let i = 0; i < fields.length; i++) {
    if (dropIdx.has(i)) { if (i < explicitCount) droppedBeforeExplicit++; continue; }
    kept.push(fields[i]);
  }
  grouping.groupFields = kept;
  grouping.explicitGroupCount = explicitCount - droppedBeforeExplicit;
}

/**
 * Перенос в КОНЕЦ явной части GROUP BY СОХРАНённого выражения-CASE вида-движения и
 * следующих за ним (в исходном порядке) СОХРАНённых ссылок-навигаций `Алиас.A.B`,
 * чей префикс `Алиас.A` тоже сгруппирован (т.е. «избыточных, но потребляемых выборкой»
 * ссылок — их не отбросил keep-guard dropRedundantGroupDerefs). Сверено живым оракулом
 * (Взаимозачет bsl_21, член-185): хвост `… A, CASE-вид-движения, Ссылка.ДокументРасчетов,
 * B → … A, B, CASE, Ссылка.ДокументРасчетов` (CASE и навигация уезжают в конец, голое
 * поле остаётся). Применяется ПОСЛЕ dropFunctionallyDeterminedMovementCase.
 */
export function relocateKeptMovementCase(model: QueryModel, resolver?: MetadataResolver): void {
  if (!resolver) return;
  const grouping = model.grouping;
  if (!grouping || grouping.multiple) return;
  const fields = grouping.groupFields;
  if (fields.length < 2) return;
  const explicitCount = grouping.explicitGroupCount ?? fields.length;
  if (explicitCount < 2) return;

  // Префиксы-ссылки, сгруппированные отдельным полем (для «навигации через ссылку»).
  const groupedUp = new Set<string>();
  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression !== undefined || !f.tableId || !f.path) continue;
    const t = model.tables.find(tb => tb.id === f.tableId);
    groupedUp.add(((t ? defaultTableAlias(t) : f.tableId) + '.' + f.path).toUpperCase());
  }

  const aliasUp = new Set<string>();
  for (const t of model.tables) aliasUp.add(defaultTableAlias(t).toUpperCase());
  // Переносим ТОЛЬКО CASE-вид-движения, СОХРАНённый из-за навигации через сгруппированную
  // ссылку (условие keep члена-185 Взаимозачета): ВСЕ его поля сгруппированы И есть
  // навигация `Алиас.A.B` со сгруппированным префиксом `Алиас.A`. Если поля НЕ все
  // сгруппированы (РасходнаяНакладная: `ВидОперации` не в группировке) — CASE остаётся
  // на месте (оракул его НЕ двигает), переноса НЕ делаем.
  let caseIdx = -1;
  for (let i = 0; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression === undefined || !isMovementResultExpr(f.expression)) continue;
    const refs = extractFieldRefs(f.expression, aliasUp);
    if (refs.size === 0) continue;
    let allGrouped = true, navThroughGroupedRef = false;
    for (const r of refs) {
      if (!groupedUp.has(r.toUpperCase())) { allGrouped = false; break; }
      const segs = r.split('.');
      for (let k = 2; k < segs.length; k++) {
        if (groupedUp.has(segs.slice(0, k).join('.').toUpperCase())) { navThroughGroupedRef = true; break; }
      }
    }
    if (allGrouped && navThroughGroupedRef) { caseIdx = i; break; }
  }
  if (caseIdx < 0) return;

  // Собираем переносимые: сам CASE + последующие навигации `Алиас.A.B` (префикс сгруппирован).
  const moveIdx: number[] = [caseIdx];
  for (let i = caseIdx + 1; i < explicitCount && i < fields.length; i++) {
    const f = fields[i];
    if (f.expression !== undefined || !f.tableId || !f.path) continue;
    const segs = f.path.split('.');
    if (segs.length < 2) continue;
    const t = model.tables.find(tb => tb.id === f.tableId);
    const alias = t ? defaultTableAlias(t) : f.tableId;
    let prefixGrouped = false;
    for (let k = 1; k < segs.length; k++) {
      if (groupedUp.has((alias + '.' + segs.slice(0, k).join('.')).toUpperCase())) { prefixGrouped = true; break; }
    }
    if (prefixGrouped) moveIdx.push(i);
  }
  if (moveIdx.length === 0) return;

  const moveSet = new Set(moveIdx);
  const explicit = fields.slice(0, explicitCount);
  const rest = fields.slice(explicitCount);
  const head = explicit.filter((_, i) => !moveSet.has(i));
  const moved = moveIdx.map(i => explicit[i]);
  // Перенос ВНУТРИ явной части — explicitGroupCount не меняется.
  grouping.groupFields = [...head, ...moved, ...rest];
  grouping.explicitGroupCount = explicitCount;
}
