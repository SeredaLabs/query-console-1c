# New Builder --- Target UX Roadmap

## Architecture Contract

-   Classic Builder (`src/webview/`) зберегти.
-   New Builder (`src/webview-canvas/`) розвивати окремо.
-   Shared core/domain/reducer/parser/generator --- спільний контракт.
-   New UI не зобов'язаний візуально чи структурно копіювати Classic.
-   Не вигадувати domain capabilities.
-   Якщо target UX потребує зміни core semantics/reducer
    semantics/protocol --- зупинитися і запросити окреме погодження.

## Target information architecture

``` text
Document Bar
│
├── Sidebar
│   ├── Metadata
│   └── Package
│
├── Workspace
│   ├── Structure
│   ├── Fields
│   ├── Conditions
│   ├── Grouping
│   ├── Sorting
│   └── Additional
│
├── Inspector
│
└── SDBL Preview
```

## Phase 0 --- Domain Capability Map

До коду: - дослідити QueryState; - reducer actions; - parser; -
generator; - Classic; - Canvas; - заповнити
`.claude/new_builder_capability_map.md`.

Ніяких припущень замість факту.

## Phase 1 --- New Builder Shell

Побудувати остаточну геометрію: - Document Bar; - Sidebar container; -
Workspace + navigation; - Inspector shell; - SDBL dock; - resize/scroll
boundaries.

Не переписувати domain panels.

## Phase 2 --- Sidebar 2.0

Два режими: - Метадані; - Пакет.

Metadata = source browser/search. Прибрати постійне дублювання
`Обрані джерела`, якщо audit підтвердив відсутність потрібної
залежності.

Package = ordered sequence, не graph.

## Phase 3 --- Structure Workspace

`Sources` + `Joins` стають одним primary workspace: `Structure`.

Використати існуючі: - TableCard; - drag; - zoom; - layered/BFS
auto-layout; - JOIN rendering; - minimap.

Не вводити force-directed layout.

## Phase 4 --- Unified Inspector

Одна користувацька концепція `Inspector`.

Selection може бути local UI state: - table; - join; - virtual table
params; - null.

Можна reuse існуючі panels internally. QueryState не змінювати заради
selection UX.

## Phase 5 --- Focus / Graph Readability

Table selected: - selected table + incident joins + neighbors ---
emphasis; - unrelated graph --- dimmed.

Join selected: - connection + endpoints --- emphasis; - unrelated ---
dimmed.

Не переписувати layout engine.

## Phase 6 --- Joins Overview

Зберегти textual overview для складних graphs.

Двостороння синхронізація: `list ↔ canvas ↔ inspector`.

Joins Overview не є primary workspace tab.

## STOP 1 --- Structure Validation

Перевірити реальний складний graph: - 8--12 sources; - 10--15 joins; -
branching; - virtual table; - за можливості disconnected fragment.

Оцінити topology readability, focus, inspector, joins overview, minimap,
layout stability.

## Phase 7 --- Fields Workspace

Canvas checkbox відповідає "включене поле чи ні". Fields workspace
відповідає "що повертає SELECT і в якому порядку".

Target: - ordered result fields; - alias; - expression; - aggregate
indication.

Реалізувати лише capabilities, підтверджені
model/reducer/parser/generator.

## Phase 8 --- Conditions Workspace

Target --- visual boolean structure, не копія старої таблиці.

Перед кодом окремо описати реальну condition model: - AND/OR; -
nesting; - operators; - params; - expressions.

Не симулювати довільну вкладеність, якщо model її не підтримує.

## Phase 9 --- Grouping + Totals

Одна conceptual area: - grouping fields; - aggregates; - totals; -
hierarchical totals тільки якщо domain підтримує.

## Phase 10 --- Sorting

Compact ordered list: - field/expression; - direction; - reorder тільки
якщо model дозволяє.

## Phase 11 --- Additional

Тільки query-level rare settings, які реально підтримуються: -
DISTINCT; - TOP/FIRST; - ALLOWED; - FOR UPDATE/locking; - temp output; -
indexes.

Не перетворювати на dumping ground.

## STOP 2 --- Full SELECT Validation

Порівняти New і Classic на однаковій domain model: - sources; - joins; -
fields; - conditions; - grouping; - totals; - sorting; - additional.

Generated SDBL має бути семантично еквівалентним.

## Phase 12 --- Package 2.0

Package = ordered flow/sequence.

Візуально підкреслити temp-table continuity, але не створювати новий
dependency graph у domain.

## Phase 13 --- Temp Table / Subquery Parity

Якщо Classic/shared domain уже підтримують manual temp table і
subquery-as-source --- додати Canvas/New UI поверх існуючих semantics.

До цього New Builder не вважати functionally complete.

### Рішення за QUERY SCOPE / SUBQUERY CAPABILITY AUDIT (зафіксовано, до Phase 4)

Аудит (`.claude/new_builder_phase3_design.md`-суміжний, subquery capability
audit) підтвердив: source-subquery capability (`SelectedTable.subquery`,
`QueryDocument`, parser, generator, `ADD_SUBQUERY_TABLE`/
`UPDATE_SUBQUERY_TABLE`, derived output columns) вже достатньо зріла;
condition-subquery має окремі, ширші gaps (див. Technical Debt нижче) --- тому
це **два окремі implementation scopes**, не одна фаза.

Query Scope architecture (target concept, підтверджено, поки НЕ
реалізовано):

-   `package query` / `source subquery` / `condition subquery` --- три
    концептуальні "scopes", кожен відкривається тим самим New Builder UI
    (`Структура/Поля/Умови/Групування/Сортування/Додатково`);
-   subquery **не** є package member і не отримує номер у `Пакет: 1 2 3 4`;
-   nested query відкривається **окремим drill-down editor context**, за
    аналогією з Classic `NestedConstructorModal` --- parent відкриває child
    `QueryDocument`, child має власний reducer/editor state, після Save
    результат commit-иться назад у parent через **вже існуючі**
    `ADD_SUBQUERY_TABLE`/`UPDATE_SUBQUERY_TABLE`;
-   для source-subquery parent вже має `SelectedTable.id` --- цього
    достатньо для local nested context;
-   **не** робимо nested canvas усередині `TableCard`;
-   **не** додаємо зараз глобальний persistent stable query/scope id по
    всьому query tree --- local nested-editor-context підхід (як у Classic)
    цього не потребує; global id --- backlog item (нижче), не prerequisite
    ні для Phase 4, ні для першої реалізації source-subquery UI.

Порядок: після Phase 3E.1 --- Phase 4 (Inspector). Query Scope
implementation зараз **не починати**. Перед стартом (орієнтовно Phase 13)
--- окремий Implementation Gate на основі цього аудиту.

## Phase 14 --- UNION UX

Спочатку audit representation.

Якщо correspondence positional --- лише візуалізувати positional
alignment. Не створювати explicit mapping object без domain support.

## Phase 15 --- SDBL Developer Experience

SDBL --- постійний proof of generated result: - read-only; -
highlighted; - copy; - expand/collapse.

Дослідити cross-highlight: - field → SELECT fragment; - join → JOIN
fragment; - condition → WHERE fragment.

Тільки без зміни core semantics.

## Phase 16 --- Expression Builder

Окрема reusable фаза після стабілізації CRUD.

Перевірити Classic implementation, CodeMirror dependencies і bundle
impact. Не інтегрувати CodeMirror раніше.

## Phase 17 --- Advanced Interactions

Після стабільного CRUD: - drag field-to-field JOIN; - keyboard
shortcuts; - find/focus helpers.

## Phase 18 --- Final Polish

-   consistent SVG icons;
-   typography;
-   spacing;
-   hover/selected/focus;
-   transitions;
-   dark/light theme;
-   accessibility;
-   minimap tuning.

## Technical Debt / Backlog (зафіксовано, код не змінювати без окремого рішення)

З QUERY SCOPE / SUBQUERY CAPABILITY AUDIT --- не робити зараз, лише
тримати в архітектурній пам'яті:

-   **Stable Query/Scope ID** --- future hardening. `QueryDocument`/
    `UnionMember`/`BatchSnapshot`/`QueryModel` --- без змін зараз; глобальний
    id не потрібен, поки Query Scope реалізується як local nested-editor
    context (див. Phase 13).
-   **`deriveUnionColumns`** не покриває всі projection cases (напр.
    tabular-section projection всередині union-member) --- відомий gap,
    окрема майбутня робота.
-   **Condition-subquery parser/UI asymmetry** --- тільки оператор `В`
    структурний; `НЕ В` (інфіксна форма) і non-field LHS --- інші code paths;
    builder UI для condition-subquery не існує; edit виразу може втратити
    structural `subquery`.
-   **`EXISTS`/`NOT EXISTS`** --- unsupported у grammar/model/generator.
-   **Scalar SELECT subquery** (у полі SELECT-списку) --- unsupported.
-   **JOIN ON subquery** --- structured model unsupported (тільки raw
    expression).

## Implementation Gate

Перед КОЖНОЮ фазою агент друкує:

``` text
IMPLEMENTATION GATE — PHASE N

Goal:
Existing components:
Domain representation:
Reducer actions:
Classic reference:
Current Canvas implementation:
Files expected to change:
Core changes required: YES/NO
Reducer semantic changes required: YES/NO
Host protocol changes required: YES/NO
Unsupported assumptions:
Implementation decision:
```

Якщо Core/Reducer semantics/Protocol = YES --- не продовжувати без
explicit approval.

## Validation

Після кожної implementation phase: - typecheck; - build; - unit tests; -
integration tests, якщо наявні; - список змінених файлів; - visual check
проти approved screenshot/spec.

Одна велика фаза = окремий прохід. Не робити big-bang rewrite.
