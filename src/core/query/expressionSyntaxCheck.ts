/**
 * PR-14 шаг 2 (docs/development/known-issues.md) — структурный (НЕ семантический)
 * акцептор грамматики SDBL-выражений/условий. Проверяет, что произвольный
 * ("custom") текст, который tolerant-парсер (`sdblParser.ts`) сохранил как
 * непрозрачную строку, хотя бы СТРУКТУРНО похож на валидное выражение —
 * не полная замена парсера, а сигнал "это точно не мусор" перед Apply.
 *
 * Изучена (НЕ скопирована — только факты о грамматике, clean-room) реальная
 * ANTLR4-грамматика SDBL из 1c-syntax/bsl-parser (SDBLParser.g4/SDBLLexer.g4,
 * LGPL-3.0-or-later): `expression`/`logicalExpression`/`predicate`/
 * `functionCall`/`caseExpression`. Ключевое упрощение, оправданное самой
 * реальной грамматикой: там ВСЕ четыре арифметических оператора (`* / + -`)
 * лежат в ОДНОЙ альтернативе одного правила (без отдельных уровней приоритета
 * умножения/сложения) — значит, для чистого accept/reject приоритет операторов
 * вообще не важен, и AND/OR/сравнение/арифметику можно проверять ОДНИМ общим
 * "цепочка операнд-оператор-операнд" правилом, не только семантически верным.
 *
 * Сознательно НЕ проверяется (см. docs/development/known-issues.md — это
 * структурная, а не полная проверка):
 * - точное количество аргументов КОНКРЕТНОЙ встроенной функции (семантика,
 *   не синтаксис — риск ложных срабатываний при появлении новых функций);
 * - типы значений;
 * - вложенные подзапросы `(ВЫБРАТЬ …)` разбираются не полностью, а
 *   пропускаются целиком по балансу скобок (фаза 1, `hasBalancedDelimiters`) —
 *   их СТРУКТУРНАЯ корректность проверяется отдельно: рекурсией по вложенному
 *   QueryDocument модели, а подзапрос внутри сырого custom-текста (C48) —
 *   разбором `embeddedSubqueryTexts` в `findMalformedCustomExpressions`.
 *
 * Важно про лексер (`sdblLexer.ts`): его `KEYWORDS` — рабочий набор для
 * ГРАНИЦ сегментов (см. `collectConditionTokens`), НЕ полный каталог SDBL.
 * Многие слова, функционально являющиеся ключевыми в реальной грамматике
 * (ИЛИ, НЕ, ВЫБОР, КОГДА, ТОГДА, ИНАЧЕ, КОНЕЦ, ЕСТЬ, МЕЖДУ, ССЫЛКА, …),
 * токенизируются им как `ident`, НЕ `keyword`. Поэтому слово ищется через
 * `isWordToken` лексера (ident или keyword по каноническому значению), а не по
 * одному только `type`.
 */
import { tokenize, isWordToken, codeRanges, isCodeAt } from './sdblLexer';
import type { Token } from './sdblLexer';

function isPunct(t: Token | undefined, value: string): boolean {
  return !!t && t.type === 'punct' && t.value === value;
}

const COMPARE_OPS = ['=', '<', '>', '<=', '>=', '<>'];
const ARITH_OPS = ['+', '-', '*', '/'];

/** Курсор по уже готовому массиву токенов — только для этого accept/reject
 * акцептора, не связан с `Cursor` из `sdblParser.ts` (тот не экспортирован,
 * и трогать основной парсер здесь незачем — см. файловый комментарий). */
class ExprCursor {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}
  peek(offset = 0): Token | undefined { return this.tokens[this.i + offset]; }
  next(): Token | undefined { return this.tokens[this.i++]; }
  atEnd(): boolean { return this.i >= this.tokens.length; }
}

/**
 * Пропускает СБАЛАНСИРОВАННУЮ группу до соответствующей закрывающей скобки,
 * НЕ вникая в её содержимое — используется для вложенных подзапросов
 * `(ВЫБРАТЬ …)`, которые эта проверка сознательно не разбирает (см. файловый
 * комментарий). Курсор должен стоять СРАЗУ ПОСЛЕ открывающей `(`.
 */
function skipBalancedGroup(cur: ExprCursor): boolean {
  let depth = 1;
  for (;;) {
    const t = cur.next();
    if (!t) return false; // конец токенов раньше закрывающей скобки
    if (t.type === 'punct' && t.value === '(') depth++;
    else if (t.type === 'punct' && t.value === ')') {
      depth--;
      if (depth === 0) return true;
    }
  }
}

/** true, если то, что сейчас под курсором, похоже на начало подзапроса
 * (`ВЫБРАТЬ …`/`SELECT …`) — тогда группу в скобках не разбираем структурно. */
function looksLikeSubquery(cur: ExprCursor): boolean {
  return isWordToken(cur.peek(), 'ВЫБРАТЬ', 'SELECT');
}

/** `( <содержимое> )` после уже потреблённой `(`: подзапрос (пропускается по
 * балансу), список значений через запятую (`(expr, expr, …)` — покрывает и
 * список для `В (…)`, и одиночное выражение/условие в скобках), голая `*`
 * (`СЧИТАТЬ(*)`), либо пусто (`ПУСТАЯТАБЛИЦА.()`, `АВТОНОМЕРЗАПИСИ()`).
 *
 * C40: подзапрос допустим только как операнд `В` / `НЕ В` / `В ИЕРАРХИИ`
 * (`allowSubquery`). Скалярный подзапрос — операнд сравнения, арифметики или
 * аргумент функции — платформа отвергает как синтаксическую ошибку (8.3.15.1489,
 * test/fixtures/platform/c40-scalar-subquery.json). */
function acceptGroupContent(cur: ExprCursor, allowSubquery = false): boolean {
  if (looksLikeSubquery(cur)) return allowSubquery && skipBalancedGroup(cur);
  if (isPunct(cur.peek(), ')')) { cur.next(); return true; } // пусто
  // КОЛИЧЕСТВО(РАЗЛИЧНЫЕ …) — единственная агрегатная функция с DISTINCT
  // внутри скобок (aggregateFunctions в грамматике). Разрешаем ключевое слово
  // здесь в общем виде (не только для КОЛИЧЕСТВО) — не отличать, где именно
  // оно семантически уместно, безопаснее, чем отдельно перечислять функции.
  if (isWordToken(cur.peek(), 'РАЗЛИЧНЫЕ', 'DISTINCT')) cur.next();
  if (isPunct(cur.peek(), '*') && isPunct(cur.peek(1), ')')) { cur.next(); cur.next(); return true; }
  for (;;) {
    if (!acceptValue(cur)) return false;
    if (isPunct(cur.peek(), ',')) { cur.next(); continue; }
    if (isPunct(cur.peek(), ')')) { cur.next(); return true; }
    return false;
  }
}

/** `ВЫБОР [expr] (КОГДА … ТОГДА …)+ [ИНАЧЕ …] КОНЕЦ` — курсор стоит СРАЗУ
 * ПОСЛЕ `ВЫБОР`. Ветки читаются как обычные value-цепочки (структурная
 * проверка, не различает булево/арифметическое место использования — см.
 * файловый комментарий). */
function acceptCaseExpression(cur: ExprCursor): boolean {
  if (!isWordToken(cur.peek(), 'КОГДА', 'WHEN')) {
    // необязательное expr перед первым КОГДА
    if (!acceptValue(cur)) return false;
  }
  if (!isWordToken(cur.peek(), 'КОГДА', 'WHEN')) return false; // хотя бы одна ветка обязательна
  let hasBranch = false;
  while (isWordToken(cur.peek(), 'КОГДА', 'WHEN')) {
    cur.next();
    if (!acceptValue(cur)) return false;
    if (!isWordToken(cur.peek(), 'ТОГДА', 'THEN')) return false;
    cur.next();
    if (!acceptValue(cur)) return false;
    hasBranch = true;
  }
  if (!hasBranch) return false;
  if (isWordToken(cur.peek(), 'ИНАЧЕ', 'ELSE')) {
    cur.next();
    if (!acceptValue(cur)) return false;
  }
  if (!isWordToken(cur.peek(), 'КОНЕЦ', 'END')) return false;
  cur.next();
  return true;
}

/**
 * `ВЫРАЗИТЬ(значение КАК Тип)` — единственная функция с особым синтаксисом
 * (не список аргументов через запятую): `Тип` — простое ключевое слово типа
 * с необязательными `(длина[, точность])` (`СТРОКА(150)`, `ЧИСЛО(2, 0)`),
 * ЛИБО ссылка на тип метаданных (`Справочник.Имя`). Курсор стоит СРАЗУ ПОСЛЕ
 * уже потреблённой открывающей `(`.
 */
function acceptCastFunction(cur: ExprCursor): boolean {
  if (!acceptValue(cur)) return false;
  if (!isWordToken(cur.peek(), 'КАК', 'AS')) return false;
  cur.next();
  const typeTok = cur.peek();
  if (!typeTok || (typeTok.type !== 'ident' && typeTok.type !== 'keyword')) return false;
  cur.next();
  if (isPunct(cur.peek(), '(')) {
    cur.next();
    if (cur.peek()?.type !== 'number') return false;
    cur.next();
    if (isPunct(cur.peek(), ',')) {
      cur.next();
      if (cur.peek()?.type !== 'number') return false;
      cur.next();
    }
    if (!isPunct(cur.peek(), ')')) return false;
    cur.next();
  } else {
    acceptDottedTail(cur); // ссылка на тип метаданных: Справочник.Имя
  }
  if (!isPunct(cur.peek(), ')')) return false;
  cur.next();
  acceptDottedTail(cur); // castFunction (DOT identifier)* — редко, но грамматика допускает
  return true;
}

/** Один "атом": литерал, параметр, ссылка на поле/mdo, вызов функции,
 * ВЫБОР…КОНЕЦ, группа в скобках. Унарные `+`/`-` разворачиваются в ещё один
 * атом (курсор уже прошёл знак). */
function acceptAtom(cur: ExprCursor): boolean {
  const t = cur.peek();
  if (!t) return false;

  if (isPunct(t, '+') || isPunct(t, '-')) { cur.next(); return acceptAtom(cur); }

  if (isPunct(t, '(')) {
    cur.next();
    // C46: an empty group is not a value (the platform refuses `ГДЕ ()`); an empty
    // argument list of a call is accepted below as before.
    if (isPunct(cur.peek(), ')')) return false;
    return acceptGroupContent(cur);
  }

  if (isWordToken(t, 'ВЫБОР', 'CASE')) {
    cur.next();
    return acceptCaseExpression(cur);
  }

  if (t.type === 'number' || t.type === 'date') { cur.next(); return true; }

  if (t.type === 'string') {
    cur.next();
    while (cur.peek()?.type === 'string') cur.next(); // многострочная строка — StrN подряд
    return true;
  }

  if (t.type === 'param') { cur.next(); return true; }

  if (isWordToken(t, 'NULL', 'НЕОПРЕДЕЛЕНО', 'UNDEFINED', 'ИСТИНА', 'TRUE', 'ЛОЖЬ', 'FALSE')) {
    cur.next();
    return true;
  }

  // C45: логический оператор не бывает операндом или головой пути (`И`, `НЕ И`,
  // `… И И`, `И.Код` при псевдониме `И`). Поле с таким именем после точки (`Т.И`)
  // принимает acceptDottedTail.
  if (isWordToken(t, 'И', 'AND', 'ИЛИ', 'OR')) return false;

  // ДАТАВРЕМЯ(...) — распознаётся общим правилом "имя + скобки" ниже (ident-like).
  // Идентификатор: голая ссылка на поле/mdo (a.b.c…) ИЛИ имя функции с вызовом.
  if (t.type === 'ident' || t.type === 'keyword') {
    if (isWordToken(t, 'ВЫРАЗИТЬ', 'CAST') && isPunct(cur.peek(1), '(')) {
      cur.next(); // ВЫРАЗИТЬ/CAST
      cur.next(); // (
      return acceptCastFunction(cur);
    }
    cur.next();
    if (isPunct(cur.peek(), '(')) {
      cur.next();
      if (!acceptGroupContent(cur)) return false;
      // ВЫРАЗИТЬ(знач КАК Тип(…)) и ЗНАЧЕНИЕ(Тип.Имя.ПустаяСсылка) содержат
      // КАК/доп. точечные сегменты типа ПОСЛЕ основных скобок — структурно это
      // просто ещё один-два идентификатора через точку/КАК, не влияющие на
      // баланс; проверять их отдельно незачем (уже внутри распознанной группы
      // либо в виде безопасного точечного хвоста ниже).
      acceptDottedTail(cur);
      return true;
    }
    acceptDottedTail(cur);
    return true;
  }

  return false;
}

/** `(.identifier)*` — цепочка сегментов пути после уже принятого имени. */
function acceptDottedTail(cur: ExprCursor): void {
  for (;;) {
    if (!isPunct(cur.peek(), '.')) return;
    const next = cur.peek(1);
    if (!next || (next.type !== 'ident' && next.type !== 'keyword')) return;
    cur.next(); // '.'
    cur.next(); // identifier
  }
}

/**
 * "Значение" БЕЗ логических цепочек (И/ИЛИ/сравнение/ПОДОБНО/ЕСТЬ/В/ССЫЛКА) —
 * только атом и арифметика (`+ - * /`). Нужно для операндов МЕЖДУ: по
 * грамматике оба операнда и обе границы там — `expression` (арифметика), НЕ
 * `logicalExpression`. Если бы здесь использовался общий `acceptValue`, он
 * жадно "съел" бы разделительное И (`a МЕЖДУ &X И &Y`) как обычную цепочку
 * И/ИЛИ, оставив МЕЖДУ без его собственного И — реальный случай, найденный на
 * золотом корпусе (docs/development/known-issues.md, PR-14 шаг 2).
 */
function acceptArithmeticValue(cur: ExprCursor): boolean {
  while (isWordToken(cur.peek(), 'НЕ', 'NOT')) cur.next();
  if (!acceptAtom(cur)) return false;
  for (;;) {
    const t = cur.peek();
    if (t && t.type === 'punct' && ARITH_OPS.includes(t.value)) {
      cur.next();
      if (!acceptArithmeticValue(cur)) return false;
      continue;
    }
    return true;
  }
}

/**
 * Значение: атом, затем ноль и более "довесков" — бинарный оператор (любой из
 * И/ИЛИ/сравнение/арифметики — намеренно один уровень без приоритета, см.
 * файловый комментарий) с ещё одним значением, либо ключевые постфиксы
 * ПОДОБНО/ЕСТЬ NULL/МЕЖДУ…И…/[НЕ] В (…)/ССЫЛКА. `NOT`-префиксов перед атомом
 * может быть 0 и более (`НЕ НЕ x` — избыточно, но не менее корректно).
 */
function acceptValue(cur: ExprCursor): boolean {
  while (isWordToken(cur.peek(), 'НЕ', 'NOT')) cur.next();
  if (!acceptAtom(cur)) return false;

  for (;;) {
    const t = cur.peek();
    if (!t) return true;

    if (t.type === 'punct' && (ARITH_OPS.includes(t.value) || COMPARE_OPS.includes(t.value))) {
      cur.next();
      if (!acceptValue(cur)) return false;
      continue;
    }
    if (isWordToken(t, 'И', 'AND', 'ИЛИ', 'OR')) {
      cur.next();
      if (!acceptValue(cur)) return false;
      continue;
    }
    if (isWordToken(t, 'ПОДОБНО', 'LIKE')) {
      cur.next();
      while (isWordToken(cur.peek(), 'НЕ', 'NOT')) cur.next();
      if (!acceptValue(cur)) return false;
      if (isWordToken(cur.peek(), 'СПЕЦСИМВОЛ', 'ESCAPE')) {
        cur.next();
        if (cur.peek()?.type !== 'string') return false;
        cur.next();
        while (cur.peek()?.type === 'string') cur.next();
      }
      continue;
    }
    if (isWordToken(t, 'ЕСТЬ', 'IS')) {
      cur.next();
      if (isWordToken(cur.peek(), 'НЕ', 'NOT')) cur.next();
      if (!isWordToken(cur.peek(), 'NULL')) return false;
      cur.next();
      continue;
    }
    if (isWordToken(t, 'МЕЖДУ', 'BETWEEN')) {
      cur.next();
      if (!acceptArithmeticValue(cur)) return false;
      if (!isWordToken(cur.peek(), 'И', 'AND')) return false;
      cur.next();
      if (!acceptArithmeticValue(cur)) return false;
      continue;
    }
    // Инфиксное `НЕ` перед В / ПОДОБНО / МЕЖДУ (`Т.Имя НЕ ПОДОБНО "%т%"`; платформа
    // принимает и печатает префиксом `НЕ Т.Имя ПОДОБНО …`, SL_kza 2026-10-11).
    if (isWordToken(t, 'НЕ', 'NOT') && isWordToken(cur.peek(1), 'В', 'IN', 'ПОДОБНО', 'LIKE', 'МЕЖДУ', 'BETWEEN')) {
      cur.next(); // НЕ
      // падает в ветку В / ПОДОБНО / МЕЖДУ ниже на следующей итерации
      continue;
    }
    if (isWordToken(t, 'В', 'IN')) {
      cur.next();
      if (isWordToken(cur.peek(), 'ИЕРАРХИИ', 'HIERARCHY')) cur.next();
      if (!isPunct(cur.peek(), '(')) return false;
      cur.next();
      if (!acceptGroupContent(cur, true)) return false;
      continue;
    }
    if (isWordToken(t, 'ССЫЛКА', 'REFS')) {
      cur.next();
      if (!acceptValue(cur)) return false; // mdo-ссылка синтаксически как значение
      continue;
    }
    return true; // дальше — не наш токен, значение завершено
  }
}

/**
 * `(identifier '.')* '*'` — поле выборки "все поля [опционально — таблицы]"
 * (`ВЫБРАТЬ *` / `ВЫБРАТЬ Табл.*`). В реальной грамматике `asteriskField` —
 * САМОСТОЯТЕЛЬНАЯ альтернатива `selectedField`, не часть `expression`/
 * `logicalExpression` (звёздочка сама по себе не значение — только как
 * маркер выборки всех полей). Найдено на реальных production-конфигурациях
 * (docs/development/known-issues.md, PR-14 шаг 2) как настоящий ложный
 * позитив `acceptValue`, поэтому проверяется отдельной строгой формой, а не
 * просто "текст содержит звёздочку".
 */
function isAsteriskField(tokens: Token[]): boolean {
  if (tokens.length === 0) return false;
  let i = 0;
  while (
    i + 1 < tokens.length &&
    (tokens[i].type === 'ident' || tokens[i].type === 'keyword') &&
    isPunct(tokens[i + 1], '.')
  ) {
    i += 2;
  }
  return i === tokens.length - 1 && isPunct(tokens[i], '*');
}

/**
 * Символы, которые сам лексер (`sdblLexer.ts`, комментарий у `ONE_CHAR`)
 * намеренно не пытается понять — они встречаются в реальном коде 1С как
 * маркеры шаблонной подстановки текста запроса (`%1`, `#Товар#`,
 * `[Идентификатор]`), которые заменяются НА уровне сборки строки, ДО того как
 * получившийся текст становится настоящим SDBL. Найдено на реальных
 * production-конфигурациях (docs/development/known-issues.md, PR-14 шаг 2):
 * такой текст никогда не был "валидным SDBL" в строгом смысле (это ЗАГОТОВКА),
 * но блокировать Apply для него было бы настоящим ложным срабатыванием — мы
 * не можем судить о валидности содержимого, которое сами не подставляли.
 */
const TEMPLATE_MARKER_CHARS = /[%#@[\]]/;
const TEMPLATE_MARKER_CHARS_G = /[%#@[\]]/g;

/**
 * Маркер шаблона в КОДЕ выражения (R7): `%`/`#`/… внутри строкового литерала или
 * комментария — обычное содержимое (`"50%"`), а не заготовка, и проверку не
 * отключает. Нелексируемый текст (сами маркеры могут ломать лексер) — по-старому,
 * по всему тексту.
 */
function hasTemplateMarker(text: string): boolean {
  const ranges = codeRanges(text);
  if (!ranges) return TEMPLATE_MARKER_CHARS.test(text);
  return [...text.matchAll(TEMPLATE_MARKER_CHARS_G)].some(m => isCodeAt(ranges, m.index));
}

/**
 * C48: тексты подзапросов `(ВЫБРАТЬ …)` / `(SELECT …)` внешнего уровня внутри
 * custom-текста — без внешних скобок, в порядке появления. Границы — по токенам
 * лексера (скобки в строках и комментариях не считаются); вложенные в найденную
 * группу подзапросы не выдаются отдельно — они часть её текста. Текст с маркером
 * шаблона или нелексируемый — пусто (о нём не судим, как и акцептор выше);
 * незакрытая группа не выдаётся (её уже отвергает акцептор).
 */
export function embeddedSubqueryTexts(text: string): string[] {
  if (!/ВЫБРАТЬ|SELECT/i.test(text) || hasTemplateMarker(text)) return [];
  let tokens: Token[];
  try {
    tokens = tokenize(text).filter(t => t.type !== 'eof');
  } catch {
    return [];
  }
  const texts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isPunct(tokens[i], '(') || !isWordToken(tokens[i + 1], 'ВЫБРАТЬ', 'SELECT')) continue;
    let depth = 1;
    let j = i + 1;
    for (; j < tokens.length; j++) {
      if (isPunct(tokens[j], '(')) depth++;
      else if (isPunct(tokens[j], ')') && --depth === 0) break;
    }
    if (j === tokens.length) break;
    texts.push(text.slice(tokens[i + 1].pos, tokens[j].pos));
    i = j;
  }
  return texts;
}

/**
 * Поле выборки `ПУСТАЯТАБЛИЦА.(<колонки>)` — пустая таблица (live 1C 8.3, RP14).
 * В скобках — список ИМЁН колонок, а не выражений: каждый элемент `Имя` или
 * канонический ` КАК Имя`, пустой список допустим. Платформа отвергает `Вал.Код`,
 * `Имя КАК Псевдоним`, `&Параметр`, арифметику, вызовы и зарезервированные слова.
 * Возвращает имена колонок, если ВЕСЬ `text` — эта конструкция (голова в любом
 * регистре), иначе undefined. Допустима только в списке выборки: в условиях
 * платформа её не принимает, поэтому `isStructurallyValidExpression` её не знает.
 */
export function parseEmptyTableColumns(text: string): string[] | undefined {
  let toks: Token[];
  try {
    toks = tokenize(text).filter(t => t.type !== 'eof');
  } catch {
    return undefined;
  }
  const head = toks[0];
  if (!head || head.type !== 'ident' || head.text.toUpperCase() !== 'ПУСТАЯТАБЛИЦА') return undefined;
  if (!isPunct(toks[1], '.') || !isPunct(toks[2], '(') || !isPunct(toks[toks.length - 1], ')')) return undefined;
  const items = toks.slice(3, -1);
  const names: string[] = [];
  for (let k = 0; k < items.length; ) {
    if (items[k].type === 'keyword' && items[k].value === 'КАК') k++;
    const name = items[k];
    if (!name || name.type !== 'ident') return undefined;
    names.push(name.text);
    k++;
    if (k === items.length) break;
    if (!isPunct(items[k], ',') || k + 1 === items.length) return undefined;
    k++;
  }
  return names;
}

/**
 * true, если `text` целиком (без остатка) разбирается как одно SDBL-значение/
 * условие, либо как поле выборки "все поля" (см. `isAsteriskField`), либо
 * содержит символы-маркеры шаблонной подстановки (см. `TEMPLATE_MARKER_CHARS`
 * — тогда судить не пытаемся, считаем валидным). Пустой текст считается
 * валидным (нечего проверять). Ошибка лексера (незакрытая строка/дата и т.п.)
 * — некорректно.
 */
export function isStructurallyValidExpression(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  if (hasTemplateMarker(trimmed)) return true;
  let tokens: Token[];
  try {
    // tokenize() всегда дописывает завершающий токен type==='eof' — исключаем
    // его здесь, а не в каждой функции ниже, чтобы `cur.next()`/`cur.peek()`
    // естественно возвращали `undefined` за концом реального содержимого.
    tokens = tokenize(trimmed).filter(t => t.type !== 'eof');
  } catch {
    return false;
  }
  if (isAsteriskField(tokens)) return true;
  const cur = new ExprCursor(tokens);
  if (!acceptValue(cur)) return false;
  return cur.atEnd();
}
