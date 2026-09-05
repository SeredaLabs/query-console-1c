# Технічне завдання v2.1
## 1C: Query Constructor for VS Code

**Project:** `SeredaLabs/query-console-1c`
**Status:** Final / Architecture Frozen
**Version:** 2.1
**Date:** 2026-09-03

---

# 1. Мета

Еволюційно розвинути існуюче VS Code extension для роботи з 1C/SDBL Query Language у стабільний, безпечний та розширюваний візуальний конструктор запитів.

Ключові можливості:

- відкриття та розбір існуючих SDBL-запитів;
- візуальне редагування;
- підтримка batch/UNION/temp tables/virtual tables/subqueries;
- безпечна генерація SDBL;
- робота з metadata 1C;
- семантичний аналіз;
- strict syntax validation;
- подальше розширення до IDE-подібного досвіду.

Головний пріоритет:

> Конструктор не повинен мовчки втрачати дані запиту або пошкоджувати metadata/cache під час міграції.

---

# 2. Основний принцип прийняття рішень

Для архітектурних рішень використовується:

```text
Requirement
    ↓
Evidence / Measurement
    ↓
Decision Gate
    ↓
Simplest Passing Solution
```

Статуси:

- **LOCKED** — рішення зафіксоване;
- **MEASURE** — спочатку вимірюємо;
- **SPIKE** — коротке дослідження перед вибором реалізації;
- **CONDITIONAL** — реалізація лише при підтвердженій потребі;
- **NOT PLANNED** — не входить у поточний roadmap.

---

# 3. Базові архітектурні принципи

**LOCKED**

1. Проєкт еволюціонує, а не переписується з нуля.
2. Існуючі XML handlers metadata повторно використовуються.
3. Metadata consumers не повинні залежати від конкретного storage format.
4. Query generator не залежить від metadata, VS Code API або filesystem.
5. QueryDocument не містить UI-state або metadata catalog.
6. Strict syntax validation і semantic validation є окремими шарами.
7. Парсинг має залишатися tolerant для editor workflow.
8. Known-lossy або unknown-preservation запит не може бути застосований через Apply.
9. Failed metadata build не може знищити last-known-good generation.
10. Міграція виконується малими rollback-safe PR.
11. Тести, необхідні для доведення correctness, додаються в тому самому PR.
12. Будь-яка оптимізація runtime/storage/isolation повинна бути measurement-driven.

---

# 4. Поточна metadata architecture

У поточному runtime співіснують два metadata paths.

## 4.1 Новіший path

```text
1C XML
  ↓
parseConfiguration()
  ↓
YAML
  ↓
loadMetadataCached()
  ↓
MetadataModel
```

## 4.2 Legacy fallback

```text
1C XML
  ↓
parseCf()
  ↓
legacy JSON cache
  ↓
MetadataModel
```

Обидва runtime paths вважаються реальними до завершення migration.

---

# 5. Цільова metadata architecture

**LOCKED**

```text
MetadataSource
    ↓
MetadataBuilder
    ↓
SnapshotWriter
    ↓
Committed Metadata Generation
    ↓
MetadataRepository
    ↓
Consumers
```

`MetadataRepository` є read-only consumer boundary.

Repository не відповідає за:

- build lifecycle;
- commit;
- cleanup;
- source scanning;
- snapshot write.

---

# 6. Metadata build safety

**LOCKED**

Основний invariant:

```text
Generation N remains available
        ↓
Build N+1
        ↓
Validate N+1
        ↓
Single logical visibility switch N → N+1
        ↓
N may be cleaned only after successful switch
```

У будь-який момент **до успішного logical commit** generation N повинна залишатися recoverable/serviceable.

Заборонено вважати наступний pattern атомарним:

```text
rm old
→
rename new
```

ТЗ фіксує **behavioral atomicity**, а не конкретний filesystem implementation.

---

# 7. Metadata ownership safety

**LOCKED**

Recursive destructive cleanup дозволений тільки для storage, ownership якого доведений.

Не є доказом ownership:

```text
directory name "cf"
configuration.yaml
model-cache file
existing YAML
existing JSON cache
```

Ownership marker повинен:

- бути extension-specific;
- мати перевірюваний format/signature;
- не вважатися валідним тільки через наявність файла з потрібною назвою.

Приклад допустимого marker format:

```json
{
  "owner": "SeredaLabs.query-console-1c",
  "formatVersion": 1
}
```

Конкретний формат marker є implementation detail.

Unowned directory:

```text
NEVER recursive-delete automatically
NEVER silently adopt as extension-owned
```

Старий unowned output може залишатися untouched, а managed generation створюється окремо.

---

# 8. Metadata build diagnostics

**LOCKED**

Мінімальна модель:

```ts
interface MetadataBuildIssue {
    file?: string;
    stage: string;
    message: string;
}
```

Build повинен розрізняти:

- recoverable object-level errors;
- generation-integrity failures.

Fatality визначається типом failure, а не кількістю errors.

---

# 9. Last-known-good behavior

**LOCKED**

Якщо build N+1 не завершився успішним commit:

- generation N залишається current;
- incomplete generation не стає visible;
- current snapshot не видаляється;
- user отримує controlled diagnostic;
- rebuild може бути повторений.

Тестуються:

```text
malformed XML
handler failure
mandatory write failure
commit failure
corrupt snapshot
incompatible formatVersion
source unavailable
last-known-good exists
no valid snapshot exists
unowned destination exists
```

---

# 10. Persisted snapshot

**MEASURE / CONDITIONAL**

Storage format не визначається наперед.

Кандидати:

- consolidated JSON;
- chunked JSON;
- MessagePack;
- інший простий snapshot;
- SQLite тільки при підтвердженій потребі.

Не lock-имо:

```text
SQLite
binary format
TypedArray/columnar representation
memory-mapped storage
```

Persisted snapshot повинен мати explicit `formatVersion`.

`formatVersion` змінюється, коли попередній persisted format більше не може гарантувати еквівалентну semantics/compatibility, а не лише при структурній зміні JSON.

---

# 11. MetadataRepository

**LOCKED**

Перший repository повинен бути мінімальним.

```ts
interface MetadataRepository {
    getTables(): readonly MetaTable[];
    findTable(kind: TableKind, name: string): MetaTable | undefined;
}
```

Не додаємо methods "на майбутнє".

Existing `MetadataResolver` повторно використовується там, де його semantic-resolution contract уже підходить.

Не створюємо дублюючу resolver abstraction.

Target relationship:

```text
MetadataRepository
       │
       ├── panel / WebView metadata consumers
       │
       └── build/use existing MetadataResolver
                    ↓
             semantic validation
```

Після migration direct storage access consumers не допускається.

Metadata tree delivery у WebView також має проходити через consumer boundary, навіть якщо repository реалізація просто повертає `readonly MetaTable[]`.

---

# 12. Metadata migration strategy

**LOCKED**

Strangler migration:

```text
Current YAML path ─┐
                   ├→ Repository boundary
Legacy fallback ───┘
                         ↓
                 New snapshot backend
                         ↓
                 Validate replacement
                         ↓
                 Production switch
                         ↓
                 Remove YAML runtime
                         ↓
                 Prove fallback unnecessary
                         ↓
                 Remove legacy runtime
```

Legacy runtime видаляється тільки після того, як replacement доведений tests/fixtures/representative configuration.

YAML runtime removal та legacy fallback removal можуть бути окремими PR.

---

# 13. Query architecture

**LOCKED**

```text
SDBL Source
    ↓
Lexer
    ↓
Shared Token Stream
    ↓
Tolerant Parser
    ↓
QueryDocument
    ↓
Generator
    ↓
Generated SDBL
```

Паралельно:

```text
Original Source / Token Stream
    ↓
Strict Syntax Validation
```

та:

```text
QueryDocument
+
MetadataResolver/Repository
    ↓
Semantic Validation
```

---

# 14. QueryDocument

**LOCKED**

`QueryDocument` — єдине editable structural representation запиту та generator input.

Може містити:

- tables;
- aliases;
- selected fields;
- joins;
- conditions;
- grouping;
- HAVING;
- ORDER;
- TOTALS;
- INDEX BY;
- UNION;
- batches;
- temp tables;
- virtual table arguments;
- subqueries;
- structural hints;
- local node IDs;
- raw/custom payload;
- comments, які реально підтримуються.

Не містить:

- MetaTable catalog;
- resolved MetaField objects;
- metadata generation IDs;
- React state;
- VS Code objects;
- selection/expanded UI state;
- semantic diagnostics.

---

# 15. Query UI state

**LOCKED minimum**

`QueryUIState` містить тільки UI concerns:

- selection;
- expanded nodes;
- active tab/panel;
- temporary visual state.

Перший обов'язковий cleanup:

> `MetaTable[]` виходить із `QueryState`.

Не потрібно переписувати весь reducer або state management framework.

---

# 16. QueryAnalysis

**DEFER**

Окремий `QueryAnalysis` object/interface вводиться тільки коли P2 semantic analysis реально цього потребуватиме.

Не створюється generic diagnostics framework у P1 без реального consumer.

---

# 17. Revision infrastructure

**DEFER**

Не вводимо без реального async stale-result consumer:

```text
documentRevision
metadataRevision
SessionManager
global revision framework
```

Якщо такий consumer з'явиться:

- document revision змінюється на QueryDocument mutation;
- async result публікується тільки якщо identities актуальні.

---

# 18. Lexer requirements

**LOCKED**

Lexer повинен зберігати:

- token ranges;
- source positions;
- unknown/invalid token information;
- інформацію, необхідну tolerant parser та strict validation.

Lexer не повинен знищувати source information, яке може бути потрібне для recovery/preservation.

---

# 19. Tolerant parser

**LOCKED**

Tolerant parser потрібен для editor workflow.

Invalid/partial query може бути parsed/recovered достатньо для UI.

Tolerant parse result **не є доказом strict syntactic validity**.

---

# 20. Strict syntax validation

**SPIKE**

Strict validation працює від:

```text
original source
or
token stream derived from original source
```

а не тільки від recovered QueryDocument.

SPIKE порівнює найпростіші варіанти:

- stricter use of current parser;
- grammar-aware validator;
- external grammar reference.

Не lock-имо:

```text
ANTLR
tree-sitter
Lezer
CST rewrite
```

---

# 21. Semantic validation

**P2**

Semantic analyzer працює поверх QueryDocument + metadata.

Приклади:

- table exists;
- field exists;
- alias resolution;
- dot navigation;
- temp table scopes;
- virtual table params;
- UNION compatibility;
- metadata-aware diagnostics.

Semantic validation не замінює syntax validation.

---

# 22. Nested parsing

**P1 / CONDITIONAL**

Known architectural concern: nested subquery parsing може повторно tokenizувати частини того самого source.

Target:

```text
one tokenization
→ parse nested token ranges
```

Але refactor виконується тільки якщо correctness/profile/resource evidence виправдовує зміну.

---

# 23. Parser resource safety

**P0 VERIFY / CONDITIONAL FIX**

Existing recursion guard зберігається.

P0 повинен перевірити identified potentially-unbounded dimensions adversarial/stress tests.

Допустимий результат P0:

```text
stress tests
→ no additional unsafe dimension found
→ no production code change required
```

Не встановлюємо arbitrary universal thresholds типу:

```text
1 MB
5 seconds
10× corpus maximum
```

без benchmark/product evidence.

Invariant:

> Identified unbounded dimensions must not cause uncontrolled recursion, runaway memory growth, or process termination under the tested workloads.

---

# 24. Generator

**LOCKED**

Generator:

- deterministic для того самого QueryDocument;
- metadata-independent;
- VS Code-independent;
- filesystem-independent;
- не повинен silently omit modeled information.

Controlled generation failure допускається.

Caller повинен перехоплювати unexpected exceptions.

---

# 25. Custom/raw expression preservation

**LOCKED limited guarantee**

Для raw/custom node гарантується тільки те, що реально збережено:

```text
stored raw expression payload
→ emitted byte-identically
```

Parent separators, commas, logical operators, parentheses та інша structural punctuation можуть залишатися generator-owned.

`custom:true` сам по собі не означає:

- unsafe;
- recovered;
- lossless.

Capability визначається реальною preservation guarantee.

---

# 26. Capability model

**LOCKED**

Запит/construct може бути:

```text
EDITABLE
PRESERVED
UNSAFE
```

### EDITABLE

Constructor повністю розуміє і може змінювати construct.

### PRESERVED

Constructor не редагує construct семантично, але гарантує його збереження.

### UNSAFE

Constructor не може гарантувати збереження.

---

# 27. Apply safety invariant

**LOCKED**

> Constructor must never write query if it cannot guarantee preservation of constructs the user did not change.

---

# 28. Apply behavior

```text
fully supported + safe
→ ALLOW

preserved unsupported construct
→ ALLOW

semantic warning
→ WARN + ALLOW

stale metadata but generation remains safe
→ WARN + ALLOW

metadata unavailable but generation remains safe
→ ALLOW

known-lossy construct
→ BLOCK

unknown preservation
→ BLOCK

controlled generation failure
→ BLOCK

unexpected generator exception
→ BLOCK

known invalid generated output
→ BLOCK

parser/resource safety failure
→ BLOCK
```

User confirmation не перетворює known data loss на safe behavior.

---

# 29. Apply pipeline

**LOCKED**

```text
QueryDocument
      ↓
Capability / preservation check
      ↓
Generate
      ↓
Generation success check
      ↓
Strongest currently available syntax/safety validation
      ↓
Write to editor
```

Strict validator не є prerequisite для базового P0 Apply gate.

---

# 30. Apply exception safety

**P0 LOCKED TEST**

Обов'язковий regression test:

```text
generator throws
      ↓
caller catches
      ↓
NO editor modification
      ↓
controlled error shown/logged
      ↓
panel remains usable
```

Tests повинні доводити, що exception не призводить до partial/unsafe Apply.

---

# 31. Virtual table preservation

**P0 VERIFY**

Не припускаємо data loss без evidence.

Обов'язковий test pattern:

```text
parse
→ unrelated visual edit
→ generate
```

Для representative VT forms, включно з accounting virtual tables.

Classification:

```text
LOSSLESS
FORMATTING ONLY
SEMANTIC LOSS
```

Якщо confirmed semantic loss:

```text
P0 fix
+
permanent regression test
+
Apply BLOCK until safe
```

---

# 32. Round-trip correctness

Для supported constructs:

```text
source
→ parse
→ QueryDocument
→ generate
→ parse
→ structurally supported equivalent result
```

Для preserved raw payload:

```text
guaranteed raw portion
→ byte-identical
```

Global whole-query byte identity не є загальною вимогою.

Formatting може normalize.

---

# 33. Corpus classification

**P0 LOCKED**

Перед activation правила:

```text
SUPPORTED must not regress
```

існуючий corpus повинен отримати deterministic baseline classification.

Target classes:

```text
SUPPORTED
RECOVERED
UNSUPPORTED
INVALID
```

Classification не повинна механічно визначатися лише через:

```text
valid=true/false
custom=true/false
```

Процес:

```text
existing corpus
    ↓
define deterministic classification rules
    ↓
automatic classification where reliable
    ↓
inspect ambiguous cases
    ↓
freeze baseline
```

`custom=true` може бути safe PRESERVED і не означає автоматично RECOVERED.

Corpus classification rules документуються.

---

# 34. Corpus as permanent regression asset

**LOCKED**

Real-query corpus є permanent test infrastructure.

Corpus використовується для:

- parser regression;
- generator regression;
- round-trip;
- strict validator evaluation;
- architecture refactors;
- capability expansion.

Corpus не видаляється після migration.

---

# 35. SUPPORTED corpus invariant

**LOCKED**

```text
SUPPORTED source
  ↓
parse
  ↓
generate
  ↓
parse
  ↓
must remain SUPPORTED
```

Generator не повинен падати на QueryDocument, отриманому з `SUPPORTED` query.

---

# 36. Golden fixtures

**LOCKED**

Підтримується representative fixture set для:

```text
SELECT
JOIN
nested queries
UNION
temp tables
virtual tables
accounting virtual tables
GROUP BY
HAVING
TOTALS
ORDER BY
INDEX BY
custom/raw
batch
```

Golden tests не повинні бути надмірно formatting-sensitive.

---

# 37. No silent baseline updates

**LOCKED**

Заборонено просто оновити:

- expected fixtures;
- golden outputs;
- corpus snapshots;
- classification;

щоб tests стали green.

Будь-яка expected behavior change повинна пояснювати:

```text
WHAT changed
WHY it changed
WHY new behavior is correct
WHICH fixtures/classes are affected
```

---

# 38. Corpus/golden diff review

**LOCKED**

Mass update corpus/golden baseline повинен мати machine-readable або generated diff summary.

Summary мінімально показує:

```text
number of changed entries
affected syntax categories
classification transitions
representative before/after examples
```

Regression-like classification changes вимагають explicit explanation у PR.

Не потрібно вручну переглядати тисячі fixtures, якщо зміни можна надійно класифікувати.

---

# 39. Metadata permanent test oracle

**LOCKED**

Під час migration допускається:

```text
old implementation
vs
new implementation
```

Після legacy removal permanent correctness tests повинні використовувати independent fixtures:

```text
XML fixture
    ↓
MetadataBuilder
    ↓
expected MetadataModel / structural result
```

Legacy production code не зберігається тільки як test oracle.

---

# 40. Representative real configuration gate

**LOCKED for production metadata switch**

Перед production switch нового metadata backend потрібна validation на representative real-world configuration достатньої складності.

Перевіряються релевантні:

```text
object counts
object identities
fields
tabular sections
virtual tables
type/reference descriptors
common attributes
consumer compatibility
```

Не встановлюється arbitrary minimum number of configs.

---

# 41. WebView metadata

**MEASURE**

Current full `MetaTable[]` transfer зберігається, поки benchmark не доведе problem.

Measure:

```text
payload size
postMessage cost
WebView initialization time
memory impact
```

Якщо budget порушено:

```text
summaries
+
lazy/batched details
```

стають candidates.

До measurement lazy protocol не є обов'язковим.

---

# 42. retainContextWhenHidden

**NOT PLANNED**

Не змінювати без evidence, що current behavior створює material memory/UX issue.

---

# 43. Extension Host responsiveness

**MEASURE**

Синхронна metadata робота в Extension Host є architecture concern.

Але technology choice не робиться наперед.

Measure:

- cold metadata build;
- warm metadata load;
- event-loop/user-visible stall;
- heap;
- filesystem cost.

Якщо budget violated, порівняти:

```text
async host work
Worker Thread
Child Process
```

`setTimeout()` не вважається offloading.

---

# 44. Performance methodology

**LOCKED**

Кожний performance decision має:

```text
metric
baseline
representative workload
user impact
budget
decision gate
regression check
```

Не використовуються універсальні arbitrary percentages.

Significant unexplained regression блокує dependent migration step до investigation.

---

# 45. Benchmark isolation

**LOCKED principle**

Measurement tooling по можливості зберігається поза production runtime:

```text
bench/
scripts/
test harness
test utilities
```

Temporary instrumentation після decision може бути cleanup candidate.

---

# 46. Architecture checks

Максимум п'ять permanent architecture checks:

1. Generator не імпортує metadata.
2. Query core не імпортує VS Code API.
3. Metadata consumers після migration не обходять MetadataRepository/storage boundary.
4. Destructive cleanup можливий тільки для verified-owned storage.
5. SUPPORTED corpus regression є CI gate.

Не створюємо великий generic architecture-testing framework.

---

# 47. PR-by-PR Safety Rule

**LOCKED**

Architecture v2.1 реалізується серією малих незалежно перевірюваних PR.

Кожен PR:

- має одну основну технічну ціль;
- мінімізує кількість змінених subsystems;
- залишає repository working;
- має rollback point;
- містить tests для зміненої поведінки;
- не змішує migration, cleanup та unrelated refactor без необхідності.

Головне правило:

> No architectural migration PR may be merged first and covered by tests later.

---

# 48. Mandatory PR Regression Gate

**LOCKED**

Перед merge architecture/migration PR:

```text
typecheck
↓
unit tests
↓
targeted regression tests
↓
affected corpus
↓
full SUPPORTED corpus
↓
E2E if user-visible/WebView flow changed
```

Якщо PR змінює:

```text
metadata build
metadata load
parser
generator
QueryDocument
Apply
snapshot format
repository boundary
```

відповідні tests додаються/оновлюються у тому самому PR.

---

# 49. Regression gate between migration steps

**LOCKED**

```text
implementation
    ↓
targeted tests
    ↓
existing tests
    ↓
corpus regression
    ↓
affected E2E
    ↓
baseline comparison
    ↓
merge
    ↓
next migration step
```

Наступний step блокується, якщо:

- SUPPORTED corpus регресує;
- generated SDBL змінюється без explanation;
- metadata mismatch;
- Apply safety regression;
- existing E2E failure;
- significant unexplained performance regression.

---

# 50. Baseline before change

**LOCKED**

Перед ризиковим architecture step фіксується релевантний current baseline:

```text
typecheck
unit tests
E2E
corpus status
representative parser/generator behavior
metadata correctness
relevant performance metrics
```

Не потрібно вимірювати нерелевантні metrics для кожного маленького PR.

---

# 51. Rollbackability

**LOCKED**

Заборонено:

```text
PR A breaks old path
PR B adds partial new path
PR C adds tests
PR D makes system work again
```

Правильно:

```text
PR A
safe foundation
old behavior works

PR B
new implementation behind boundary
old behavior works

PR C
replacement validated

PR D
production switch

PR E
legacy removal
```

---

# 52. Feature flags

**CONDITIONAL**

Temporary migration flag допускається тільки якщо реально знижує risk або дозволяє controlled comparison/rollback.

Не lock-имо:

```text
single boolean specifically in panel.ts
```

Rollback mechanism має бути простим, але concrete placement — implementation detail.

Temporary flag після втрати validation/rollback purpose переходить у cleanup backlog.

---

# 53. Cleanup is separate

**LOCKED PROCESS RULE**

Migration:

```text
new path
→ validation
→ production switch
→ legacy runtime removal
→ stabilization
```

Потім окремий cleanup phase.

Cleanup candidates:

```text
temporary feature flags
comparison utilities
migration-only diagnostics
dead adapters
obsolete benchmark hooks
dead helpers
```

Permanent regression assets не видаляються:

```text
real-query corpus
golden fixtures
metadata fixtures
Apply safety tests
VT tests
parser resource tests
failure tests
useful benchmarks
```

Cleanup має власний regression gate.

---

# 54. P0 — Safety & Baseline

## P0.1 Corpus Baseline & Classification

Deliverables:

- deterministic classification rules;
- frozen corpus classification;
- CI gate for SUPPORTED regression;
- corpus diff/report support for baseline changes.

## P0.2 Metadata Build Safety

Deliverables:

- verified ownership guard;
- managed build generation;
- last-known-good preservation;
- logical commit abstraction;
- build issues diagnostics;
- failure tests;
- no destructive cleanup of unowned directories.

Ownership guard і build staging/commit behavior не повинні реалізовуватись у небезпечному проміжному стані, де marker існує, а старий destructive `rmSync` flow залишається допустимим.

## P0.3 Performance Baseline

Measure:

```text
metadata cold build
metadata warm load
heap
Extension Host blocking
WebView init/payload
representative parse/generate
```

## P0.4 Virtual Table Round-trip Verification

```text
parse
→ unrelated edit
→ generate
```

Classification and permanent regression tests.

## P0.5 Apply Safety Baseline

- capability/preservation gate;
- generated output sanity;
- generator exception handling;
- no editor write on failure;
- controlled user-visible error;
- permanent tests.

## P0.6 Parser Resource Safety Verification

- preserve existing recursion guard;
- adversarial/stress workload;
- identify real unbounded dimensions;
- add guard only when evidence requires it.

P0 може завершити цей пункт без production parser change, якщо additional unsafe dimensions не виявлено.

---

# 55. P1 — Metadata Migration

## P1.1 Minimal MetadataRepository Adapter

- repository boundary поверх current MetadataModel;
- reuse existing MetadataResolver where appropriate;
- do not duplicate equivalent semantic resolver abstraction;
- panel metadata lookup через boundary;
- WebView metadata tree через boundary.

## P1.2 New Snapshot Prototype

- reuse current XML handlers;
- build direct committed snapshot;
- current YAML/legacy remain fallback during validation;
- persisted format explicitly versioned.

## P1.3 Snapshot Validation

- independent metadata fixtures;
- old-vs-new migration comparison where useful;
- representative real configuration;
- relevant performance comparison;
- existing tests/corpus pass.

## P1.4 Production Switch

New backend becomes production path only after validation gates pass.

## P1.5 Remove YAML Runtime

Remove YAML as production runtime dependency after new backend is proven.

Debug/export tooling may remain only if it has explicit use.

## P1.6 Remove Legacy Fallback

Remove `parseCf`/legacy cache runtime only after:

- production path is proven;
- no runtime consumer requires fallback;
- tests have independent oracle;
- representative configuration passes new path only.

---

# 56. P1 — Query Foundation

## P1.7 Minimum Query State Separation

Minimum:

```text
MetaTable[] leaves QueryState
```

No Redux/state framework rewrite.

No mandatory QueryAnalysis interface.

## P1.8 Strict Syntax Validation SPIKE

Compare simplest viable strict validation approaches.

No parser framework lock before evidence.

## P1.9 Nested Token Range Parsing

**CONDITIONAL**

Implement only if profile/correctness/resource evidence justifies.

---

# 57. P2

Candidates:

- metadata-aware semantic analyzer v2;
- richer QueryAnalysis when real consumer exists;
- host isolation if measured necessary;
- WebView metadata protocol optimization if measured necessary;
- more capability-aware diagnostics;
- alias/scope/temp-table validation.

---

# 58. P3

Candidates:

- stronger source-preserving editing;
- wider SDBL coverage;
- incremental indexing;
- IDE-like hover/navigation/autocomplete;
- advanced structural editing;
- optional CST/source-preservation only if simpler model stops meeting correctness requirements.

---

# 59. NOT PLANNED

Без нових evidence/requirements:

```text
SQLite
custom binary DB
TypedArray columnar metadata
CST rewrite
ANTLR migration
tree-sitter migration
Rust
React → Solid
Redux
SessionManager
UUID system
global revision framework
QueryMetadataContext
universal diagnostics framework
Undo architecture rewrite
incremental parser rewrite
```

---

# 60. Recommended PR sequence

Нумерація може коригуватися залежно від dependency graph.

```text
PR-01
Corpus Baseline & Classification
+ SUPPORTED regression gate
+ corpus diff/report

PR-02
Metadata Build Safety
ownership + managed generation + logical commit
+ failure tests

PR-03
Performance Baseline

PR-04
VT round-trip verification/fix
+ permanent tests

PR-05
Apply Safety
+ generator exception test

PR-06
Parser Resource Safety verification

PR-07
Minimal MetadataRepository adapter
+ reuse existing MetadataResolver

PR-08
New snapshot prototype

PR-09
Snapshot correctness + representative config validation

PR-10
Production metadata switch

PR-11
Remove YAML runtime

PR-12
Remove legacy fallback

PR-13
Query state / metadata separation

PR-14
Strict syntax validation spike
```

Tasks можуть виконуватися паралельно, якщо dependency та regression gates це дозволяють.

---

# 61. Definition of Done: Production Snapshot Switch

Production switch дозволений, коли:

- new snapshot builds successfully;
- format compatibility validated;
- independent metadata fixtures pass;
- representative real configuration passes;
- relevant corpus/tests pass;
- relevant performance baseline acceptable;
- rollback path exists;
- failed new build cannot replace last-known-good generation.

Не використовується arbitrary gate типу:

```text
"wait one release"
"wait two weeks"
"one production build cycle"
```

Evidence важливіший за calendar delay.

---

# 62. Definition of Done: YAML Runtime Removal

YAML runtime removal дозволений, коли:

- production consumers no longer require YAML path;
- new snapshot is validated;
- all regression gates pass;
- rollback no longer depends on YAML implementation;
- tests do not require YAML production runtime as oracle.

---

# 63. Definition of Done: Legacy Runtime Removal

Legacy runtime removal дозволений, коли:

- `parseCf` no longer needed by runtime path;
- legacy cache has no production consumers;
- independent fixtures protect metadata correctness;
- representative config works on new path only;
- full regression gate passes.

---

# 64. Definition of Safe Migration

Migration v2.1 вважається safe, якщо:

1. Кожен migration step залишає repository working.
2. Tests додаються разом зі зміною.
3. SUPPORTED corpus не регресує без explicit documented approval.
4. Baselines не оновлюються silently.
5. Metadata switch перевірений independent fixtures та representative config.
6. Failed metadata build не знищує last-known-good.
7. Unowned user directories не destructive-cleaned.
8. Known-lossy/unknown-preservation query не проходить Apply.
9. Generator exception не модифікує editor.
10. Supported QueryDocument залишається safely generatable.
11. Significant unexplained performance regression investigation completed.
12. Legacy runtime видаляється тільки після replacement validation.
13. Cleanup виконується окремо.

---

# 65. Permanent test assets

Після migration зберігаються:

- real SDBL corpus;
- corpus classification;
- golden query fixtures;
- parser/generator round-trip tests;
- VT preservation tests;
- Apply safety tests;
- generator exception tests;
- metadata fixtures;
- metadata failure tests;
- parser resource tests;
- snapshot compatibility tests;
- architecture checks;
- useful performance benchmarks.

---

# 66. Migration-only assets

Можуть бути видалені окремим cleanup phase:

- old-vs-new comparison utilities;
- temporary feature flags;
- temporary fallback switches;
- migration-only diagnostics;
- dead adapters;
- migration-only benchmark hooks;
- legacy production code after removal gates.

---

# 67. Frozen architecture change rule

LOCKED рішення можна переглянути тільки при появі:

```text
new repository evidence
benchmark/profile evidence
correctness regression
security/safety issue
concrete product requirement
```

Недостатні причини:

```text
"cleaner architecture"
"more modern"
"future proof"
"I prefer framework X"
```

---

# 68. Final implementation cycle

Для кожної суттєвої зміни:

```text
UNDERSTAND CURRENT BEHAVIOR
        ↓
CAPTURE RELEVANT BASELINE
        ↓
ADD / IDENTIFY SAFETY TEST
        ↓
MAKE SMALLEST CHANGE
        ↓
RUN TARGETED TESTS
        ↓
RUN REGRESSION GATE
        ↓
COMPARE BASELINE
        ↓
MERGE
        ↓
ONLY THEN CONTINUE
```

---

# 69. Final priority order

1. No silent query data loss.
2. No destructive metadata corruption.
3. Correctness.
4. Rollback-safe evolutionary migration.
5. Stable regression protection.
6. Extension responsiveness.
7. Maintainability.
8. Performance optimization.
9. Architectural sophistication.

---

# 70. Final architecture statement

Architecture v2.1 is frozen.

The project shall evolve from the current working implementation through small, tested, rollback-safe steps.

The implementation must prefer:

```text
correctness
evidence
small changes
testability
rollbackability
clear migration gates
```

over architectural novelty.

> Better ten small verified PRs than one elegant refactor after which the source of regression cannot be identified.
