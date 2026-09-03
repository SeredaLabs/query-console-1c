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
 *   дорожной карты валидатора — см. docs/1c-query-language.md, §5).
 *
 * Поля/реквизиты/навигация через точку НЕ проверяются (§2.2) — это остаётся
 * отдельной, значительно более крупной задачей (см. docs/1c-query-language.md).
 */
import type { BatchDocument } from './batchModel';
import type { QueryDocument, UnionMember } from './unionModel';
import { orderedSelectElements } from './unionModel';
import type { QueryModel, SelectedTable, Condition } from './queryModel';
import type { MetadataResolver } from './metadataResolver';
import { tokenize } from './sdblLexer';
import type { Token } from './sdblLexer';

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
