# Query Core ↔ 1C:EDT Query Wizard: архітектурний аудит

Дата: 2026-10-01. Baseline Query Console: `1235b0550a7d559bc532962c6c447a3c64fab680`, версія `0.1.96`. Статус: **аудит і пропозиція на затвердження; реалізацію не розпочато**. Production code, тести, corpus і golden files не змінені.

## Executive summary

1. Концептуальна основа вже відповідає EDT: пакет → compound query → SELECT-учасник, джерела, JOIN, проєкції, умови й окремі semantic services. Переписування Query Core не обґрунтоване.
2. Правильне зіставлення: EDT `QuerySchema` ↔ наш `BatchDocument`; `QuerySchemaSelectQuery` ↔ `QueryDocument`; `QuerySchemaOperator` ↔ SELECT-частина `QueryModel`. `QuerySchemaExpression` — wrapper проєкції/виразу, а AST base — `AbstractExpression`.
3. **A2 підтверджено найсильніше.** EDT має впорядкований список проєкцій, вкладені проєкції, похідні DbView та окремий positional mapping UNION. У нас одночасно існують повний `orderedSelectElements` і scalar-only schema consumers.
4. Локальний reproduction показує три колонки producer-а (`ID`, `Строки`, `Хвост`) у generator/semantic schema і лише `ID` у parser registry/designer schema. Це доведена внутрішня розбіжність; допустимість такого `ПОМЕСТИТЬ` на платформі **UNKNOWN**.
5. Найменша еволюція A2 — спільний похідний projection/schema view поверх існуючого `QueryModel`, потім узгоджений lifetime owner. Заміна persisted arrays на новий `select[]` зараз не потрібна.
6. **A3 підтверджено як розділення semantic facts і validation.** Повна EDT-подібна expression hierarchy зараз не потрібна. Перший consumer — display-only типи з доказовою областю підтримки; unknown не стає invalid.
7. Parser-local `Строка` для числових/булевих literal-колонок ВТ — compatibility marker «не посилання». Використання його як справжнього result type дасть хибний A3.
8. **A1 підтверджено як принцип меж.** Спільні token spelling/ranges і lexical facts потрібні; grammar, scope, binding і type rules не слід переносити до lexer. Javadocs не доводять відсутність внутрішнього дублювання сканерів EDT.
9. EDT краще представляє expression structure, nested result schema, positional/nested UNION mapping і semantic service contracts. Наші raw slices, canonical provenance flags і Apply/recovery boundaries мають конкретну цінність для VS Code.
10. EDT `ql.dcs.model` розширює звичайний query model. Майбутня повна СКД — окремий downstream layer; причин зараз додавати довільний DCS extension bag до `QueryModel` немає.
11. Rarus корисний як приклад одноразової graph projection. Його fallback перетворює текст задля візуалізації; переносити такі перетворення до reversible editing/Apply не можна.
12. Gate baseline: три typechecks успішні; **166 test files, 4123 tests passed**. Optional WASM перевірки пропущені через відсутній grammar artifact. Live 1C/EDT execution та E2E у цьому аудиті не виконувалися.

## Architecture comparison

### Доказова база та межі

Позначення у звіті:

- **REPO** — прочитана реалізація на baseline, а не припущення з назв типів.
- **API** — оприлюднений class/interface/accessor та його задокументований контракт.
- **OBSERVED** — результат виконаних локальних тестів/проб.
- **INFERENCE** — рекомендація або висновок із структури API, без виконання EDT.
- **UNKNOWN** — недостатньо доказів щодо алгоритму/platform behavior.

EDT reference зафіксовано на публічних [Javadocs 2024.2][edt-model], які позначені **1.32.0-SNAPSHOT API**. Це не заява про найновішу версію EDT. Новіша поведінка, реалізація serializer/type rules та runtime equivalence із 1C Platform — UNKNOWN. Досліджено inheritance і пов’язані `ql.model`, `metadata.dbview`, `ql.resource`, `ql.typesystem`, `qw.ui.utils`, `ql.dcs.model`; Java implementation/runtime не запускався. Частина доступу здійснена через індексовані web pages; локальне завантаження EDT-сайту не вдалося через DNS.

Repo evidence: [architecture][architecture], [query model contract][model-doc], [lexical contract][lexical-doc], [roadmap][roadmap], [ADRs][adrs]. Поточний статус береться лише з [technical-debt][ledger]: A1 OPEN, A2 OPEN, A3 PARTIAL. Старі reports — історичні докази, а не новий status ledger.

```text
EDT (публічні API)
text → Xtext Resource / node model → EMF QuerySchema
                                    ├─ QuerySchemaSelectQuery
                                    │    └─ QuerySchemaOperator[]
                                    │         └─ expressions / sources / joins
                                    ├─ derived DbView + source↔derived mapper
                                    └─ type checker / resource validation
QueryWizardSource → поточні query/operator/nested context + services
schema → serializer; node model → formatter

Query Console (фактичний код)
text → shared lexer → parser + compatibility/canonical passes
                       → BatchDocument → QueryDocument → QueryModel
                            ├─ structured designer data + raw expression slices
                            ├─ derived projection / temp / metadata facts
                            └─ optional input source map
text → semantic snapshot / recovery → diagnostics/completion (advisory)
Classic / Canvas → shared reducer + session + local nested draft
model → canonical generator → strict validation → Apply text bridge
```

API: [`QuerySchemaBuilder`][builder] має text→schema, text→Resource, schema→text та окремий formatted-text API. [`QlDerivedStateComputer`][derived-state] створює/видаляє DbView для запиту й джерел; [`QlMapper`][mapper] пов’язує source model objects із derived objects. Це підтверджує **окремий derived layer**, а не збереження всієї semantic інформації всередині syntax model.

REPO: `parseDocument` у [sdblParser][parser] не є «тільки syntax parser»: він виконує star/tab-section expansion, alias/casing, grouping та інші сумісні з constructor passes. [sdblGenerator][generator] також має canonical decisions. Аудит не дає підстав механічно відокремлювати всі passes: їх порядок і режим із/без metadata є частиною робочого контракту.

### Три незалежні reference-ролі

| Reference | Що є джерелом моделі | Що він доводить | Чого він не доводить |
|---|---|---|---|
| EDT | Public EMF model + Xtext/Query Wizard service contracts | Структуру API та межі відповідальності | Platform execution, exact canonical text, preservation усіх невідомих конструкцій |
| Rarus | Native `СхемаЗапроса` + BSL graph extraction; fallback підготовка тексту | Практичний pipeline візуалізації | Незалежну граматику SDBL, reversible round-trip, platform truth для перетвореного input |
| Query Console | Власний structured/raw model, canonical generator, recorded corpus/oracle gates | Реальну поведінку baseline і перевірені випадки | Повну мову/типізацію платформи або semantic equivalence кожного Apply |

Rarus перевірено на commit `8f9d466a2324c8641ea44d6c37f65c3b652761ad`: [README][rarus-readme], [ObjectModule.bsl][rarus-code]. `ПолучитьСхемуЗапроса1С` спершу викликає native `СхемаЗапроса.УстановитьТекстЗапроса`. Fallback `КорректировкаТекстаЗапроса1С` прибирає comments, спрощує literals, metadata/value/type references і virtual parameters, а `ПеренестиВложенныеЗапросыКакСоединения` змінює вкладену структуру для graph output. **Це lossy visualization adapter.** ADAPT: derived graph поверх незмінного query model. REJECT: цей preprocessing як parse/Apply path. Native schema acceptance вихідного тексту й acceptance перетвореного тексту — різні докази.

## Detailed model mapping

Класифікація описує концепцію, не взаємозамінність API. `SAME CONCEPT` не означає однакові canonical rules. Для `EDT ONLY`/`OUR ONLY` порівнюється саме досліджений public model/API, а не всі можливості продуктів.

| EDT | Query Console | Match | Відмінність | Наслідок |
|---|---|---|---|---|
| [`QuerySchema.getQueries()`][schema] | [BatchDocument.members][batch] | SAME CONCEPT | Ordered пакет; наш root — plain TS value | Не зіставляти root із одиночним `QueryModel` |
| [`AbstractQuerySchemaQuery`][abstract-query], [`QuerySchemaSelectQuery`][select-query] | [QueryDocument.members][union] | SAME CONCEPT | Один compound SELECT містить оператори/UNION; EDT також має QuerySchemaDropTableQuery, drop у нас discriminant моделі | Layer boundaries уже є |
| [`QuerySchemaOperator`][operator] | [QueryModel][qmodel] SELECT branch | PARTIAL MATCH | Наш тип також несе drop/temp і частину compound properties | Ввести/розширити derived accessors за consumer потребою; persisted rewrite не потрібен |
| Operator union type + ordered operators; [`FieldsMapping`][fields-mapping] | `UnionMember.distinct`, `deriveUnionColumns` | PARTIAL MATCH | Positional scalar mapping є; повний nested/tabular mapping обмежено | A2 + окреме UX-C9; не змішувати alignment за ordinal з alias matching |
| Select-query order/totals/auto-order/index sets | Compound tail у останньому member; `compoundCarrierOf` читає head | DIFFERENT MODEL | EDT ownership явніший; у нас carrier/tail conventions | Узгодити читання через existing boundary; не переносити дані без міграційної потреби |
| [`QuerySchemaSource`][source] + [`AbstractQuerySchemaSource`][abstract-source] | `SelectedTable`, metadata-backed source | PARTIAL MATCH | Wrapper source містить JOIN; alias належить abstract source | Зберегти ID references; tree conversion може бути derived view |
| [`AbstractQuerySchemaTable`][table], [`QuerySchemaTable`][query-table] | Source fullName + `VirtualParams` | PARTIAL MATCH | EDT table parameters — expression objects; у нас named аргументи й raw fallback | Наша UI-адаптація корисна; не прибирати unsafe-arity guards |
| [`QuerySchemaQuerySourceJoin`][join] | `Join` + flat preorder/depth | DIFFERENT MODEL | EDT recursive source+condition; у нас seed/joined IDs відділені від operand IDs, conditions/custom | Flat form робоча; tree rewrite не потрібен, scopes повинні враховувати чинний порядок |
| [`QuerySchemaExpression`][expression] | `SelectedField`, raw `expression`, aggregate flags | PARTIAL MATCH | EDT wrapper alias + contained AST; наш field — editable/provenance form | Reuse current field identity і provenance; derived semantic facts окремо |
| [`NestedTableExpression`][nested-table] | `SelectedTabSectionField.columns/fields/exprFields` | SAME CONCEPT | EDT nested ordered wrappers; у нас legacy buckets плюс mixed columns і `selectOrder` | Outer tabular projection — одна позиція, child fields — окремий рівень |
| [`StarExpression`, `NestedTableAllFieldsExpression`][star] | Star expressions + parser expansion | PARTIAL MATCH | EDT має спеціальні nodes; точні expansion/fallback rules UNKNOWN | Не замінювати наші metadata/no-metadata правила за назвами nodes |
| [`AbstractExpression` hierarchy][abstract-expression] | Raw slices + formatter-local Boolean/CASE/arithmetic trees | DIFFERENT MODEL | Немає shared full expression AST | A3 facts API без другої граматики |
| Operator filters/having — expression wrappers | `Condition[]`, `having[]`, structured IN subquery/custom | PARTIAL MATCH | Наші прості UI-умови + raw складні форми | Зберегти structured/raw duality, не зводити усе до нових nodes |
| Grouping expressions / [`QuerySchemaGroupingSets`][grouping-sets] | `Grouping.groupFields/groupSets/aggregates` | PARTIAL MATCH | Наші FieldRef та canonical explicit-group provenance | Повну expression grouping підтримку не додавати без task і evidence |
| [`QuerySchemaOrderExpression`][order] | `OrderField` refs/raw expr/selectAlias/hierarchy | PARTIAL MATCH | Wrapper expression vs current bounded ORDER support | C21 уже CLOSED; тип арифметичного результату ще не attested |
| [`QuerySchemaTotalControlPoint`][totals] + select-query total expressions | `Totals`, `TotalGroupField`, periods/raw operands | PARTIAL MATCH | Різна гранулярність; наші flags зберігають spelling/provenance | Не переписувати totals; A1 fact migration може бути локальною |
| Placement/add-temp + derived temp DbView; position-based wizard services | `QueryType`, `tempTableName`, [tempTableSemantics][temp-semantics], parser registry, store snapshots | PARTIAL MATCH | Кілька наших schema/lifetime implementations | Спільні derived producer facts і lifecycle; exact EDT drop/recreate алгоритм UNKNOWN |
| [`QuerySchemaTempTableDescription.getTable(): ParameterExpression`][temp-description] | Metadata-free/parameter-backed source handling | PARTIAL MATCH | Це специфічний source subtype, не весь EDT temp-table lifecycle | Не плутати temp description з producer schema |
| [`QuerySchemaIndexSets`][indexes] | `QueryIndex.fields/unique` | PARTIAL MATCH | EDT index expressions vs наші refs | Існуючі набори/unique зберегти; нові expr capability — окрема задача |
| `ParameterExpression`, table parameters | `&name` у raw/Condition/VirtualParams | PARTIAL MATCH | Немає shared parameter AST або runtime value types | Спочатку derived discovery зі shared tokens; parameter type UNKNOWN без binding |
| [`QuerySchemaNestedQuery`][nested-query], `InExpression.getQuery()` | Source `subquery: QueryDocument`, `Condition.subquery` | SAME CONCEPT | Store синтезує metadata result; local source draft ізольований | A2 має живити nested output; не flatten query в JOIN |
| Source/expression alias + computeAlias | Explicit alias + `autoAliasDotted`, `exprAliasExplicit`, `qualified`, `selectAlias` | PARTIAL MATCH | Наша provenance деталізація відповідає canonical oracle cases | Не зводити прапорці до одного alias string |
| [`DbViewFromQuery`][dbview], [`DbViewNestedTableFromQuery`][nested-dbview] | Derived `MetaTable`/`MetaField` синтетичних sources | PARTIAL MATCH | EDT має явну nested field/result-table форму; наші adapter fields часто types=[] | A2 повинен відділяти projection shape від metadata adapter |
| [`DbViewFieldDef`][dbview-field] + TypeDescription | [MetaType/MetaField][metadata-types] | PARTIAL MATCH | Ref/primitive/qualifiers у нас є; derived types обмежені, bilingual identity слабша | A3 facts + окремий C2 script-variant task |
| [`IExpressionTypeChecker`][type-checker], [`CheckResult`][check-result], [`QlCheckerExpression`][checker] | Structural acceptor + field resolver + expressionContext | PARTIAL MATCH | У нас validation й display type без повних type rules | Types/validation розділити; permissive compatibility не є доказом типу |
| [`QlMapper`][mapper] source EObject ↔ derived DbView | Current object refs + synthetic sources | PARTIAL MATCH | Не те саме, що input source map | Не створювати постійний object graph mapper без consumer |
| Xtext location/offset helpers у [`ql.resource`][resource-package] | [sourceMap][source-map], semantic snapshot | PARTIAL MATCH | Наші input half-open ranges; немає output mapping | Source maps не є доведеною унікальною перевагою над EDT |
| DCS select/filter/characteristic expressions | Builder sections, optional joins, raw characteristics | PARTIAL MATCH | Наявна query syntax preservation ≠ повна СКД schema | DCS downstream окремо; existing sections не видаляти |
| Rich typed expression/result interfaces | Немає еквівалентного повного typed AST | EDT ONLY | У public model це системна capability | DEFER full hierarchy; ADOPT contracts для facts |
| Немає задокументованого еквівалента наших canonical flags/gates у цих API | Corpus/oracle fixed-point policy + tri-state lexical failure contract | OUR ONLY | Це явні repo contracts; схожі runtime guarantees EDT UNKNOWN | Зберегти як власні acceptance criteria |

## Expression model

### Що саме представляє EDT

API: [`QuerySchemaExpression`][expression] містить alias, compute-alias flag, `AbstractExpression`, type-checker accessor і aggregate query. **Це не базовий node арифметики.** [`AbstractExpression`][abstract-expression] має ієрархію арифметичних і Boolean operators, comparisons, `Between/In/IsNull/Like/Link`, literals, parameters, functions, CASE/casts, field references, brackets, nested tables, stars і template-related nodes. Це багата AST-модель відомих конструкцій; повнота для кожного синтаксису/версії платформи UNKNOWN.

| Сімейство | EDT API | Наша реалізація / межа |
|---|---|---|
| Field refs | [`SinglePartCommonExpression`][single-part], [`MultiPartCommonExpression`][multi-part]: content, source chain, DbView references | `tableId + path` для editable поля; token chains + `resolveFieldPath` для raw. Dot syntax може бути metadata/type literal, а не field ref |
| Literals / parameter | Literal nodes та `ParameterExpression` | Lexer token types/raw source; часткові formatter правила. Runtime parameter types не відомі |
| Operators | Abstract unary/binary → arithmetic/logical nodes | Private formatter trees та lexical helpers; structural acceptor не сертифікує precedence |
| Functions | [`FunctionInvocationExpression`][function-invocation]: function reference, params, distinct | Raw call, formatter/catalog; [functionCatalog][function-catalog] — snippets/labels, не type signature database |
| CASE | [`CaseOperationExpression`][case-expression]: body/selector/else | Formatter-local representation + raw preservation; shared semantic branch typing відсутній |
| IN/subquery | [`InExpression`][in-expression]: operands, nested query, hierarchy | Structured `Condition.subquery` в підтриманих slots; arbitrary raw expressions не дають повного scope graph |
| Nested projection | NestedTableExpression з ordered child wrappers | `SelectedTabSectionField.columns` із field/expr child slots |
| Unknown expression | [`EmptyExpression`][empty-expression] — node без довільного raw payload у public interface | Raw slots зберігають unsupported/unknown forms у підтриманих межах |

**UNKNOWN:** чи EDT зберігає unsupported expression/comments через Resource node model; чи builder відмовляє/відновлює конкретний input; чи arbitrary raw expression має інший internal escape hatch. Відсутність raw attribute в EMF interface не доводить втрату вихідного тексту: formatter builder прямо потребує node model. Твердження «EDT QuerySchema завжди lossy» не підтверджено.

### Чи потрібна нам повна hierarchy

**Ні, для затвердження A3 цього недостатньо.** У [queryModel][qmodel] raw expression є також preservation substrate. Нова повна AST створить grammar coverage, canonical precedence і serialization migration obligations, хоча найближчий consumer потребує тільки display type/reference facts.

[exprFormatter][formatter] уже має приватні expression trees, але вони орієнтовані на formatting і містять raw leaves. [expressionSyntaxCheck][syntax-check] — bounded structural acceptor: він допускає unknown function names, пропускає balanced subqueries і не будує precedence/type AST. Не можна назвати їх готовим semantic parser або без перевірки віддати A3 formatter-normalized текст.

Рекомендація: один bounded fact extractor використовує спільні lexical facts, current scope/resolver і явні підтримані правила; результат unknown для решти. Якщо для конкретного наступного правила реально потрібна структура, адаптувати потрібну частину existing logic окремою задачею з доказами. Не будувати новий загальний walker заради майбутнього AST.

## Projection/schema model

### A2: що підтверджено API

[`QuerySchemaOperator.getSelectFields()`][operator] повертає ordered `EList<QuerySchemaExpression>`; wrapper допускає field, expression та nested projection. [`NestedTableExpression.getFieldsName()`][nested-table] дає ordered child projection. [`DbViewFromQuery.getActualFields()`][dbview] представляє derived output, а [`DbViewNestedTableFromQuery`][nested-dbview] одночасно є result field і nested result table. **Синтаксична проєкція й result schema мають різні ролі.**

[`FieldsMapping`][fields-mapping] має positional `getField(column)`, parent/children, створення nested mapping з union position, alias operations і synchronization полів операторів/вкладених таблиць. Це підтверджує окремий hierarchical mapping view. Алгоритми padding, invalid alignment, результуючі типи UNION та правило naming при duplicate alias — UNKNOWN.

Наявність [`StarExpression`][star] та [`NestedTableAllFieldsExpression`][nested-all] документована. Порядок expansion, повнота metadata, preservation нерозв’язаної зірки й поведінка nested stars не встановлені. Не використовувати EDT як заміну live oracle для цих правил.

### A2: фактичні owners у нас

| Consumer | Вихідний projection/schema input | Фактична межа |
|---|---|---|
| Generator | `orderedSelectElements` | Head fields + mixed tabular/trailing порядок; tabular child columns зберігаються |
| Semantic temp schema | `inferCreatedTempTableSchema` → `orderedSelectElements` | Враховує всі outer elements, дедуп names, unknown types та completeness |
| Parser temp registry | `registerTempTables` → `m0.fields` | Scalar head; unresolved star skipped; literal non-reference markers |
| Designer temp lifetimes | [queryStore/snapshots.ts][store-snapshots] private lifecycle → `selectColumnAliases(model.fields)` | Scalar head schema; available tables і continuity уже share цього owner, але не core semantic lifecycle |
| UNION UI mapping | `deriveUnionColumns` → `model.fields` | Scalar-only positional mapping; tabular/trailing preserve-only guard |
| Nested source metadata | `synthesizeSubqueryTables` → `deriveUnionColumns` | Scalar output names; tabular/trailing representation неповна |

REPO: [unionModel][union] вже містить derived `SelectElement`, `orderedSelectElements`, `elementAlias`, `fieldAlias`, `selectColumnAliases`, `compoundCarrierOf`. Це найкращий starting point. `fieldAlias` інколи є semantic matching key, а printed alias залежить від контексту; не підміняти один іншим. У legacy model без повних `selectOrder` fallback bucket order intentional.

### Відтворена розбіжність

OBSERVED, metadata-free probe; не platform-valid fixture:

```sdbl
ВЫБРАТЬ
    Т.Ссылка КАК ID,
    Т.Товары.(Номенклатура КАК Номенклатура) КАК Строки,
    1 КАК Хвост
ПОМЕСТИТЬ ВТ_Аудит
ИЗ Документ.Р КАК Т;
ВЫБРАТЬ ВТ.ID ИЗ ВТ_Аудит КАК ВТ
```

| Виклик / спостереження | Колонки |
|---|---|
| `orderedSelectElements(batch.members[0].members[0].model)` | `ID`, `Строки`, `Хвост` |
| `deriveUnionColumns(batch.members[0].members)` | `ID` |
| `inferCreatedTempTableSchema(batch.members[0]).table.fields` | `ID`, `Строки`, `Хвост` |
| Reducer `LOAD_BATCH`, `SET_ACTIVE_BATCH(index: 1)`, `availableTempTables` | `ID` |
| Другий SELECT замінено на `ВЫБРАТЬ *`; `parseBatch` expansion | `ID` |
| `generateBatch` для producer | Друкує всі три проєкції у вихідному порядку |

Відтворення використовувало public repo functions із transient `/tmp/query-edt-audit-probe.ts`; script bundling/execution наведено у verification. Проба доводить, що A2 є **actual implementation divergence**, а не лише бажаним дизайном. Вона не визначає, чи tabular output допустимий у ВТ або як його має бачити consumer на платформі. Це evidence gate перед production switch.

### Мінімальна ціль A2

**Так, EDT підтверджує напрямок A2.** Спочатку зробити одну pure derived проєкцію всіх outer columns. Окремо policy-driven producer schema: nesting не flatten-иться; unresolved star/неповний producer не дає негативних «поле не існує». Існуючий completeness contract треба зберегти.

Ілюстративний API, не новий persisted model і не реалізація:

```ts
// SelectElement — існуючий тип із unionModel.ts.
interface ProjectionColumnFact {
  ordinal: number;
  element: SelectElement;
  outputName?: string; // semantic result name, не довільний rendered alias
  shape: 'scalar' | 'tabular';
}

interface ProjectionFacts {
  columns: readonly ProjectionColumnFact[];
  complete: boolean;
}

// Читає QueryModel, не змінює його й не розгортає unknown star наосліп.
declare function deriveProjectionFacts(model: QueryModel): ProjectionFacts;
```

Concrete type names і location — рішення implementation task. Не додавати ще одну stored list. Nested facts можна виводити з `element.tsf.columns` при реальному nested-schema consumer; не перетворювати tabular result на scalar `MetaType[]`. Alias provenance лишається у current fields, типи — A3 sidecar facts. Запобігати різним правилам duplicate naming у temp/nested adapters.

Далі адаптувати temp/nested/UNION consumers по одному. Lifecycle owner reuse: [tempTableSemantics][temp-semantics] уже має create→append→drop→recreate з case-insensitive names. Parser потребує sequential cursor/registry для наступної statement, а не завершеного batch upfront; core lifecycle слід адаптувати до цього режиму. Undefined-temp inference із whole-package references — **окремий compatibility fallback**, а не звичайна created-temp schema; його не викидати.

Switch може змінити star expansion, available fields, alias diagnostics і generated SDBL. Тому «all elements everywhere» не дозволений механічний рефакторинг. Спочатку facts/parity без перемикання, потім platform probe й reviewed consumer change. Повне interactive nested UNION editing — UX-C9, окрема задача після facts; завершення всього A2 lifecycle work для неї не обов’язкове.

## Semantic/type model

### A3: documented separation

[`IExpressionTypeChecker.checkType(EObject, needValidate)`][type-checker] повертає [`CheckResult`][check-result]: expression type source, validity, validation information і validation-needed state. [`QlCheckerExpression`][checker] також надає expected types; [`DerivedTypeComputerForDbViewQuery`][derived-types] окремо обчислює field type для derived output. [`QlTypeSystem`][type-system] підключає type/casting infrastructure. **API дозволяє відокремити факт типу, перевірку та result-field type.**

UNKNOWN: concrete return-type rules функцій, NULL/Undefined propagation, arithmetic coercion, CASE merge, UNION result typing та помилки для неповних metadata. Method `unionCheckResult` не є доказом правила SQL/SDBL UNION typing. Не копіювати неперевірені Java type-system припущення.

### Реальний semantic baseline

- [fieldPathResolver][field-resolver] уже є shared kernel: resolved/unresolved tail, reference/scalar/unknown, `fieldNotFound` vs unavailable reference target. Вибір reference target для composite types має поточні обмеження; повну set-valued inference не доведено.
- [metadata types][metadata-types] підтримують primitives/references/qualifiers/raw; `types: []` — unknown. Окремих result NULL/Undefined variants немає. Це не привід зараз міняти imported metadata format.
- [expressionContext][expression-context] обчислює display `resultType` для виразу, який є одним resolved field. Arbitrary arithmetic/functions/CASE дають unknown. Недописаний cursor field і unknown metadata не стають hard errors.
- [fieldTypeCompat][type-compat] permissive для unknown types. `true` означає «немає доведеного конфлікту», а не «типи рівні».
- [semanticSnapshot][snapshot] прив’язує model/maps до version/hash і completeness. Scopes/references обчислюються у semantic services; це не повний materialized scope AST. Recovery snapshot може мати відновлену повну модель, але не partial QueryModel і не authorization на Apply.
- [semanticValidator][validator] структурно/семантично перевіряє підтримані constructs із metadata і temp lifetimes; це не повний type checker мови. Наприклад, scalar alias checks і повний ordered UNION width уже використовують різні projection views.

Position-aware [resolveAliasAt][resolve-alias] вибирає innermost scope за source-map event depth/ranges у batch/UNION, FROM subquery, WHERE/HAVING subquery. JOIN condition обмежує видимість через `computeJoinVisibility`; correlation використовує nearest ancestor match. Raw opaque subqueries не утворюють complete indexed scopes. [buildSemanticSnapshotFromText][snapshot-builder] materializes лише source-alias symbols; repairs можуть замінити SELECT/trailing sections або вставити closing parentheses із mapping назад до original offsets. Recovered sources можуть бути придатними для alias completion, але repaired projection непридатна для authoritative A2/A3 result facts.

Layer invariant: `src/core/query` не імпортує `src/core/semantic` (semanticArchitectureBoundary gate). Shared A1/A2 facts, потрібні round-trip engine, належать neutral query helpers; editor semantic layer їх споживає. Display-only A3 може лишатися downstream service. Аудит не пропонує порушити цю межу чи створити parallel fields/tables/conditions tree у SemanticIndex.

### Пастка fake type facts

REPO: `registerTempTables` розпізнає string/number/Boolean literals, але **всім** присвоює `types: [{ primitive: 'Строка' }]`, а синтетичній таблиці — kind `Справочник`. Мета — canonical builder-star handling: literal завідомо не reference. Це не expression result typing. Core semantic temp schema натомість залишає types unknown.

A3 не має читати цей marker як `Число → Строка`. Найменший safe крок: semantic facts отримують справжні metadata лише для реальних sources, а synthetic literal typing виводять окремо з tokens/rules. Legacy parser adapter зберігається, доки його downstream behavior захищений tests і не мігрований окремо. Підміна kind/type без такого gate може змінити `. *` canonical output.

### Рекомендація A3

ADOPT separation; ADAPT inference. Спочатку pure, display-only result:

```ts
type ExpressionTypeFact =
  | { status: 'known'; types: readonly MetaType[] }
  | { status: 'unknown' };
```

Це sidecar result API, не поле `QueryModel` і не новий metadata serialization format. Syntax issues лишаються окремими. Перший scope — resolved single field; потім literals і тільки attested bounded rules для arithmetic/aggregate/CASE, якщо потрібні consumer-у. Unsupported function, unresolved parameter/subquery, lexical failure або insufficient evidence → unknown. Не використовувати recovered expression як strict semantic truth. A3 не повинен міняти Apply blocking або canonical output у display-only task.

## Lexer/parser/serializer boundaries

### A1: що підтверджує EDT

API: builder повертає Resource, [`QlFormatter`][edt-formatter] — Xtext formatter, [`QlDerivedStateComputer`][derived-state] — derived-state service, checker — окремий semantic service, wizard має serializer/validator accessors. Це підтримує layer separation. **Не встановлено**, що всі internal consumers EDT буквально користуються одним lexer або ніде не сканують raw text. Висновок про A1 — architectural inference, не перевірений EDT algorithm.

REPO: [sdblLexer][lexer] має token `type/value/text/pos/line/col`, optional comments та strict error. `tryTokenize` дає undefined при lexical failure; consumers не повинні вдавати порожній успішний token stream. Original spelling і half-open source slices дозволяють аналіз без довільної normalization.

У generator вже migrated token-based top-level Boolean/comma/AND/tuple helpers; залишаються char scanners/regex у generator, formatter й undefined-temp inference. [lexical contract][lexical-doc] забороняє після token failure fallback raw re-scan як друге джерело facts. Unknown має зберегти slot text і не породжувати guessed rewrite. A1 залишається OPEN; існуючі чотири міграції не завершили весь напрямок.

| Відповідальність | Owner після A1 | Межа |
|---|---|---|
| Token identity/spelling/ranges/comments | Existing sdblLexer | Не резолвить aliases, metadata, functions |
| Delimiter/top-level lexical facts | Existing/reused token helpers | Strict tri-state facts, raw preservation при failure |
| Context role: field/function/type literal/section | Parser/formatter/semantic consumer або shared bounded helper | Не глобальне перейменування кожного ident/keyword |
| Clause structure/canonical passes | Existing parser/generator | Поточний порядок і metadata modes лишаються |
| Scope/type facts | Semantic/query services | Не lexer; incomplete data fail-open |
| Output spelling/layout | Generator/formatter | Oracle-backed canonical contract, не EDT formatter output |

Builder має суттєву caveat: [`getQueryText(qwSource, validateQuerySchema)`][builder] документує виправлення schema, наприклад доповнення grouping. **REJECT** приховану мутацію в нашому read-only validation service. У нас already є canonical passes; їх не слід раптово вилучати, але нові validator API повинні чітко відділяти issues від normalization/edit operations.

Russian/English: [`QueryWizardServiceUtils`][wizard-utils] має ScriptVariant і localized text/type APIs; [`AvailableTable`][available-table] працює з metadata DbViews. Наші parser/selection detection переважно Russian-only, хоча recorded RP06/07 засвідчили English platform acceptance. Це C2, а не автоматична заміна всіх tokens на translated keywords в A1. EN canonical output і metadata naming потребують окремої probe matrix; не робити tokenizer keyword growth під виглядом lexical deduplication.

## Query Wizard state architecture

API: [`QueryWizardSource`][wizard-source] — Observable session facade над mutable schema. Він має current query/operator/nested context, copy/set operations, change notifications, available tables/parameters/temp fields, issues, serializer, resource validator і type/derived services. **Це session state + service aggregation, не заміна `QuerySchema`.** Undo/redo notification API не доводить конкретний persistence/history algorithm.

| Потреба | EDT | Query Console / оцінка |
|---|---|---|
| Поточний query/branch | Current indices/operator | [queryStore][store]: active flat fields + saved UNION/batch slots; snapshots критичні |
| Nested editing | Current nested query context, schema-by-copy | [sourceQueryDraft][source-draft] + SourceQueryEditor local reducer; commit/cancel explicit, parent query не мутується до commit |
| Notifications | Observable/model/edit adapter hooks | Reducer actions + React consumers; копіювати Java observable layer не потрібно |
| Tables/fields | AvailableTable/DbView services | Реальний metadata catalog поза state; synthetic sources у state; A2 виправляє їхні facts |
| Temp visibility | [`getTempTables(source, queryIndex)`][wizard-utils] | Semantic/parser/store position-aware policies; exact EDT append/drop/recreate невідомі |
| Parameters | Wizard discovery services | Raw `&` slots; окремий derived extractor можливий, коли потрібен consumer |
| UNION mapping | FieldsMapping tree | UnionMappingPopover scalar view + preserve-only guard для complex projection |
| Validation/serialization | Wizard validators/serializer/type services | [computeBatchText][compute-text], [applyGate][apply-gate], [validateBatch][validate-batch] shared Classic/Canvas |
| Script variants | RU/EN session metadata | Russian canonical generator; C2 separate |

Store має risk не «React проти EMF», а **повнота snapshot і дублювання derived sources**. `queryStore.modelCoverage`, preservedSections і corpusParity захищають transfer полів, включно з HAVING, trailing fields, characteristics і comments. Не замінювати working reducer на новий domain store заради схожості з EDT.

Canvas [App][canvas-app] використовує той самий reducer/session/Apply pipeline; graph layout/focus — presentation state. Це правильна межа. Nested draft — незалежна редагована копія, не довгоживучий semantic shadow graph. Stable IDs поки не мають потрібного consumer: UX-C10 DEFER лишається обґрунтованим.

### Apply й preservation: гарантії та межі

[openDesignerBatch][open-designer] parse/validate передає кандидата до designer тільки за safety policy; known comment loss перевіряється за точним текстом і кількістю comments, потребує existing consent flow. Cancel зберігає original. Це не гарантує точного comment placement. C17 для JOIN/field/group/totals raw slots лишається OPEN після WHERE/HAVING fix.

Shared [useDesignerSession][designer-session] контролює init/metadata/load, не відкриває editable destructive state при initial rejection. `computeBatchTextSafe` контролює generation failure; `decideApply` перевіряє empty/error/unsafe VT arity/malformed slots, strict output parse і selected semantics. [shared messages][messages] передають query text, а не EMF/AST або semantic snapshot.

Важлива API-відмінність: `tryParseBatch` усередині `tryOpenBatch`/`validateBatchText` викликає `parseBatch(text, undefined, opts)`, а metadata resolver передається наступній semantic validation. Прямий `parseBatch(text, resolver)` у corpus/canonical consumers має metadata-aware transformation behavior. Не зводити ці режими до одного «parse with metadata» під час consolidation.

Важлива межа V3: reparse generated output **не доводить equivalence original→output**, а structural acceptor не доводить precedence. Known unknown constructs/unsupported unsafe parameters можуть блокувати Apply. Audit не пропонує послабити ці блокери заради багатшої архітектури.

## DCS/SKD implications

API relationship:

```text
ql.model.QuerySchema
  └─ QuerySchemaSelectQuery / QuerySchemaOperator
       ↓ subtype extension
ql.dcs.model.DcsQuerySchemaSelectQuery / DcsQuerySchemaOperator
  ├─ extensions
  ├─ selectFieldsDcs / filtersDcs
  └─ characteristicsDcs
      └─ ordinary expressions / tables / nested queries + DCS properties
```

[`DcsQuerySchemaOperator`][dcs-operator] успадковує звичайний operator і додає extension parts. [`DcsQuerySchemaSelectQuery`][dcs-select] успадковує compound query та додає extension list і accessors DCS select/filter/characteristics. [`SelectFieldsCompositionDataQuerySchema`][dcs-fields] і [`FilterCompositionDataQuerySchema`][dcs-filters] використовують ordinary `QuerySchemaExpression`; filtersDcs — окрема capability, не заміна WHERE/HAVING.

[`CharacteristicCompositionDataQuerySchema`][dcs-characteristics] додає характерні key/name/type/object/value properties і type info; [`CharacteristicTypesAndValues`][dcs-values] використовує ordinary table або nested query. [`DcsParameterExpression`][dcs-parameter] є subtype звичайного parameter; [`QuerySchemaQueryGroupSourceJoin`][dcs-join] групує ordinary joins. Таким чином reused query foundations видимі без незалежного DCS parser root.

**Обмеження:** цей пакет описує DCS query-language extensions. З нього не випливає повна схема datasets/settings/resources/layout СКД, їх persistence або runtime computation. Ці речі в межах цього аудиту UNKNOWN; не змішувати їх із `{ВЫБРАТЬ ...}` / `{ГДЕ ...}` query syntax.

Рекомендований relationship у нас:

```text
Query Core
  model + lexical facts + derived projection/schema/type facts + scope
       ↓ явний consumer boundary
future DCS/SKD layer
  datasets / DCS-specific selection/filter/characteristics / settings
       ↓
future dedicated DCS UI / import-export / validation
```

**Зараз не змінювати persisted QueryModel заради гіпотетичної СКД.** Мінімальні фундаментальні речі A1/A2/A3 потрібні вже current consumers: ordered projection, honest unknown/type facts, isolated validation й script-variant design constraint. Залишити ordinary QueryDocument/nested model, existing builder sections/optional joins/raw characteristics і neutral resolver interfaces. Це наявні extension seams, не привід додавати generic plugin map, DCS discriminants чи inheritance framework.

Коли з’явиться concrete SKD task, DCS-specific typed model може обгорнути/reference existing QueryDocument або додати вузький explicit variant. Перш ніж обрати форму, потрібні consumer, text/persisted contracts і preservation fixtures. Не переносити DCS fields до кожного ordinary field наперед.

## What EDT does better

- **Єдиний ordered syntax projection і hierarchical result view.** Operator/NestedTableExpression/DbViewNestedTableFromQuery краще описують shape, ніж scalar schema adapters у нас. Практичний наслідок — A2.
- **Окремий positional/nested UNION mapping.** FieldsMapping моделює alignment і child columns; scalar `deriveUnionColumns` не покриває UX-C9.
- **Вирази й references структуровані.** AbstractExpression nodes і CommonExpression DbView references дають базу для semantic traversal/refactoring. У нас raw slots обмежують certainty; це tradeoff, не автоматична помилка.
- **Type facts, expected types та validation — окремі API.** Checker/CheckResult/derived typecomputer дають точнішу service boundary, ніж display string одиночного поля.
- **Compound query ownership явніше.** Select-query має результат і compound sections, operator — branch-specific data. У нас conventions вимагають accessors і регресійних tests.
- **DCS reuse звичайної мови й RU/EN services явні.** Підтверджують downstream extension і окремий script variant, не повний Core rewrite.

Це переваги **структури досліджених API**. Їх runtime accuracy/performance/preservation superiority не виміряні.

## What Query Console does better

Для нашого use case є такі доказані властивості. Відсутність аналогічної гарантії в EDT Javadocs — UNKNOWN, а не доказ того, що EDT її не має.

| Властивість | Наш concrete evidence | Реальна межа |
|---|---|---|
| Raw preservation для unsupported edits | QueryModel raw slots + lexical-failure tests + draft refusal | Не universal lossless CST; C17 comment-loss slots лишаються |
| Canonical/fixed-point contract | ADR0004; corpusRegression перевіряє input→recorded output; sdblParser.fixtures перевіряє repeat round-trip; oracleGolden | V1 provenance; C6 має дві відомі text fixed-point exceptions у JOIN layout із Boolean truth-table checks; не equivalence усіх inputs |
| Explicit unknown handling | tryTokenize/fieldPathResolver/type compatibility/recovery completeness | Unknown не гарантує semantic validity; Apply має окремі guards |
| Advisory recovery окремо від destructive path | SemanticSnapshot і recovery/source-map gates | Відновлена модель не відправляється автоматично до strict Apply |
| Shared reversible UI boundary | Classic/Canvas common reducer/session/generation/Apply; sourceQueryDraft commit/cancel | Full complex UNION editing ще preserve-only |
| Browser-neutral lightweight core | ADR0001: без VS Code/DOM/fs у core; Node metadata importer окремо | Без benchmark не стверджувати швидше/дешевше за EDT |
| Recorded live 1C evidence | Curated oracle + documented RP probes + exact regression contracts | У цьому аудиті live experiments не повторювалися; EDT не platform oracle |
| Source-map integrity | Optional write-only input map, half-open offsets, zero-impact corpus tests | Output ranges і complete raw-expression scopes відсутні; EDT теж має location services |

Головна цінність — **явний preservation/validation contract під text editor**, який не слід замінювати AST purity. Водночас V3, V1/V2, C17, U1/U2/U3 — справжні обмеження, а не виправдання називати current implementation повністю reversible для будь-якого SDBL.

## ADOPT / ADAPT / DEFER / REJECT

| Рішення | Концепція | Причина / concrete owner |
|---|---|---|
| ADOPT | Syntax projection ≠ derived output schema | Operator/DbView pattern; `orderedSelectElements` + temp/nested adapters мають shared facts |
| ADOPT | Explicit unknown/completeness і type ≠ validation | CheckResult; fieldPathResolver уже має правильні fail-open distinctions |
| ADOPT | One lifetime authority для created temp tables | Temp services position-aware; core tempTableSemantics готовий starting point |
| ADAPT | Rich projection representation | Derived view над current arrays, не persisted big-bang rewrite |
| ADAPT | Positional/nested UNION mapping | Reuse SelectElement; bounded actions і provenance; UX-C9 окремо |
| ADAPT | Semantic expression facts | Tokens + resolver + attested rules; raw expression залишається source |
| ADAPT | Wizard session facade | Shared existing hooks/reducer/services; не EMF Observable clone |
| ADAPT | Source tree/compound ownership | Derived views/accessors за потребою; current flat JOIN/carrier conventions лишаються |
| ADAPT | Rarus graph projection | Disposable display graph над original model; жодного lossy preprocessing до Apply |
| DEFER | Повна expression AST hierarchy | Немає current requirement, що виправдовує grammar/output migration cost |
| DEFER | General type checking, function signatures, NULL/CASE/UNION algebra | Потрібні concrete UI consumer і platform-attested rules |
| DEFER | Full DCS schema/settings/UI | Ordinary query facts мають стабілізуватися; окрема product scope |
| DEFER | Stable IDs / persistent scope graph / generic source mapper | UX-C10 і відсутність consumer; ephemeral snapshots уже versioned |
| DEFER | Повна English output/model migration | C2 окрема evidence-driven задача, не side effect A1 |
| REJECT | EDT/EMF/Xtext/ANTLR dependency або parser rewrite | Не потрібні для identified gaps; порушують neutral lightweight boundary |
| REJECT | AST-only serialization з видаленням raw/provenance | Ризик user-content loss і canonical regression |
| REJECT | Hidden validation mutation | Builder correction behavior не підходить read-only diagnostics contract |
| REJECT | EDT formatter як новий golden truth | EDT API не дорівнює 1C Platform canonical behavior |
| REJECT | Rarus fallback normalization для редагування | Літерали/comments/subquery structure змінюються задля graph rendering |
| REJECT | Новий DCS extension bag зараз | Немає current consumer, duplicative abstraction |

## Recommended Query Core v1 architecture

**Зробили б інакше з першого дня:** ordered projection read API й schema/lifetime owner були б єдиними для temp/nested/UNION; expression type facts від початку були б відділені від raw text і validation; lexical helpers від початку споживали б shared tokens. Ці зміни ще варто зробити incremental. Багата Java hierarchy сама по собі не є migration target.

```text
                     Existing text / QueryModel contracts
                                   │
                         sdblLexer: lexical facts
                          ┌────────┴─────────┐
                          │                  │
             existing parser/generator   token fact consumers (A1)
             compatibility passes             │
                          │                  │
                  Batch / QueryDocument / QueryModel
                          │
            ┌─────────────┼─────────────────┐
            │             │                 │
     ordered projection  scope + metadata  raw expressions
       facts (A2)         resolver          │
            │             └──────────┬──────┘
     producer schema          expression facts (A3)
     + temp lifecycle                │
            └─────────────┬──────────┘
                  derived consumers
           temp/nested/UNION UI + completion/type display
                          │
             shared Classic/Canvas session + Apply
                          │
          canonical generated text → strict gates → text bridge

Semantic snapshots/recovery: versioned advisory path;
future DCS: downstream explicit consumer, коли з’явиться задача.
```

Сервісні межі повинні бути дрібними:

- `QueryModel` — editable + provenance + raw preservation; не контейнер всіх caches/diagnostics/types.
- Projection view — pure derived current elements у порядку; producer schema adapter враховує completeness/shape та evidence-backed naming policy.
- Temp lifecycle — один created-table owner із sequential parser adapter і UI/validator views; undefined-temp compatibility inference окремо.
- Semantic type facts — honest unknown/known; imported metadata й parser markers не змішуються.
- Snapshot — text version/hash/model/maps разом; жодних stale sidecar facts після edits.
- Validator — controlled issues без прихованого destructive editing. Current canonical passes захищаються своїми tests.
- Serializer/generator — existing SDBL contract; EDT/Rarus — reference, platform probes — behavior evidence.

Не потрібні новий AST runtime, generic plugin framework, universal graph model або metadata import redesign.

## Migration plan

План **не виконаний**. Кожен крок — окрема reviewable задача; STOP при unexplained output change. C17 preservation work і current roadmap priorities не скасовуються цим аудитом. Перші безпечні кроки A1/A2 можна вести незалежно, але consumer switch/type inference залежать від відповідних facts.

### 0. Evidence і acceptance matrix

- **Проблема:** A2 divergence доведено, правильний platform schema policy для complex projections невідомий; A3 concrete rules також не attested.
- **Evidence:** reproduction вище, ledger A2/A3/V1/V3; API показує shape, не canonical algorithm.
- **Мінімальна зміна:** зафіксувати cases scalar→tabular→trailing, nested source, unequal/nested UNION, unresolved star, temp create/append/drop/recreate, duplicate aliases; окремі input/output/acceptance observations від live 1C. Для A3 — literal/field/composite/NULL/parameter і невідомі functions.
- **Affected:** tests/fixtures, існуючий oracle tooling і documented evidence; production switch відсутній.
- **Ризик:** не приймати designer echo за execution/type attestation; не називати transformed Rarus input original acceptance.
- **Gates:** relevant tests до змін; reviewed oracle provenance; жодного blind golden update.
- **QueryModel:** ні. **Generated SDBL:** ні; нові expectations лише як нові явно attested fixtures.

### 1. Продовжити A1 по одному consumer

- **Проблема:** незалежний lexical re-scan у generator/formatter/undefined-temp helpers.
- **Evidence:** lexer contract, existing migrated helpers, expressionLexicalFailure tests; EDT resource/formatter separation.
- **Мінімальна зміна:** один identified raw scanner → current token helper; shared context utilities тільки при actual repeated use. Unknown behavior зберегти.
- **Affected:** `sdblGenerator.ts`, `exprFormatter.ts`, relevant parser helper; `sdblLexer.ts` лише за потребою lexical primitive.
- **Ризик:** strings/comments, keyword vs identifier, negation/tuple/Boolean precedence, nested braces, lexical-failure raw preservation.
- **Gates:** typecheck; lexer/formatter/lexical-failure/targeted generator tests; corpusRegression, oracleGolden, queryStore.corpusParity, shadow sweep. При user-visible editing change — relevant E2E.
- **QueryModel:** ні. **Generated SDBL:** очікується 0 змін; будь-який diff → окремий evidence review/STOP.

### 2. A2 derived projection facts без switch

- **Проблема:** scalar-only consumers і повна projection не мають спільного read contract.
- **Evidence:** `orderedSelectElements`, `SelectElement`, EDT ordered wrappers/nested DbView, локальна проба.
- **Мінімальна зміна:** pure facts над existing ordered elements; output name/shape/completeness; parallel **test-only** comparison старих adapters. Не permanent dual production path.
- **Affected:** `unionModel.ts` або вузький query helper, `tempTableSemantics.ts` tests, current scalar/nested consumers у tests.
- **Ризик:** legacy selectOrder fallback, aliases, duplicate suffixes, unresolved stars; top-level tabular width не flatten.
- **Gates:** projection order/name/completeness tests + no mutation; unionModel/tempTableSemantics/source-map zero-impact/corpus gates.
- **QueryModel:** persisted shape не змінюється. **Generated SDBL:** ні.

### 3. A2 schema consumers і lifecycle ownership

- **Проблема:** parser registry, semantic lifetimes і store synthetic sources розходяться.
- **Evidence:** scalar registry/store проти full semantic schema; nested synth використовує deriveUnionColumns.
- **Мінімальна зміна:** reuse core lifecycle з sequential adapter; один schema producer policy; мігрувати store/nested adapter, потім parser consumer окремими patches. Fake scalar marker залишається legacy adapter, доки behavior не attested. Undefined-temp inference залишається незалежним fallback.
- **Affected:** `tempTableSemantics.ts`, `sdblParser.ts` register/augment flow, `queryStore/snapshots.ts` lifecycle і `queryStore.ts` nested synthetic functions, `buildModelResolver` consumers.
- **Ризик:** scope by statement, own-create visibility, append retention, drop/recreate name, case folding, nested temp shadowing, synthetic kind/type, star expansion. Metadata-free fail-open не можна замінити strict empty schema.
- **Gates:** step-0 live evidence перед зміненими results; temp lifecycle/parser/semanticValidator/store tests; corpus + oracle + sourceMap + snapshot/recovery zero-impact; Classic/Canvas temp/nested E2E.
- **QueryModel:** ні. **Generated SDBL:** можлива зміна parser star/canonical результату; дозволена тільки конкретна platform-backed reviewed зміна зі списком cases/categories і before/after. Не «тести оновлено, бо нова архітектура».

### 4. Повний positional mapping — окремий UX-C9

- **Проблема:** complex UNION preserve-only; result facts самі не дають safe editing.
- **Evidence:** EDT FieldsMapping nested alignment; current UnionMappingPopover guard.
- **Мінімальна зміна:** derived positional mapping для all outer elements + потрібні nested child views і bounded edit actions. Зберегти guard до повного coverage; не автоматично padding/rewriting за alias.
- **Affected:** `unionModel.ts`, reducer UNION actions, Classic/Canvas union UI, draft handling.
- **Ризик:** positional width/alias ownership, nested structure, comment/provenance retention, cancel behavior.
- **Gates:** unequal widths/nested/trailing/mixed fields actions tests; Apply/draft/corpus gates; обидва UI E2E, platform evidence для нових canonical transformations.
- **QueryModel:** спочатку ні; будь-яке потрібне нове persisted поле обґрунтувати concrete action. **Generated SDBL:** intentional edits змінюють текст; no-edit round-trip лишається незмінним.

### 5. A3 display-only semantic facts

- **Проблема:** тип лише lone field; synthetic parser marker може дати хибний literal type.
- **Evidence:** expressionContext, isScalarLiteralExpr/registerTempTables, checker/result/derived-type separation.
- **Мінімальна зміна:** pure known/unknown fact API; existing field resolver і tokens; спочатку lone field/literals, потім лише consumer-needed attested rules. UI formatting типу поза semantic fact.
- **Affected:** вузький core query/semantic helper, expressionContext, metadata type presentation; scope integration через existing services.
- **Ризик:** NULL/Undefined, composite refs, parameters, functions, CASE/UNION merge, stale snapshots. Не оголошувати unsupported як invalid і не використовувати compatibility marker як TypeDescription.
- **Gates:** known/unknown and unavailable metadata cases, number/Boolean marker regression, lexical-failure/unsupported/recovered cases, expressionContext/fieldPathResolver/snapshot tests, no-output/no-Apply-behavior change + корпус. UI display/completion E2E при інтеграції.
- **QueryModel:** ні; metadata persisted contract не змінюється. **Generated SDBL:** ні. Type-based Apply blocking — інша майбутня задача.

### 6. Future DCS task, коли scope визначено

- **Проблема:** ordinary query syntax ≠ full СКД schema/settings.
- **Evidence:** DCS subclass reuse і ordinary expression/table/nested references.
- **Мінімальна зміна:** explicit downstream DCS model для реального consumer, reuse core facts; import/export/preservation contract перед UI.
- **Affected:** новий scoped DCS layer/UI/fixtures; current core лише через concrete missing capability.
- **Ризик:** змішування dynamic query parts із datasets/settings; unknown raw characteristic loss.
- **Gates:** existing ordinary corpus untouched, DCS-specific oracle/provenance, import/edit/export/cancel/E2E fixtures.
- **QueryModel:** зараз ні; майбутній minimal extension лише після task/evidence. **Generated SDBL:** ordinary output ні; DCS output окремий explicit contract.

### Перевірка, виконана в цьому аудиті

| Точна команда | Результат |
|---|---|
| `npm run typecheck` | PASS: extension, webview, canvas |
| `npm run test:unit > /tmp/query-edt-audit-unit.log 2>&1` | PASS: 166 files, 4123 tests; 53.01 s |
| `./node_modules/.bin/esbuild /tmp/query-edt-audit-probe.ts --bundle --platform=node --format=cjs --outfile=/tmp/query-edt-audit-probe.cjs` | PASS: audit-only reproduction bundle |
| `node /tmp/query-edt-audit-probe.cjs` | PASS: schema divergence output описаний вище |
| `npm run docs:check` | PASS: links/anchors/case/reachability та documentation consistency |
| `git diff --check` | PASS: whitespace/conflict-marker diff check |

Unit run включав corpusRegression, oracleGolden (181 tests), queryStore.corpusParity, source-map, snapshots, shadow sweep та packaging checks. CorpusRegression має 1976 recorded valid canonical cases з exact generation comparison; це не 1976 нових live experiments. Дві optional WASM warnings означають skipped checks через відсутній `tree-sitter-sdbl.wasm`, не перевірку незалежною grammar. Full build, browser E2E, VS Code integration та live 1C/EDT runtime не запускалися. Baseline/snapshot/golden/classification changes: **0**. Нових/оновлених production tests у audit-only task: **0**.

## Things NOT to change

1. Не переписувати parser, generator або persisted QueryModel; не додавати EDT/EMF/Xtext/external parser production dependency.
2. Не видаляти raw expression/characteristics slots, alias/qualification/grouping/comment provenance flags як «noise».
3. Не підміняти golden/corpus contracts EDT output; не змінювати canonical SDBL без конкретної platform evidence і reviewed case summary.
4. Не переносити lexer grammar/scope/type responsibilities у token classifier. Unknown lexical failure не має fallback guessed rewrite.
5. Не вилучати metadata-free, undefined-temp, virtual-param/raw і legacy fallback behavior; fake marker migration окремо gated.
6. Не переписувати flat JOIN/tree representation, UNION/batch/carrier storage conventions або reducer snapshots без current consumer requirement.
7. Не прибирати preserve-only complex UNION/unsafe arity/template/sequence blockers заради багатших views.
8. Не використовувати recovery parse, partial semantic facts або Rarus transformed text для automatic Apply.
9. Не вводити приховану mutation в validation і не стверджувати semantic equivalence лише з reparse output.
10. Не замінювати shared Classic/Canvas session/Apply/text bridge або browser-neutral core на EDT-style application facade.
11. Не робити metadata loader redesign: direct XML/JSON → YAML → last-known-good, staging/ownership safety й existing resolver contracts лишаються.
12. Не розривати accepted parser hooks/module cycles і synchronous resolver stack у межах цього аудиту; async/parallel parsing потребує окремої задачі.
13. Не додавати stable IDs, persisted semantic graph, generic plugin framework, new full function-signature catalog або DCS extension bag без consumer.
14. Не змішувати cleanup/EN rollout/C17 fix/optimization із implementation A1/A2/A3. Current roadmap та ledger залишаються authority.

Підсумкове рішення для затвердження: **прийняти A1 lexical-facts boundary, A2 derived projection/schema/lifecycle consolidation та A3 bounded display type facts; реалізацію вести окремими incremental tasks. Full AST, persisted model rewrite і full СКД — DEFER/REJECT у поточному scope.**

### References

Code/doc links прив’язані до layout перевіреного baseline. EDT URLs нижче — direct supporting primary API pages; методи згадуються за фактично прочитаним public contract.

[architecture]: ../architecture.md
[model-doc]: ../query-model.md
[lexical-doc]: ../expression-lexical-contract.md
[roadmap]: ../roadmap.md
[ledger]: ../technical-debt.md
[adrs]: ../decisions/README.md
[qmodel]: ../../../src/core/query/queryModel.ts
[batch]: ../../../src/core/query/batchModel.ts
[union]: ../../../src/core/query/unionModel.ts
[parser]: ../../../src/core/query/sdblParser.ts
[generator]: ../../../src/core/query/sdblGenerator.ts
[lexer]: ../../../src/core/query/sdblLexer.ts
[formatter]: ../../../src/core/query/exprFormatter.ts
[syntax-check]: ../../../src/core/query/expressionSyntaxCheck.ts
[function-catalog]: ../../../src/core/query/functionCatalog.ts
[temp-semantics]: ../../../src/core/query/tempTableSemantics.ts
[metadata-types]: ../../../src/core/metadata/types.ts
[field-resolver]: ../../../src/core/query/fieldPathResolver.ts
[type-compat]: ../../../src/core/query/fieldTypeCompat.ts
[validator]: ../../../src/core/query/semanticValidator.ts
[source-map]: ../../../src/core/query/sourceMap.ts
[snapshot]: ../../../src/core/semantic/semanticSnapshot.ts
[snapshot-builder]: ../../../src/core/semantic/buildSemanticSnapshot.ts
[resolve-alias]: ../../../src/core/semantic/resolveAliasAt.ts
[expression-context]: ../../../src/webview/expressionEditor/expressionContext.ts
[store]: ../../../src/webview/state/queryStore.ts
[store-snapshots]: ../../../src/webview/state/queryStore/snapshots.ts
[source-draft]: ../../../src/webview/sourceQueryDraft.ts
[compute-text]: ../../../src/webview/computeBatchText.ts
[apply-gate]: ../../../src/webview/applyGate.ts
[validate-batch]: ../../../src/core/query/validateBatch.ts
[open-designer]: ../../../src/webview/openDesignerBatch.ts
[designer-session]: ../../../src/webview/hooks/useDesignerSession.ts
[messages]: ../../../src/shared/messages.ts
[canvas-app]: ../../../src/webview-canvas/App.tsx
[edt-model]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/package-summary.html
[schema]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchema.html
[abstract-query]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/AbstractQuerySchemaQuery.html
[select-query]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaSelectQuery.html
[operator]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaOperator.html
[expression]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaExpression.html
[abstract-expression]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/AbstractExpression.html
[nested-table]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/NestedTableExpression.html
[star]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/StarExpression.html
[nested-all]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/NestedTableAllFieldsExpression.html
[source]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaSource.html
[abstract-source]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/AbstractQuerySchemaSource.html
[table]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/AbstractQuerySchemaTable.html
[query-table]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaTable.html
[grouping-sets]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaGroupingSets.html
[join]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaQuerySourceJoin.html
[nested-query]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaNestedQuery.html
[order]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaOrderExpression.html
[totals]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaTotalControlPoint.html
[temp-description]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaTempTableDescription.html
[indexes]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/QuerySchemaIndexSets.html
[single-part]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/SinglePartCommonExpression.html
[multi-part]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/MultiPartCommonExpression.html
[function-invocation]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/FunctionInvocationExpression.html
[case-expression]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/CaseOperationExpression.html
[in-expression]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/InExpression.html
[empty-expression]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/EmptyExpression.html
[dbview]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/DbViewFromQuery.html
[nested-dbview]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/model/DbViewNestedTableFromQuery.html
[dbview-field]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/metadata/dbview/DbViewFieldDef.html
[type-checker]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/typesystem/IExpressionTypeChecker.html
[check-result]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/typesystem/IExpressionTypeChecker.CheckResult.html
[checker]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/QlCheckerExpression.html
[type-system]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/QlTypeSystem.html
[derived-types]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/DerivedTypeComputerForDbViewQuery.html
[mapper]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/resource/QlMapper.html
[derived-state]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/resource/QlDerivedStateComputer.html
[resource-package]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/resource/package-summary.html
[edt-formatter]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/formatting/QlFormatter.html
[builder]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/qw/ui/utils/QuerySchemaBuilder.html
[wizard-source]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/qw/ui/utils/QueryWizardSource.html
[wizard-utils]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/qw/ui/utils/QueryWizardServiceUtils.html
[fields-mapping]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/qw/ui/utils/FieldsMapping.html
[available-table]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/qw/ui/utils/AvailableTable.html
[dcs-operator]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/DcsQuerySchemaOperator.html
[dcs-select]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/DcsQuerySchemaSelectQuery.html
[dcs-fields]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/SelectFieldsCompositionDataQuerySchema.html
[dcs-filters]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/FilterCompositionDataQuerySchema.html
[dcs-characteristics]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/CharacteristicCompositionDataQuerySchema.html
[dcs-values]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/CharacteristicTypesAndValues.html
[dcs-parameter]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/DcsParameterExpression.html
[dcs-join]: https://edt.1c.ru/dev/edt/2024.2/apidocs/com/_1c/g5/v8/dt/ql/dcs/model/QuerySchemaQueryGroupSourceJoin.html
[rarus-readme]: https://github.com/rarus/query-schema-1C/blob/8f9d466a2324c8641ea44d6c37f65c3b652761ad/README.md
[rarus-code]: https://github.com/rarus/query-schema-1C/blob/8f9d466a2324c8641ea44d6c37f65c3b652761ad/query-schema-1%D0%A1/src/ExternalDataProcessors/%D0%A1%D1%85%D0%B5%D0%BC%D0%B0%D0%97%D0%B0%D0%BF%D1%80%D0%BE%D1%81%D0%B01%D0%A1/ObjectModule.bsl
