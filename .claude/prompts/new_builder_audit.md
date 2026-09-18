# Claude Code Task --- New Builder Audit & Plan

Repository: `SeredaLabs/query-console-1c`

## Завдання

Підготувати архітектурно перевірений план розвитку **New Builder** у
`src/webview-canvas/`.

На цьому проході **НЕ ПИШИ КОД**.

## Перед початком

Прочитай: - `.claude/new_builder_current_state.md`; -
`.claude/new_builder_roadmap.md`; -
`.claude/new_builder_visual_spec.md`; -
`.claude/new_builder_capability_map.md`; -
`docs/design/new-builder/README.md`.

Після цього досліди реальний repository.

## Архітектурний контракт

### Classic Builder

`src/webview/`

-   не переписувати;
-   не замінювати;
-   використовувати як functional reference.

### New Builder

`src/webview-canvas/`

-   окремий сучасний UX;
-   не зобов'язаний копіювати Classic;
-   може radically rethink presentation;
-   повинен мапитись на реальні shared domain semantics.

### Shared core

Перевір: - `src/core/query/*`; - `QueryModel`; - `BatchDocument`; -
`QueryDocument`; - parser / `parseBatch()`; - generator /
`generate()`; - `src/webview/state/queryStore.ts`; - `QueryState`; -
reducer/actions; - `src/shared/messages.ts`; - Classic UI; - current
Canvas UI.

Repository є source of truth.

## Product boundary

Extension: - генерує SDBL; - не підключається до 1C DB; - не виконує
query; - не показує Results/Preview Data; - не оцінює row counts; - не
показує execution plan.

Не пропонуй і не плануй Run/Execute/Results/Connection/Preview
Data/Estimated Rows/Query Plan.

## Anti-hallucination rule

Перед будь-яким target control встанови: 1. domain representation; 2.
reducer/action; 3. Classic reference; 4. generator support; 5.
parser/round-trip support.

Якщо не підтверджено --- `UNKNOWN`.

Не вигадуй reducer actions або domain fields.

Якщо target UX потребує зміни: - `src/core/query/*`; - reducer
semantics; - Host/Webview protocol;

познач це як `REQUIRES_DOMAIN_CHANGE` і не плануй автоматичну реалізацію
без explicit approval.

## STEP 1 --- Repo Audit

Досліди architecture і фактичний стан New Builder.

Не покладайся на markdown як на доказ реалізації.

## STEP 2 --- Capability Map

Заповни `.claude/new_builder_capability_map.md`.

Для кожного capability наведи concrete evidence: - file; - type/state
field; - action/function; - Classic/Canvas component; - generator/parser
path, якщо relevant.

Status: - SUPPORTED; - UI_ONLY_REFACTOR; -
DOMAIN_SUPPORTED_CANVAS_MISSING; - REQUIRES_DOMAIN_CHANGE; - DEFERRED; -
UNKNOWN.

## STEP 3 --- Current vs Target

Порівняй actual `src/webview-canvas/` з: - roadmap; - visual spec; -
approved screenshots, якщо вони додані.

Розклади різницю на: - already implemented; - UI-only refactor; - reuse
existing reducer; - domain-supported but missing Canvas UI; - requires
domain change; - unknown.

## STEP 4 --- Visual Implementation Matrix для Phase 1--6

Для: 1. Shell; 2. Sidebar; 3. Structure; 4. Unified Inspector; 5.
Focus/Readability; 6. Joins Overview;

вкажи: - existing components; - target components; - files expected to
change; - local UI state changes; - domain actions used; - exact visual
rules зі spec; - unsupported visual controls; - acceptance criteria; -
tests; - risks.

## STEP 5 --- Implementation Gates

Підготуй gate для кожної Phase 1--6:

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

## STEP 6 --- Self-check

Критично перевір власний audit.

Для кожного твердження про capability переконайся, що є concrete code
evidence.

Будь-яке припущення без доказу переведи в `UNKNOWN`.

Окремо перевір: - чи не приписав ти Canvas/shared core функціонал, якого
немає; - чи не створив fake domain requirement через visual spec; - чи
не запропонував зміну Classic; - чи не запропонував execution/database
functionality.

## STEP 7 --- STOP

НЕ ПИШИ КОД.

Покажи: 1. короткий architecture summary; 2. заповнений capability map;
3. critical/major risks; 4. current-vs-target delta; 5. detailed plan
Phase 1--6; 6. implementation gates; 7. питання, які реально потребують
explicit decision.

Не переходь до Phase 1 implementation без явної команди користувача.
