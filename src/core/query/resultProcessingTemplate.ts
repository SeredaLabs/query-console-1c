const PARAM_RE = /&([A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*)/gu;

/**
 * QUERY PARAMETER SEMANTICS BOUNDARY (fixed 2026-09-14, research-only session,
 * memory: project-semantic-core-roadmap — read that memory's own STATUS UPDATE
 * before touching anything about `&Параметр`). This function is a plain regex
 * scan (no source-map, no position tracking) used ONLY to generate
 * `УстановитьПараметр` boilerplate — it is the natural, ALREADY-EXISTING
 * starting point a future session would reach for when building real
 * query-local parameter semantics (hover/completion on `&Параметр`). Before
 * extending it (or building a real semantic-layer equivalent on top of the
 * lexer's existing `'param'` token + source-map, the way `virtualTableArg`
 * events already work), the following contract applies:
 *
 * Level 0 — Query-local parameter semantics. STATUS: allowed / current scope,
 * but NOT started — only begin this on a fresh, explicit request, never as an
 * assumed "next roadmap step". `&Дата`/`&Товар`/`&Склад` are query-local named
 * parameters, scoped to the WHOLE `BatchDocument` (not per-statement/union-
 * member — 1C's own `&Параметр` scoping is batch-wide; there is no JOIN/
 * subquery-style visibility restriction for parameters anywhere in this
 * codebase, unlike aliases). No new `Symbol` kind needed — a minimal
 * `findQueryParameterAt(snapshot, position)` / `collectQueryParameters(batch)`
 * pair, recording `'param'` token ranges via the same source-map mechanism
 * already used for `virtualTableArg`, is enough.
 *
 * Level 0's OWN acceptance boundary — it must NOT attempt to answer:
 *   - where the value comes from;
 *   - which `УстановитьПараметр` call initializes it;
 *   - what BSL expression supplies the value;
 *   - what BSL type the value has;
 *   - whether the parameter is initialized at runtime at all.
 * (This line is deliberate and load-bearing: without it, a future reader of a
 * shipped `ParameterOccurrence`-like type will be tempted to "just also find
 * `УстановитьПараметр`" as if it were the same feature. It is not — crossing
 * this line is a separate feature proposal, evaluated fresh, not a
 * continuation of Level 0.)
 *
 * Level 1 — direct local BSL binding (same variable, same procedure, no
 * branching/reassignment, e.g. `Запрос.Текст = "...&Дата..."; Запрос.
 * УстановитьПараметр("Дата", Дата);` right after). STATUS: NOT PLANNED, not a
 * numbered phase. Only ever evaluate this from scratch, after a concrete UX
 * consumer request exists — never inherited as "the next step" once Level 0
 * ships.
 *
 * Level 2+ — BSL data-flow / alias tracking / interprocedural query-object
 * binding (`Запрос.Текст = Текст;` indirection, branching reassignment, a
 * `Запрос` passed into another procedure). STATUS: OUTSIDE the project
 * roadmap entirely — deliberately not even listed as a "LATER" item, so it
 * can never be reached by incremental drift from Level 1.
 *
 * Do NOT build, for any of the above, without a real and CURRENT consumer
 * already in hand: a BSL parser/AST of our own; a `QueryHostSemanticProvider`/
 * generic "BSL adapter" contract; a BSL data-flow layer; interprocedural
 * query-object tracking; or spawning/bundling `1c-syntax/bsl-language-server`
 * (a Java 17+ console process — verified LGPL-3.0, full LSP capabilities
 * including parsing SDBL inside BSL string literals, but NO existing
 * "unbound query parameter" diagnostic in its own catalog — checked directly)
 * "just in case". This extension currently has zero runtime-process
 * dependencies; that is a real, large class of dependency to take on, not a
 * detail.
 */

/** Уникальные имена параметров (`&Имя`) в тексте запроса, в порядке первого появления. */
export function extractQueryParamNames(queryText: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of queryText.matchAll(PARAM_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Текст запроса как строковый литерал 1С, аналогично `formatAsBslString` из
 * `sdblGenerator.ts` — с одним отличием: каждая продолжающая строка (`|…`) получает
 * тот же отступ, что и открывающая кавычка (`innerIndent`), а не прижимается к левому
 * краю. Так `|` всех строк выстраиваются в одну вертикальную линию под первой строкой —
 * привычный для 1С вид многострочного текста запроса. Не переиспользует
 * `formatAsBslString` напрямую, чтобы не менять её (и вид обычной вставки без
 * обработки результата) ради этой конкретной команды.
 */
function formatQueryTextForResultProcessing(queryText: string, innerIndent: string): string {
  const lines = queryText.split('\n');
  const body = lines[0] + (lines.length > 1 ? '\n' + lines.slice(1).map(l => `${innerIndent}|${l}`).join('\n') : '');
  return `"${body}"`;
}

/**
 * Код на BSL для вставки «Конструктором запроса с обработкой результата»: объявление
 * запроса, `УстановитьПараметр` на каждый `&Параметр` встреченный в тексте (значение —
 * пустая строка-заглушка под ручное заполнение — без неё `Метод(Имя, )` синтаксически
 * невалиден), выполнение и цикл по выборке.
 *
 * `indent` — отступ строки, в которую вставляется код (берётся из реального редактора
 * вызывающей стороной): без него все строки, кроме первой (та встаёт прямо в позицию
 * курсора и наследует уже стоящий там отступ), легли бы вплотную к левому краю —
 * органично смотрится только внутри процедуры/функции без единого уровня вложенности.
 * Первая строка блока сама не сдвигается — курсор уже стоит на нужном отступе.
 */
export function buildResultProcessingCode(queryText: string, indent = ''): string {
  const paramLines = extractQueryParamNames(queryText).map(name => `Запрос.УстановитьПараметр("${name}", "");`);
  const lines = [
    'Запрос = Новый Запрос;',
    `Запрос.Текст =\n\t${formatQueryTextForResultProcessing(queryText, '\t')};`,
    // Каждый смысловой блок (текст запроса / параметры / выполнение / цикл выборки)
    // отделён пустой строкой — так рекомендует оформлять код «1С:Стандарт разработки
    // конфигураций». Блок параметров пропускается целиком, если параметров нет —
    // иначе рядом оказались бы две пустые строки подряд.
    ...(paramLines.length > 0 ? ['', ...paramLines] : []),
    '',
    'Результат = Запрос.Выполнить();',
    'Выборка = Результат.Выбрать();',
    '',
    'Пока Выборка.Следующий() Цикл',
    '\t',
    'КонецЦикла;',
  ];
  const code = lines.join('\n');
  if (!indent) return code;
  return code
    .split('\n')
    // Пустую строку не сдвигаем — иначе на ней остался бы «невидимый» отступ (trailing whitespace).
    .map((line, i) => (i === 0 || line === '' ? line : indent + line))
    .join('\n');
}
