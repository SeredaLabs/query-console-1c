/**
 * Фаза 8.4 (+ «дорожная карта валидатора», фаза 1) — локальная семантическая
 * валидация открытия запроса.
 *
 * Работает ПОСЛЕ синтаксического разбора (`parseBatch`) и НЕ влияет на генерацию:
 * проверяет уже построенную модель пакета. Ведущий принцип — отсутствие ложных
 * срабатываний. См. дизайн §2 (docs/superpowers/specs/2026-06-27-phase8.4-…).
 *
 * Две группы проверок с РАЗНЫМ отношением к резолверу метаданных:
 * - Проверки, требующие кэша метаданных (`MetadataResolver`) — только
 *   существование таблицы-источника по полному имени `Тип.Имя` (§2.1). Без
 *   резолвера — fail-open, пропускаются (`checkTable`).
 * - Чисто СТРУКТУРНЫЕ проверки, метаданные не нужны — работают ВСЕГДА, даже без
 *   резолвера: повтор ЯВНОГО псевдонима поля выборки (§2.1), несовпадение числа
 *   колонок между ветвями ОБЪЕДИНЕНИЯ (`checkUnionColumnCount`, добавлено фазой 1
 *   дорожной карты валидатора — см. docs/development/query-model.md, §5).
 *
 * Простые квалифицированные поля выборки (`Алиас.Реквизит[.Реквизит…]`) ПРОВЕРЯЮТСЯ
 * на существование по метаданным (`checkFieldPaths`, semantic-core hardening) — но
 * ТОЛЬКО когда источник резолвится в РЕАЛЬНУЮ (не временную) таблицу метаданных:
 * состав колонок временных таблиц — эвристический вывод (`sdblParser.ts`'s
 * `registerTempTables`/`inferUndefinedTempTables`), заведомо может быть неполон, и
 * ложное «поле не найдено» там было бы хуже отсутствия проверки. Произвольные
 * выражения, поля без явного псевдонима-квалификации и подзапросы-источники не
 * проверяются вовсе.
 */
import type { BatchDocument } from './batchModel';
import type { QueryDocument, UnionMember } from './unionModel';
import { orderedSelectElements } from './unionModel';
import type { QueryModel, SelectedTable, Condition } from './queryModel';
import type { MetadataResolver } from './metadataResolver';
import { tokenize } from './sdblLexer';
import type { Token } from './sdblLexer';
import { isStructurallyValidExpression } from './expressionSyntaxCheck';
import { resolveFieldPath } from './fieldPathResolver';

export interface SemanticError {
  message: string;
  line?: number;
  col?: number;
  fullName?: string;
}

/**
 * Распознаваемые префиксы видов метаданных (ВЕРХ-регистр). Источник проверяется на
 * существование ⇔ первый сегмент его `fullName` ∈ этого набора. Исключены
 * параметризованные/голые/3-сегментные виды (КритерийОтбора/Последовательность/
 * ЖурналДокументов/ТабличнаяЧасть/ВременнаяТаблица) — их проверка дала бы ложные
 * срабатывания (ТЧ покрыта `canonicalFullName`).
 */
/**
 * Псевдо-поля платформы 1С — доступны в SDBL на ЛЮБОМ подходящем поле/таблице
 * (напр. `Товар.Представление`, `ЖурналДокументов.Взаимодействия.Тип`,
 * `Документ.Заказ.Проведен`), но НЕ являются пользовательскими реквизитами из XML
 * метаданных — загрузчик (`yamlLoader.ts`) их не материализует в `MetaField[]`,
 * потому что это не то, что описывает конфигуратор. Найдено эмпирически: полный
 * прогон checkFieldPaths по золотому корпусу (1976 реальных запросов,
 * semanticValidatorCorpus.test.ts) дал ложные срабатывания РОВНО на этих трёх
 * именах — на многих РАЗНЫХ реальных справочниках/документах/журналах, что
 * подтверждает системную (платформенную), а не случайную природу пробела.
 * Дополнять этот список ТОЛЬКО по такой же корпусной проверке, а не по догадке.
 */
const PSEUDO_FIELDS = new Set<string>(['ПРЕДСТАВЛЕНИЕ', 'ТИП', 'ПРОВЕДЕН']);

export const TYPE_PREFIXES = new Set<string>([
  'СПРАВОЧНИК',
  'ДОКУМЕНТ',
  'РЕГИСТРНАКОПЛЕНИЯ',
  'РЕГИСТРСВЕДЕНИЙ',
  'РЕГИСТРБУХГАЛТЕРИИ',
  'РЕГИСТРРАСЧЕТА',
  'ПЕРЕЧИСЛЕНИЕ',
  'ПЛАНСЧЕТОВ',
  'ПЛАНВИДОВХАРАКТЕРИСТИК',
  'ПЛАНВИДОВРАСЧЕТА',
  'ПЛАНОБМЕНА',
  'БИЗНЕСПРОЦЕСС',
  'ЗАДАЧА',
  'КОНСТАНТА',
]);

/**
 * Виды, чьи 3+-сегментные ПОДТАБЛИЦЫ (табличные части + виртуальные срезы регистров)
 * ПОЛНОСТЬЮ материализуются загрузчиком в кэше — только для них «таблица не найдена»
 * по подтаблице надёжна. У прочих видов подтаблицы в кэш не попадают:
 *   - РегистрРасчета: виртуальные `ДанныеГрафика`/`ФактическийПериодДействия`/
 *     `База…`/`Перерасчет…` загрузчиком не строятся;
 *   - БизнесПроцесс/Задача: системная `ТочкаМаршрута` не строится.
 * Поэтому по их 3-сегментным источникам действует fail-open (пропуск), чтобы не
 * блокировать валидный запрос. Базовый 2-сегментный объект каждого вида в кэше есть.
 */
const SUBTABLE_CHECKED_TYPES = new Set<string>([
  'СПРАВОЧНИК',
  'ДОКУМЕНТ',
  'РЕГИСТРНАКОПЛЕНИЯ',
  'РЕГИСТРСВЕДЕНИЙ',
  'РЕГИСТРБУХГАЛТЕРИИ',
]);

export function validateBatchSemantics(
  doc: BatchDocument,
  resolver: MetadataResolver | undefined,
  text: string,
): SemanticError[] {
  const tokens = tokenize(text);
  const errors: SemanticError[] = [];

  const checkTable = (table: SelectedTable): void => {
    // Fail-open: без резолвера (кэш не построен) существование таблицы не
    // проверяем — но это НЕ должно гасить остальные, не зависящие от метаданных
    // структурные проверки (см. checkDuplicateAliases/checkUnionColumnCount
    // ниже) — раньше единый ранний `return []` на весь `validateBatchSemantics`
    // ошибочно пропускал и их тоже, если резолвер ещё не построен (например, окно
    // «Текст запроса» открыто до того, как подтянулись метаданные конструктора).
    if (!resolver) return;
    const r = resolver;
    const resolvable = (fullName: string): boolean =>
      !!(r.tableByFullName(fullName) || r.virtualTableByFullName?.(fullName) || r.canonicalFullName?.(fullName));
    // Подзапрос-источник: проверяется рекурсией, не как имя метаданных.
    if (table.subquery) return;
    const fullName = table.fullName;
    if (!fullName || !fullName.includes('.')) return;
    const segs = fullName.split('.');
    const prefix = segs[0].toUpperCase();
    if (!TYPE_PREFIXES.has(prefix)) return;
    if (resolvable(fullName)) return;
    // Подтаблица (3+ сегмента): сообщаем «не найдена» ТОЛЬКО для видов, чьи
    // подтаблицы материализуются в кэше (SUBTABLE_CHECKED_TYPES), и лишь когда
    // 2-сегментная база резолвится (иначе об отсутствии судит проверка базы).
    // Прочие 3-сегментные источники (виртуальные РР, ТочкаМаршрута БП/Задачи) —
    // fail-open, чтобы не блокировать валидный запрос (их срезы в кэш не попадают).
    if (segs.length >= 3) {
      // «Изменения» — служебная подтаблица регистрации плана обмена, доступна
      // ЛЮБОМУ объекту-участнику обмена независимо от его вида (не только
      // СПРАВОЧНИК/ДОКУМЕНТ и т.д. из SUBTABLE_CHECKED_TYPES) и НЕ материализуется
      // загрузчиком метаданных ни для одного вида — тот же класс пробела, что для
      // РегистрРасчета/БизнесПроцесс/Задача выше, но по имени подтаблицы, а не по
      // виду. Найдено полным прогоном по золотому корпусу: 4/1976 (0.2%) ложных
      // «таблица не найдена» на реальных запросах (issue #3).
      if (segs[segs.length - 1].toUpperCase() === 'ИЗМЕНЕНИЯ') return;
      if (!SUBTABLE_CHECKED_TYPES.has(prefix)) return;
      if (!resolvable(segs[0] + '.' + segs[1])) return;
    }
    const pos = findPosition(tokens, fullName);
    errors.push({
      message: pos
        ? `{(${pos.line}, ${pos.col})}: Таблица не найдена "${fullName}"`
        : `Таблица не найдена "${fullName}"`,
      line: pos?.line,
      col: pos?.col,
      fullName,
    });
  };

  /**
   * `Алиас.Реквизит[.Реквизит…]` источника выборки не найден по метаданным
   * (semantic-core hardening). Использует `resolveFieldPath` — то же ядро, что уже
   * проверено ПОЛНЫМ корпусом 1976 запросов через `canonicalizeFieldCasing`/
   * `resolveBuilderStar`/`dropRedundantGroupDerefs` (см. test/unit/corpusRegression
   * .test.ts) — но здесь используется по-другому: не молча меняет модель, а решает,
   * стоит ли сообщить об ошибке. Сообщаем ТОЛЬКО когда `stoppedReason ===
   * 'fieldNotFound'` — мы реально нашли `MetaTable` и искали в её `fields`;
   * `'targetUnresolved'` (пробел метаданных — ссылка резолвится, но целевая таблица
   * не в кэше) НИКОГДА не считается ошибкой (unknown != invalid).
   */
  const checkFieldPaths = (model: QueryModel): void => {
    if (!resolver) return;
    const r = resolver;
    const idToTable = new Map<string, SelectedTable>();
    for (const t of model.tables) idToTable.set(t.id, t);

    for (const f of model.fields) {
      if (f.expression !== undefined) continue;
      if (!f.qualified) continue; // голову-таблицу определяем только у квалифицированного поля
      const src = idToTable.get(f.tableId);
      if (!src || src.subquery || !src.fullName || src.fullName.startsWith('&')) continue;
      const meta = r.tableByFullName(src.fullName);
      // Временные таблицы: состав колонок — эвристический вывод, может быть
      // неполон — не проверяем (см. файловый комментарий выше).
      if (!meta || meta.kind === 'ВременнаяТаблица') continue;

      const segs = f.path.split('.');
      const resolution = resolveFieldPath(meta, segs, r);
      if (resolution.stoppedReason !== 'fieldNotFound') continue;

      const badSegment = resolution.unresolvedTail[0];
      if (PSEUDO_FIELDS.has(badSegment.toUpperCase())) continue;

      const ownerMeta = resolution.resolved.length > 0
        ? (resolution.resolved[resolution.resolved.length - 1].refTarget ?? meta)
        : meta;
      errors.push({
        message: `Поле "${badSegment}" не найдено в "${ownerMeta.fullName}"`,
      });
    }
  };

  const checkDuplicateAliases = (model: QueryModel): void => {
    const seen = new Map<string, number>();
    const reported = new Set<string>();
    for (const f of model.fields) {
      // Только ЯВНЫЙ псевдоним (`… КАК <имя>`): парсер хранит его в `alias`;
      // синтезированные авто-псевдонимы `alias` не получают.
      if (!f.alias) continue;
      const key = f.alias.toLowerCase();
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count >= 2 && !reported.has(key)) {
        reported.add(key);
        errors.push({ message: `Повторяющийся псевдоним "${f.alias}"` });
      }
    }
  };

  const walkConditions = (conditions: Condition[] | undefined): void => {
    for (const c of conditions ?? []) {
      if (c.subquery) walkDocument(c.subquery);
    }
  };

  // Фаза «структурная семантика» (без метаданных, риск ложных срабатываний
  // минимальный — считается прямо по модели, как и checkDuplicateAliases).
  // Ветви ОБЪЕДИНЕНИЯ обязаны иметь ОДИНАКОВОЕ число колонок результата (как и в
  // стандартном SQL — это унаследовано, книга Хрусталевой гл. 1 «Синтаксис текста
  // запроса», рис. 1.13 показывает ветви с равным числом полей). Единица счёта —
  // элемент `orderedSelectElements` (скалярное поле ИЛИ ОДНА проекция ТЧ целиком —
  // именно так считает ширину сам генератор при выравнивании столбцов union, см.
  // `unionModel.ts`/`buildUnionBlocksWithTabSection`), а не число физических полей.
  const checkUnionColumnCount = (qdoc: QueryDocument): void => {
    if (qdoc.members.length < 2) return;
    const counts = qdoc.members.map(m => orderedSelectElements(m.model).length);
    if (counts.some(c => c !== counts[0])) {
      errors.push({
        message: `Количество столбцов в результате запроса с объединением не совпадает (${counts.join(', ')})`,
      });
    }
  };

  const walkModel = (model: QueryModel): void => {
    for (const t of model.tables) {
      if (t.subquery) walkDocument(t.subquery);
      else checkTable(t);
    }
    checkDuplicateAliases(model);
    checkFieldPaths(model);
    walkConditions(model.conditions);
    walkConditions(model.having);
  };

  function walkDocument(qdoc: QueryDocument): void {
    checkUnionColumnCount(qdoc);
    for (const member of qdoc.members) walkModel(member.model);
  }

  for (const member of doc.members) walkDocument(member);

  return errors;
}

/**
 * PR-05 (ТЗ §54 P0.5, §27/28: known-lossy/unknown preservation → BLOCK) —
 * виртуальные таблицы с непокрытыми позициями 3+ (`VirtualParams.unsafeExtraArgs`,
 * см. `parseVirtualParams` generic-fallback в sdblParser.ts и KNOWN_ISSUES.md).
 * Структурная проверка, резолвер не нужен. НАМЕРЕННО отдельна от
 * `validateBatchSemantics`: та используется и для ОТКРЫТИЯ текста в конструктор
 * (`tryOpenBatch`) — блокировать открытие/просмотр уже существующего запроса не
 * требуется (ROADMAP.md: «не редактировать … через конструктор», не «не
 * открывать»), это касается только записи (Apply) в редактор.
 */
export function findUnsafeVirtualTables(doc: BatchDocument): string[] {
  const found: string[] = [];
  const walkConditions = (conditions: Condition[] | undefined): void => {
    for (const c of conditions ?? []) if (c.subquery) walkDocument(c.subquery);
  };
  const walkModel = (model: QueryModel): void => {
    for (const t of model.tables) {
      if (t.subquery) walkDocument(t.subquery);
      else if (t.virtual?.unsafeExtraArgs) found.push(t.fullName);
    }
    walkConditions(model.conditions);
    walkConditions(model.having);
  };
  function walkDocument(qdoc: QueryDocument): void {
    for (const member of qdoc.members) walkModel(member.model);
  }
  for (const member of doc.members) walkDocument(member);
  return found;
}

/** Один custom/сырой узел модели, чей сохранённый текст структурно некорректен
 * — см. `isStructurallyValidExpression` (`expressionSyntaxCheck.ts`). */
export interface MalformedCustomHit {
  kind: 'condition' | 'joinCondition' | 'join' | 'field' | 'totalGroupField';
  text: string;
}

/**
 * Находит custom/сырые узлы модели (условия, условия соединений, соединения,
 * поля выборки, группировочные поля итогов — тот же набор, что и
 * `findRawFallbackHits` в tooling/corpus-verify/classification.ts, но здесь как
 * runtime Apply-gate, а не только для отчёта классификации корпуса), чей
 * сохранённый текст структурно некорректен по правилам
 * `isStructurallyValidExpression` (PR-14 шаг 2: не просто баланс скобок, а
 * акцептор грамматики SDBL-выражений/условий — см. её файловый комментарий).
 * Обход — рекурсивно по вложенным подзапросам, тем же способом, что и
 * `findUnsafeVirtualTables` выше (ТЗ §54 P0.5, тот же Apply-blocking gate).
 */
export function findMalformedCustomExpressions(doc: BatchDocument): MalformedCustomHit[] {
  const hits: MalformedCustomHit[] = [];
  const check = (text: string | undefined, kind: MalformedCustomHit['kind']): void => {
    if (text !== undefined && !isStructurallyValidExpression(text)) hits.push({ kind, text });
  };
  const walkConditions = (conditions: Condition[] | undefined): void => {
    for (const c of conditions ?? []) {
      if (c.custom) {
        check(c.expression, 'condition');
        check(c.leftExpr, 'condition');
      }
      if (c.subquery) walkDocument(c.subquery);
    }
  };
  const walkModel = (model: QueryModel): void => {
    for (const t of model.tables) {
      if (t.subquery) walkDocument(t.subquery);
    }
    for (const j of model.joins ?? []) {
      if (j.custom) check(j.expression, 'join');
      for (const c of j.conditions ?? []) {
        if (c.custom) check(c.expression, 'joinCondition');
      }
    }
    for (const f of model.fields) {
      if (f.expression !== undefined) check(f.expression, 'field');
    }
    for (const f of model.totals?.groupFields ?? []) {
      if (f.expression !== undefined) check(f.expression, 'totalGroupField');
    }
    walkConditions(model.conditions);
    walkConditions(model.having);
  };
  function walkDocument(qdoc: QueryDocument): void {
    for (const member of qdoc.members) walkModel(member.model);
  }
  for (const member of doc.members) walkDocument(member);
  return hits;
}

/**
 * Позиция первого сегмента полного имени в исходном тексте (best-effort): ищем
 * непрерывную последовательность токенов `сегмент . сегмент [ . сегмент ]`,
 * совпадающую с сегментами `fullName` регистронезависимо. Возвращаем строку/столбец
 * первого токена-сегмента; не нашли — `undefined` (позиция опускается).
 */
function findPosition(tokens: Token[], fullName: string): { line: number; col: number } | undefined {
  const segs = fullName.split('.').map(s => s.toUpperCase());
  const isSeg = (t: Token | undefined): boolean =>
    !!t && (t.type === 'ident' || t.type === 'keyword');
  for (let i = 0; i + (segs.length - 1) * 2 < tokens.length; i++) {
    if (!isSeg(tokens[i])) continue;
    let ok = (tokens[i].text ?? tokens[i].value).toUpperCase() === segs[0];
    for (let s = 1; ok && s < segs.length; s++) {
      const dot = tokens[i + s * 2 - 1];
      const seg = tokens[i + s * 2];
      if (!(dot && dot.type === 'punct' && dot.value === '.' && isSeg(seg) &&
            (seg.text ?? seg.value).toUpperCase() === segs[s])) {
        ok = false;
      }
    }
    if (ok) return { line: tokens[i].line, col: tokens[i].col };
  }
  return undefined;
}
