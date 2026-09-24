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
import type { QueryDocument } from './unionModel';
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
  const checkFieldPaths = (model: QueryModel, topLevel: boolean): void => {
    if (!resolver) return;
    const r = resolver;
    const idToTable = new Map<string, SelectedTable>();
    for (const t of model.tables) idToTable.set(t.id, t);

    /**
     * Проверка существования ОДНОГО поля (tableId, path) по метаданным — ядро,
     * общее для `model.fields`/`trailingFields` и всех остальных мест модели,
     * адресующих поле квалифицированной ссылкой `Алиас.Путь` (review follow-up,
     * 2026-09-22): `grouping.groupFields`/`groupSets` (СГРУППИРОВАТЬ ПО, в т.ч.
     * ГРУППИРУЮЩИМ НАБОРАМ), `order.fields` (УПОРЯДОЧИТЬ ПО), `totals.groupFields`
     * (ИТОГИ ПО), `indexing.indexes[].fields` (ИНДЕКСИРОВАТЬ ПО) — реальные
     * репро через parseBatch подтвердили: несуществующее поле в любом из них
     * давало `errors: []`, хотя семантически это тот же класс ошибки, что и в
     * SELECT.
     *
     * Дедупликация (review follow-up, 2026-09-22): одно и то же (tableId, path)
     * может законно встретиться в НЕСКОЛЬКИХ из этих мест одновременно — парсер
     * автоматически копирует явные поля SELECT в `groupFields`, когда список
     * СГРУППИРОВАТЬ ПО не задан явно. Без дедупликации несуществующее поле,
     * попавшее туда таким образом, давало ДВЕ идентичные ошибки; текущий UI
     * использует только первую (пользовательской регрессии нет), но полный
     * список `errors` не должен содержать дублей.
     */
    const reportedFieldNotFound = new Set<string>();
    const checkOne = (tableId: string, path: string): void => {
      const src = idToTable.get(tableId);
      if (!src || src.subquery || !src.fullName || src.fullName.startsWith('&')) return;
      const meta = r.tableByFullName(src.fullName);
      // Временные таблицы: состав колонок — эвристический вывод, может быть
      // неполон — не проверяем (см. файловый комментарий выше).
      if (!meta || meta.kind === 'ВременнаяТаблица') return;

      let segs = path.split('.');
      let base = meta;
      // `Алиас.<ТабличнаяЧасть>.Поле` (обращение к табличной части через точку,
      // допустимо в условиях: `Таблица.Назначение.ОбъектНазначения В (&…)`):
      // первый сегмент — не поле, а табличная часть источника, поэтому остаток
      // пути проверяется по полям самой табличной части. Найдено полным прогоном
      // по золотому корпусу (2 ложных «не найдено», когда проверка условий
      // ГДЕ была добавлена).
      const tabular = meta.tabularSections?.find(ts => ts.name.toUpperCase() === segs[0].toUpperCase());
      if (tabular) {
        if (segs.length === 1) return;
        base = tabular;
        segs = segs.slice(1);
      }
      const resolution = resolveFieldPath(base, segs, r);
      if (resolution.stoppedReason !== 'fieldNotFound') return;

      const badSegment = resolution.unresolvedTail[0];
      if (PSEUDO_FIELDS.has(badSegment.toUpperCase())) return;

      const ownerMeta = resolution.resolved.length > 0
        ? (resolution.resolved[resolution.resolved.length - 1].refTarget ?? base)
        : base;
      const dedupKey = `${tableId} ${path}`;
      if (reportedFieldNotFound.has(dedupKey)) return;
      reportedFieldNotFound.add(dedupKey);
      errors.push({
        message: `Поле "${badSegment}" не найдено в "${ownerMeta.fullName}"`,
      });
    };

    // `model.fields`/`trailingFields`: квалифицированное поле (`f.qualified`)
    // ИЛИ агрегат над квалифицированным операндом (`f.funcOperandQualified` —
    // ОТДЕЛЬНЫЙ от `qualified` флаг для случая `ФУНКЦИЯ(Алиас.Поле)`, до этого
    // фикса тоже пропускался: `СУММА(Т.НетТакогоПоля)` давало `errors: []`).
    for (const f of [...model.fields, ...(model.trailingFields ?? [])]) {
      if (f.expression !== undefined) continue;
      if (!f.qualified && !f.funcOperandQualified) continue;
      checkOne(f.tableId, f.path);
    }

    // `grouping.groupFields` (СГРУППИРОВАТЬ ПО): `parseGroupFieldRef`
    // (sdblParser.ts) НИКОГДА не проставляет `qualified` (в отличие от
    // order/totals/indexing ниже) — но `tableId`/`path` без `expression`
    // ВСЕГДА означают уже резолвленную ссылку (Алиас.Путь либо голый путь,
    // резолвленный к таблице-владельцу), поэтому гейта по `qualified` здесь
    // нет и не должно быть.
    for (const f of model.grouping?.groupFields ?? []) {
      if (f.expression !== undefined) continue;
      checkOne(f.tableId, f.path);
    }

    // `grouping.groupSets` (СГРУППИРОВАТЬ ПО ГРУППИРУЮЩИМ НАБОРАМ) — тот же
    // `FieldRef`-контракт, что и `groupFields` (набор наборов вместо одного
    // плоского списка), заполняется той же `parseGroupFieldRef` — та же
    // семантика гейта (без `qualified`, review follow-up 2026-09-22: реальный
    // репро `ГРУППИРУЮЩИМ НАБОРАМ ((X.НетТакогоПоля))` давал `errors: []`).
    for (const set of model.grouping?.groupSets ?? []) {
      for (const f of set) {
        if (f.expression !== undefined) continue;
        checkOne(f.tableId, f.path);
      }
    }

    // `order.fields`/`totals.groupFields`/`indexing.indexes[].fields`:
    // `resolveSectionFieldRef` (sdblParser.ts, общая для всех трёх) проставляет
    // `qualified: true` ТОЛЬКО для резолвленной `Алиас.Путь`/голой владелец-
    // ссылки; ссылка по псевдониму выборки (`selectAlias`) его не получает —
    // та же семантика, что и у `model.fields`, поэтому тот же гейт.
    for (const f of model.order?.fields ?? []) {
      if (f.expression !== undefined) continue;
      if (!f.qualified) continue;
      checkOne(f.tableId, f.path);
    }
    for (const f of model.totals?.groupFields ?? []) {
      if (f.expression !== undefined) continue;
      if (!f.qualified) continue;
      checkOne(f.tableId, f.path);
    }
    for (const idx of model.indexing?.indexes ?? []) {
      for (const f of idx.fields) {
        if (f.expression !== undefined) continue;
        if (!f.qualified) continue;
        checkOne(f.tableId, f.path);
      }
    }

    // `СОЕДИНЕНИЕ … ПО`: СТАНДАРТНЫЙ конъюнкт (`custom=false`) — по контракту
    // `JoinCondition` оба операнда чистые точечные `Алиас.Путь` своих
    // источников, поэтому проверяется на любом уровне вложенности. Произвольный
    // (`custom`) — сырой текст, не проверяется. `conditions` задан — это полный
    // список конъюнктов (верхнеуровневые поля соединения — лишь зеркало первого).
    for (const j of model.joins ?? []) {
      for (const c of j.conditions ?? [j]) {
        if (c.custom) continue;
        if (c.leftTableId && c.leftPath) checkOne(c.leftTableId, c.leftPath);
        if (c.rightTableId && c.rightPath) checkOne(c.rightTableId, c.rightPath);
      }
    }

    // `ГДЕ`/`ИМЕЮЩИЕ`: стандартное условие (`custom=false`, `tableId`/`path`).
    // ТОЛЬКО для запроса верхнего уровня: в подзапросе ГОЛОЕ поле условия парсер
    // привязывает к единственному локальному источнику, даже если это на деле
    // коррелированная ссылка на поле ОБЪЕМЛЮЩЕГО запроса (валидный запрос), а
    // модель не хранит, было ли поле квалифицировано в тексте — проверка там
    // дала бы ложное «не найдено». На верхнем уровне объемлющего запроса нет.
    if (topLevel) {
      for (const c of [...(model.conditions ?? []), ...(model.having ?? [])]) {
        if (c.custom || c.expression !== undefined || !c.tableId || !c.path) continue;
        checkOne(c.tableId, c.path);
      }
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

  /**
   * Источники (`ИЗ …`/`СОЕДИНЕНИЕ …`) с одинаковым (регистронезависимо)
   * псевдонимом — architecture audit P1 №4 (2026-09-22). `sdblParser.ts`
   * ВСЕГДА проставляет `alias` каждой таблице (явный `КАК`, голый псевдоним
   * или синтезированный по умолчанию — см. `parseTableSource`), и строит по
   * нему карту `aliasToId` простым `Map.set` — при коллизии ПОСЛЕДНЯЯ
   * таблица молча побеждает: КАЖДОЕ поле `Алиас.Поле`, написанное для ЛЮБОЙ
   * из таблиц-дублей (включая первую), на самом деле привязывается к
   * `tableId` последней. Это не внутренняя деталь реализации — сам 1С
   * считает такой источник неоднозначным ("Неоднозначность имени поля") и
   * не должен позволять его открыть/применить. Структурная проверка,
   * метаданные не нужны — та же категория риска, что и checkDuplicateAliases.
   */
  const checkDuplicateSourceAliases = (model: QueryModel): void => {
    const seen = new Map<string, number>();
    const reported = new Set<string>();
    for (const t of model.tables) {
      if (!t.alias) continue;
      const key = t.alias.toLowerCase();
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count >= 2 && !reported.has(key)) {
        reported.add(key);
        errors.push({ message: `Повторяющийся псевдоним источника "${t.alias}"` });
      }
    }
  };

  const walkConditions = (conditions: Condition[] | undefined): void => {
    for (const c of conditions ?? []) {
      if (c.subquery) walkDocument(c.subquery, false);
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

  const walkModel = (model: QueryModel, topLevel: boolean): void => {
    for (const t of model.tables) {
      if (t.subquery) walkDocument(t.subquery, false);
      else checkTable(t);
    }
    checkDuplicateAliases(model);
    checkDuplicateSourceAliases(model);
    checkFieldPaths(model, topLevel);
    walkConditions(model.conditions);
    walkConditions(model.having);
  };

  /** `topLevel` — члены ОБЪЕДИНЕНИЯ самого оператора пакета (без объемлющего запроса). */
  function walkDocument(qdoc: QueryDocument, topLevel: boolean): void {
    checkUnionColumnCount(qdoc);
    for (const member of qdoc.members) walkModel(member.model, topLevel);
  }

  for (const member of doc.members) walkDocument(member, true);

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
  kind:
    | 'condition' | 'joinCondition' | 'join' | 'field' | 'totalGroupField'
    // Architecture audit P1 №3 (2026-09-22) — раньше НЕ обходились вовсе:
    | 'trailingField' | 'groupField' | 'totalField' | 'orderField' | 'indexField' | 'tabSectionExpr'
    // Review follow-up (2026-09-22) — Построитель отчётов (model.builder):
    | 'builderCondition';
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
 *
 * Architecture audit P1 №3 (2026-09-22): изначальный обход пропускал ЦЕЛЫЙ
 * класс custom-текстовых узлов модели — `trailingFields` (поля ПОСЛЕ развёрнутой
 * звезды), `grouping.groupFields` (СГРУППИРОВАТЬ ПО), `totals.totalFields`
 * (агрегаты ИТОГИ — отдельно от уже проверяемых `totals.groupFields`),
 * `order.fields` (УПОРЯДОЧИТЬ ПО `&Параметр`/произвольное выражение),
 * `indexing.indexes[].fields` (ИНДЕКСИРОВАТЬ ПО), и `tabSectionFields[]`'s
 * `exprFields`/`columns` (произвольные выражения внутри проекции ТЧ) — каждый
 * из этих узлов может нести такой же непроверенный сырой текст, как уже
 * проверяемые `fields`/`conditions`, и молча проходил бы Apply-gate.
 *
 * Review follow-up (2026-09-22): `model.builder` (Построитель отчётов —
 * `{ВЫБРАТЬ}`/`{ГДЕ}`/`{УПОРЯДОЧИТЬ ПО}`/`{ИТОГИ}`) теперь тоже проверяется.
 * `parseBuilderCondition` (sdblParser.ts) собирает элемент-УСЛОВИЕ блока
 * `{ГДЕ}` (`BuilderField.condition === true`) тем же способом, что и обычные
 * `custom`-условия — токены до `,`/`}`/`КАК`, без проверки собственной
 * грамматики — подтверждено реальным репро через parseBatch: `{ГДЕ Т.Ссылка
 * = = &А}` парсится без ошибки и раньше давал `errors: []`. Обычные (не
 * `condition`) элементы построителя — ссылки поля (`Алиас.Поле`), собранные
 * парсером сегмент-за-сегментом с проверкой каждого сегмента — не могут быть
 * структурно некорректны в принципе, поэтому не проверяются (аналогично
 * тому, как голые/`custom`-размеченные условия различаются в `walkConditions`
 * ниже).
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
    for (const f of model.trailingFields ?? []) {
      if (f.expression !== undefined) check(f.expression, 'trailingField');
    }
    for (const tsf of model.tabSectionFields ?? []) {
      for (const ef of tsf.exprFields ?? []) check(ef.expression, 'tabSectionExpr');
      for (const col of tsf.columns ?? []) {
        if (col.kind === 'expr') check(col.expression, 'tabSectionExpr');
      }
    }
    for (const f of model.grouping?.groupFields ?? []) {
      if (f.expression !== undefined) check(f.expression, 'groupField');
    }
    // `grouping.groupSets` (ГРУППИРУЮЩИМ НАБОРАМ) — review follow-up
    // (2026-09-22): тот же `FieldRef`-контракт, что и `groupFields`, но
    // обходился отдельным веткам никогда; реальный репро
    // `ГРУППИРУЮЩИМ НАБОРАМ ((X.Код = = &А))` давал пустой результат.
    for (const set of model.grouping?.groupSets ?? []) {
      for (const f of set) {
        if (f.expression !== undefined) check(f.expression, 'groupField');
      }
    }
    for (const f of model.totals?.groupFields ?? []) {
      if (f.expression !== undefined) check(f.expression, 'totalGroupField');
    }
    for (const f of model.totals?.totalFields ?? []) {
      if (f.expression !== undefined) check(f.expression, 'totalField');
    }
    for (const f of model.order?.fields ?? []) {
      if (f.expression !== undefined) check(f.expression, 'orderField');
    }
    for (const idx of model.indexing?.indexes ?? []) {
      for (const f of idx.fields) {
        if (f.expression !== undefined) check(f.expression, 'indexField');
      }
    }
    const builder = model.builder;
    if (builder) {
      for (const f of [...builder.fields, ...builder.conditions, ...builder.order, ...builder.totals]) {
        if (f.condition) check(f.ref, 'builderCondition');
      }
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
