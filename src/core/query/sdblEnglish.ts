/**
 * C2: English spellings of SDBL words. The platform reads one bilingual word table —
 * both languages mix freely in one query, and an English word is reserved exactly
 * where its Russian pair is (`КАК From` is rejected like `AS ИЗ`). Every English
 * word therefore behaves as its Russian pair: the parser keeps a single, Russian,
 * canonical vocabulary.
 *
 * Only pairs attested on the platform are listed (test/fixtures/platform/c2-english.json).
 * Russian words without an attested English spelling (ДОБАВИТЬ, УНИКАЛЬНО,
 * ГРУППИРУЮЩИМ НАБОРАМ, ХАРАКТЕРИСТИКИ) stay Russian-only.
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
  ['HIERARCHY', 'ИЕРАРХИЯ'], ['ONLY', 'ТОЛЬКО'], ['INDEX', 'ИНДЕКСИРОВАТЬ'],
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
