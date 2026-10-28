/**
 * C2: English spellings of SDBL words. The platform reads one bilingual word table —
 * both languages mix freely in one query, and an English word is reserved exactly
 * where its Russian pair is (`КАК From` is rejected like `AS ИЗ`). Every English
 * word therefore behaves as its Russian pair: the parser keeps a single, Russian,
 * canonical vocabulary.
 *
 * Only pairs attested on the platform are listed (test/fixtures/platform/c2-english.json;
 * UNIQUE: c58-index-unique.json, 8.5.1.1529). Russian words without an attested
 * English spelling (ДОБАВИТЬ, ГРУППИРУЮЩИМ НАБОРАМ, ХАРАКТЕРИСТИКИ) stay Russian-only.
 */

/**
 * English spellings of the lexer's keywords → the Russian keyword. A keyword token
 * of such a word carries the Russian `value` and the English `text`.
 * `ON` and `BY` both map to `ПО` (`ПО` is both words in Russian).
 */
export const ENGLISH_KEYWORDS: ReadonlyMap<string, string> = new Map([
  ['SELECT', 'ВЫБРАТЬ'], ['ALLOWED', 'РАЗРЕШЕННЫЕ'], ['DISTINCT', 'РАЗЛИЧНЫЕ'], ['TOP', 'ПЕРВЫЕ'],
  ['FROM', 'ИЗ'], ['AS', 'КАК'],
  ['SUM', 'СУММА'], ['COUNT', 'КОЛИЧЕСТВО'], ['MAX', 'МАКСИМУМ'], ['MIN', 'МИНИМУМ'], ['AVG', 'СРЕДНЕЕ'],
  ['WHERE', 'ГДЕ'], ['AND', 'И'], ['IN', 'В'], ['BETWEEN', 'МЕЖДУ'], ['LIKE', 'ПОДОБНО'],
  ['JOIN', 'СОЕДИНЕНИЕ'], ['INNER', 'ВНУТРЕННЕЕ'], ['LEFT', 'ЛЕВОЕ'], ['RIGHT', 'ПРАВОЕ'], ['FULL', 'ПОЛНОЕ'],
  ['ON', 'ПО'], ['BY', 'ПО'], ['GROUP', 'СГРУППИРОВАТЬ'], ['HAVING', 'ИМЕЮЩИЕ'],
  ['INTO', 'ПОМЕСТИТЬ'], ['DROP', 'УНИЧТОЖИТЬ'], ['ORDER', 'УПОРЯДОЧИТЬ'], ['DESC', 'УБЫВ'],
  ['AUTOORDER', 'АВТОУПОРЯДОЧИВАНИЕ'], ['TOTALS', 'ИТОГИ'], ['OVERALL', 'ОБЩИЕ'],
  ['HIERARCHY', 'ИЕРАРХИЯ'], ['ONLY', 'ТОЛЬКО'], ['INDEX', 'ИНДЕКСИРОВАТЬ'], ['UNIQUE', 'УНИКАЛЬНО'],
  ['FOR', 'ДЛЯ'], ['UPDATE', 'ИЗМЕНЕНИЯ'], ['UNION', 'ОБЪЕДИНИТЬ'], ['ALL', 'ВСЕ'],
]);

/**
 * English spellings of contextual words (lexed as identifiers) → the Russian words
 * they stand for. `HIERARCHY` is both `ИЕРАРХИЯ` (ИТОГИ … ПО … ИЕРАРХИЯ) and
 * `ИЕРАРХИИ` (`В ИЕРАРХИИ`). Identifier tokens keep their own `value` — a name
 * such as `D.Date` stays `Date` — so these words are matched through `isWordToken`
 * and `wordOf`, never by rewriting the token.
 */
export const ENGLISH_WORDS: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  ['NOT', ['НЕ']], ['OR', ['ИЛИ']], ['IS', ['ЕСТЬ']], ['ESCAPE', ['СПЕЦСИМВОЛ']],
  ['CASE', ['ВЫБОР']], ['WHEN', ['КОГДА']], ['THEN', ['ТОГДА']], ['ELSE', ['ИНАЧЕ']], ['END', ['КОНЕЦ']],
  ['TRUE', ['ИСТИНА']], ['FALSE', ['ЛОЖЬ']], ['UNDEFINED', ['НЕОПРЕДЕЛЕНО']],
  ['VALUE', ['ЗНАЧЕНИЕ']], ['TYPE', ['ТИП']], ['REFS', ['ССЫЛКА']], ['CAST', ['ВЫРАЗИТЬ']],
  ['PRESENTATION', ['ПРЕДСТАВЛЕНИЕ']], ['REFPRESENTATION', ['ПРЕДСТАВЛЕНИЕССЫЛКИ']],
  ['ASC', ['ВОЗР']], ['OUTER', ['ВНЕШНЕЕ']], ['PERIODS', ['ПЕРИОДАМИ']], ['HIERARCHY', ['ИЕРАРХИЯ', 'ИЕРАРХИИ']],
  ['STRING', ['СТРОКА']], ['NUMBER', ['ЧИСЛО']], ['DATE', ['ДАТА']], ['BOOLEAN', ['БУЛЕВО']],
  ['YEAR', ['ГОД']], ['HALFYEAR', ['ПОЛУГОДИЕ']], ['QUARTER', ['КВАРТАЛ']], ['MONTH', ['МЕСЯЦ']],
  ['TENDAYS', ['ДЕКАДА']], ['WEEK', ['НЕДЕЛЯ']], ['DAY', ['ДЕНЬ']], ['HOUR', ['ЧАС']],
  ['MINUTE', ['МИНУТА']], ['SECOND', ['СЕКУНДА']],
]);

/**
 * C2 slice 3: English metadata names, attested on the platform (the canonical text
 * prints the Russian name). Kinds absent from the probe base (РегистрРасчета,
 * ПланВидовРасчета, Последовательность) stay Russian-only.
 */
export const ENGLISH_METADATA_KINDS: ReadonlyMap<string, string> = new Map([
  ['CATALOG', 'Справочник'], ['DOCUMENT', 'Документ'], ['ENUM', 'Перечисление'], ['CONSTANT', 'Константа'],
  ['CHARTOFCHARACTERISTICTYPES', 'ПланВидовХарактеристик'], ['CHARTOFACCOUNTS', 'ПланСчетов'],
  ['EXCHANGEPLAN', 'ПланОбмена'], ['BUSINESSPROCESS', 'БизнесПроцесс'], ['TASK', 'Задача'],
  ['INFORMATIONREGISTER', 'РегистрСведений'], ['ACCUMULATIONREGISTER', 'РегистрНакопления'],
  ['ACCOUNTINGREGISTER', 'РегистрБухгалтерии'], ['DOCUMENTJOURNAL', 'ЖурналДокументов'],
  ['FILTERCRITERION', 'КритерийОтбора'],
  // C34: not attested on a platform base (SL_kza has no such objects, and the platform
  // answers `Table not found` alike for a known and an unknown kind).
  // Official 1C source (developer guide, lesson 18): CalculationRegister.
  // Third-party only (1c-syntax/bsl-parser SDBLLexer.g4 @ d446af2, not a platform
  // verdict): ChartOfCalculationTypes, Sequence.
  ['CALCULATIONREGISTER', 'РегистрРасчета'], ['CHARTOFCALCULATIONTYPES', 'ПланВидовРасчета'],
  ['SEQUENCE', 'Последовательность'],
]);

/**
 * English names of virtual tables and standard tabular sections (third segment),
 * per kind that has them: elsewhere the third segment is a configuration
 * tabular section, whose name is kept even when it reads like one of these.
 */
const BALANCE_TURNOVERS: Array<[string, string]> = [
  ['BALANCE', 'Остатки'], ['TURNOVERS', 'Обороты'], ['BALANCEANDTURNOVERS', 'ОстаткиИОбороты'],
];
export const ENGLISH_SUBTABLES: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  ['РегистрСведений', new Map([['SLICELAST', 'СрезПоследних'], ['SLICEFIRST', 'СрезПервых']])],
  ['РегистрНакопления', new Map(BALANCE_TURNOVERS)],
  ['РегистрБухгалтерии', new Map([
    ...BALANCE_TURNOVERS, ['DRCRTURNOVERS', 'ОборотыДтКт'],
    ['RECORDSWITHEXTDIMENSIONS', 'ДвиженияССубконто'], ['EXTDIMENSIONS', 'Субконто'],
  ])],
  ['ПланСчетов', new Map([['EXTDIMENSIONTYPES', 'ВидыСубконто']])],
  // C34. Official 1C source (developer guide, lesson 18): ScheduleData. Third-party only
  // (bsl-parser, as above): ActualActionPeriod, Boundaries. The base table
  // `База<Регистр>` is NOT mapped from `Base…`: a recalculation is also a third segment
  // of a calculation register, and renaming it would change a valid query.
  ['РегистрРасчета', new Map([['ACTUALACTIONPERIOD', 'ФактическийПериодДействия'], ['SCHEDULEDATA', 'ДанныеГрафика']])],
  ['Последовательность', new Map([['BOUNDARIES', 'Границы']])],
]);

/**
 * English names of standard attributes → the Russian names they may stand for.
 * `Type` is `Вид` of a chart of accounts and `Тип` of a document journal; the
 * lookup takes whichever the table has.
 */
export const ENGLISH_STANDARD_FIELDS: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  ['REF', ['Ссылка']], ['DATAVERSION', ['ВерсияДанных']], ['DELETIONMARK', ['ПометкаУдаления']],
  ['PREDEFINED', ['Предопределенный']], ['PREDEFINEDDATANAME', ['ИмяПредопределенныхДанных']],
  ['CODE', ['Код']], ['DESCRIPTION', ['Наименование']], ['PRESENTATION', ['Представление']],
  ['PARENT', ['Родитель']], ['ISFOLDER', ['ЭтоГруппа']], ['OWNER', ['Владелец']],
  ['DATE', ['Дата']], ['NUMBER', ['Номер']], ['POSTED', ['Проведен']], ['LINENUMBER', ['НомерСтроки']],
  ['ORDER', ['Порядок']], ['VALUETYPE', ['ТипЗначения']], ['TYPE', ['Вид', 'Тип']], ['OFFBALANCE', ['Забалансовый']],
  ['PERIOD', ['Период']], ['RECORDER', ['Регистратор']], ['ACTIVE', ['Активность']], ['RECORDTYPE', ['ВидДвижения']],
  ['ACCOUNTDR', ['СчетДт']], ['ACCOUNTCR', ['СчетКт']], ['EXTDIMENSIONTYPE', ['ВидСубконто']],
  ['TURNOVERSONLY', ['ТолькоОбороты']], ['STARTED', ['Стартован']], ['COMPLETED', ['Завершен']],
  ['HEADTASK', ['ВедущаяЗадача']], ['EXECUTED', ['Выполнена']], ['BUSINESSPROCESS', ['БизнесПроцесс']],
  ['ROUTEPOINT', ['ТочкаМаршрута']], ['SENTNO', ['НомерОтправленного']], ['RECEIVEDNO', ['НомерПринятого']],
  ['THISNODE', ['ЭтотУзел']], ['VALUE', ['Значение']],
]);

/** The Russian kind for an English metadata kind (any case), otherwise `kind` itself. */
export function canonicalMetadataKind(kind: string): string {
  return ENGLISH_METADATA_KINDS.get(kind.toUpperCase()) ?? kind;
}

/**
 * A source's full name with an English kind and an English virtual table or
 * standard tabular section replaced by the Russian names (the 1C Designer prints
 * them so). Object and tabular-section names of the configuration are kept.
 * A name without an English part is returned unchanged.
 */
export function canonicalTableName(fullName: string): string {
  const parts = fullName.split('.');
  if (parts.length < 2) return fullName;
  const kind = ENGLISH_METADATA_KINDS.get(parts[0].toUpperCase());
  if (kind === undefined) return fullName;
  parts[0] = kind;
  if (parts.length >= 3) parts[2] = ENGLISH_SUBTABLES.get(kind)?.get(parts[2].toUpperCase()) ?? parts[2];
  return parts.join('.');
}
