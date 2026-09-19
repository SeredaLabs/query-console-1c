# New Builder --- Current State

## 1. Призначення документа

Цей файл описує **фактичний поточний стан** Canvas-конструктора. Він не
є roadmap і не повинен трактувати майбутні UX-рішення як уже
реалізовані.

Repository є остаточним джерелом істини. Перед роботою Claude повинен
перевірити наведені нижче твердження по актуальному коду.

## 2. Product boundary

Extension є візуальним генератором тексту SDBL для 1C:Enterprise.

Він: - не підключається до бази 1С; - не виконує запити; - не показує
реальні результати; - не має Results grid / Preview Data; - не оцінює
кількість рядків; - не будує execution plan.

Будь-які Run / Execute / Results / Preview Data / Connection / Estimated
Rows / Query Plan поза scope.

## 3. Архітектура

Є два UI:

### Classic Builder

`src/webview/`

Поточний стабільний UI. Підключений через extension panel і використовує
shared query state/reducer/core.

### Canvas / New Builder

`src/webview-canvas/`

Окремий webview entry/bundle (`out/webview/canvas.js`). Використовує той
самий `QueryState` і reducer, що Classic.

Canvas-specific transient state --- позиції карток, zoom, selection та
інший чисто presentation state --- не повинен створювати нову domain
semantics у `QueryState`.

## 4. Shared domain

Перед будь-якою зміною перевірити: - `src/core/query/`; -
`QueryModel`; - `BatchDocument`; - `QueryDocument`; - parser /
`parseBatch()`; - generator / `generate()`; -
`src/webview/state/queryStore.ts`; - `src/shared/messages.ts`.

`assembleBatch` та існуюча parser/generator pipeline мають
перевикористовуватись там, де це вже робить проєкт.

## 5. Поточний Canvas shell (оновлено після Phase 1-5.7 + пост-фазні bug-fix пасі)

Фактично реалізовано: - `DocumentBar` (top row); - `PackageNav`
(package-стрічка, Sidebar/Package перенесено сюди, окремого Sidebar
"Package mode" більше немає); - `Workspace` = `WorkspaceNav` (tab strip)
+ активна вкладка; - `Inspector` (right panel, монтується лише коли є
selection); - `SdblDock` (низ, collapsible).

`WorkspaceNav` tabs (з іконками-codicon на кожній, Phase 5.8):
Структура (`list-tree`) --- єдина з реальним вмістом; Поля
(`symbol-field`), Умови (`filter`), Групування (`group-by-ref-type`),
Сортування (`sort-precedence`), Додатково (`settings-gear`) --- усі
Phase 1 placeholder ("Цей workspace буде реалізовано в наступній фазі").

**Важливо (bug-fix, актуально для будь-якої майбутньої вкладки):**
`Workspace.tsx` монтує `StructureWorkspace` ЗАВЖДИ (приховує через
`display:none` на неактивних вкладках), а не умовно. Раніше умовний
unmount/remount при перемиканні вкладок скидав pan/zoom/ручні позиції
карток (усі локальні хуки `StructureWorkspace` гинули). Будь-яка нова
вкладка з власним persistent local state має той самий підводний
камінь --- монтувати завжди, ховати візуально.

Persistent Sidebar (Метадані/Пакет) видалено ще в Phase 3E --- metadata
browsing переїхало у floating `SourceBrowserPopover`, що відкривається з
Toolbar-кнопки "+ Джерело" (double-click у дереві = додати джерело,
`+`/зелена `✓` іконка -- та сама inclusion-мова, що й у TableCard).

## 6. Structure Workspace (Phase 3-5.8, основний реалізований екран)

`StructureWorkspace.tsx` містить: - `Toolbar` (zoom −/100%/+, Fit,
Авто-компоновка, "+ Джерело", "+ Додати зв'язок"); -
`SourceBrowserPopover` (floating, позиціонується відносно кнопки "+
Джерело", подвійний клік у дереві = додати джерело/tabular section); -
`CanvasSurface` (pan/zoom/dot-grid, background click = deselect); -
`TableCard`-и (Phase 3A+, geometry frozen --- див. п.8); - JOIN-шар
(`JoinPath` під картками + `JoinOverlay` над картками, endpoint markers +
LEFT/INNER/FULL badge); - `Minimap` (показується лише коли контент
реально перевищує viewport); - focus/dimming (Phase 5, `useMemo` в
`StructureWorkspace`) --- **асиметрична** семантика: table selected →
focus = картка + усі прямі JOIN'и + їх endpoint-картки; join selected →
focus = ЛИШЕ цей JOIN + рівно 2 його картки (без transitive expansion).
Deterministic join-selection clear: `REMOVE_TABLE` завжди скидає
join-selection, якщо JOIN обраний (не object-reference tracking).

Manual positions/zoom/selection --- local/transient, не персистяться в
domain model. Auto Layout --- layered/BFS, не force-directed.

## 7. Inspector (Phase 4, реалізовано)

`Inspector.tsx` --- одна користувацька концепція замість колишньої
пріоритетності JoinInspector/VirtualParamsPanel/TablePropertiesPanel.
Selection --- `StructureSelection` (`{kind:'table', tableId}` |
`{kind:'join', joinIndex}` | `null`), піднятий у `App.tsx`. Source
Inspector --- read-only display (fullName/alias/kind/badges) + "Видалити
джерело". Join Inspector --- read-only (kind/сторони/умови через
`describeJoinCondition`) + "Видалити зв'язок". Жодного функціонального
розширення понад існуючі reducer actions (`REMOVE_TABLE`/`REMOVE_JOIN`).

## 8. TableCard (Phase 5-5.8, **visual system frozen до Phase 18**)

Fixed geometry (НЕ чіпати без окремого approval): width 240px, height
232px (header 40 + fields-viewport 192, internal scroll), однакова для
УСІХ source nodes незалежно від кількості полів. `ResizeObserver`/
`onMeasured`/`setCardSize`/`colorIndex`-dot видалено як мертвий код
(Phase 5).

Header: `MetaKindIcon` + fullName (primary, 13px/600) + alias (secondary,
10.5px) + quiet `×` (яскравіший on hover/selected, без "..." меню).
Header має власний subtle background band (`color-mix` з foreground 6%
у surface1) --- відокремлює зону source-identity від fields-body без
зміни border-товщини.

Field row --- two-level anatomy, `ROW_HEIGHT=35`:
```
[icon] TechnicalName                    [+ / green ✓]
       Synonym · CompactType
```
- technical name --- ЗАВЖДИ primary (12.5px/500), synonym+type --- secondary
  (10.5px, `TOKENS.text` @ opacity 0.75 --- "muted, не disabled");
- synonym показується лише якщо `field.synonym` реально відрізняється
  від `field.name` (не дублюється, не вигадується);
- reference-поле в рядку --- компактне `→ Target` (без "Kind." префіксу),
  повний `describeFieldTypes()` --- лише в tooltip;
- inclusion control --- ТА САМА візуальна мова, що Source Browser
  `AddControl`: тиха `codicon-add` (приглушена, hover row → opacity 1) /
  зелена `codicon-check` (`TOKENS.success`, завжди opacity 1) --- НЕ
  native checkbox (замінено в Phase 5.5 після live-QA: суцільний
  checkbox-квадрат читався занадто "жирним");
- included-row tint --- `color-mix(TOKENS.success 5%, transparent)`
  (extremely subtle, щоб кілька included-рядків підряд не зливались у
  "selection-подібний" блок); row separator --- `color-mix(borderSubtle
  50%, transparent)` (тихіше за суцільний border);
- semantic icon (`codicon-references` reference / `codicon-symbol-field`
  ordinary) вирівняний по одній вертикальній лінії з header `MetaKindIcon`
  (колонка = 14px, той самий width що іконка в header);
- **bug-fix**: клік по field-row має `e.stopPropagation()` в onClick --- 
  раніше бульбашився до кореневого `onClick` картки й мимоволі викликав
  `onSelect(table.id)` (відкривав Inspector при виборі поля). Картка
  обирається ТІЛЬКИ через header (`onHeaderPointerDown`).

`GREEN check = inclusion`, `accent/blue = graph selection/focus` --- дві
різні семантики, свідомо не змішані (checked field row НЕ отримує
blue/selection-стиль).

## 9. JOIN

Є: `JoinPath` (SVG лінія, 2px/3px selected, під картками) +
`JoinOverlay` (endpoint markers + LEFT/INNER/FULL badge, над картками,
над-картковий "Видалити зв'язок" при selected). Один `Inspector`
(п.7) замість колишньої окремої пріоритетності панелей.

**Створення/редагування з'єднання (закрито 2026-09-18, gap у Phase 3/4,
не окрема фаза):** і creation popover (Toolbar "Додати зв'язок"), і
Inspector тепер мають ОДНАКОВУ структуровану форму — три секції
(Джерела / Тип з'єднання / Умова зв'язку). `JoinKindPicker`
(`structure/JoinKindPicker.tsx`) — спільний segmented control з
icon+color на кожен тип (INNER=`chartBlue`/`arrow-swap`,
LEFT=`chartOrange`/`arrow-left`, FULL=`chartPurple`/`combine` —
навмисно НЕ accent/success, щоб не конфліктувати з selection/inclusion
семантикою). `ConditionModeToggle` (`structure/Toolbar.tsx`, exported)
— перемикач "Поле"/"Довільний вираз", відкриває доступ до вже існуючих
`SET_JOIN_CUSTOM`/`SET_JOIN_EXPRESSION` (раніше в UI не було входу,
хоча reducer підтримував). Редагування в Inspector — лише для
single-conjunct joins (multi-conjunct лишається read-only, це Phase 8
Conditions Workspace territory). Canvas-бейдж (`JoinOverlay`) кольорів
JoinKindPicker НЕ отримав — той лишається frozen (Phase 5 visual
freeze), кольорова identity — тільки в панелях налаштування.

## 10. Інші panels (оновлено 2026-09-19: Fields і Conditions реалізовано, Grouping/Sorting/Additional — ще НІ)

**Fields Workspace (Phase 7) --- реалізовано** (`src/webview-canvas/fields/FieldsWorkspace.tsx`):
грід ВЖЕ вибраного SELECT-списку (checkbox/#/Вираз/Псевдонім/Тип/Агрегація),
клік по рядку --- "Вираз поля" знизу + "Властивості поля" праворуч,
той самий SET_FIELD_EXPRESSION/SET_FIELD_ALIAS/SET_FIELD_FUNC/MOVE_FIELD/
REMOVE_FIELD/ADD_EXPRESSION_FIELD reducer actions. Адаптивний layout
(wide ≥1200 / medium 850-1200 / narrow &lt;850, ResizeObserver) --- toolbar
компактується, `table-layout:fixed` грід з ellipsis+tooltip, вертикальний
стек нижче 850px. Resizable Properties-панель і resizable колонки
(Псевдонім/Тип/Агрегація).

**Conditions Workspace (Phase 8) --- реалізовано** (2026-09-19,
`src/webview-canvas/conditions/ConditionsWorkspace.tsx`): той самий
грід-патерн, що й Fields --- таблиця ВЖЕ доданих WHERE-умов
(`state.conditions: Condition[]`, ПЛОСКИЙ список, генератор з'єднує
елементи неявним "І"/AND, без структурного OR/групування), клік по
рядку --- "Вираз умови" знизу (editable лише для custom) + "Властивості
умови" праворуч (Оператор/Параметр/чекбокс "Використовувати як
довільний вираз"). Reducer actions --- ADD_CONDITION/REMOVE_CONDITION/
SET_CONDITION_CUSTOM/SET_CONDITION_OPERATOR/SET_CONDITION_PARAM/
SET_CONDITION_EXPRESSION (той самий набір, що вже використовував Classic
`ConditionsTab.tsx`) --- жодних нових reducer actions. Немає екшена для
створення `subquery`/`hierarchy`/`negated`-умов (заповнюються лише
парсингом існуючого SDBL, якого New Builder ще не робить) --- UI такі
умови не створює. Простий v1-layout (без адаптивних breakpoints, як у
Fields) --- кандидат для вирівнювання з Fields-патерном пізніше, якщо
знадобиться на вузьких viewport.

`WorkspaceNav` вкладки Групування/Сортування/Додатково --- і досі Phase 1
placeholder (текст "Цей workspace буде реалізовано в наступній фазі").
SDBL preview (`SdblDock`) у Canvas існує (низ екрана, collapsible), але
це той самий read-only generated-text dock, що й у Phase 1 shell, не
field-level cross-highlight (Phase 15, не почато).

## 11. Відомі обмеження / gaps (оновлено 2026-09-18)

- немає query execution/results/row forecast --- і не повинно бути;
- **New Builder НЕ підтягує існуючий запит при відкритті команди.**
  `1c.queryConstructorCanvas` (`extension.ts`) навмисно НЕ шукає запит під
  курсором (на відміну від Classic `1c.queryConstructor`), і
  `canvasPanel.ts` завжди шле `hasInitialQuery: false` --- панель стартує
  з порожнього `initialState()` незалежно від контексту виклику. Це
  свідоме архітектурне рішення (Structure/Fields ще не мали
  SDBL→QueryState парсингу назад), а не забутий баг. Classic-шлях
  (`createPanel`/`panel.ts`) вже вміє це робити (`queryText`/`queryRange`
  → `QueryState`) --- інфраструктура існує, просто не підключена до
  Canvas. Явного номера фази під це в roadmap немає (найближче --- STOP 2
  "Full SELECT Validation" неявно це передбачає, коли Canvas стане
  functionally complete); варто розглянути як окрему фазу перед/біля
  Phase 7, якщо user захоче "edit existing query" workflow раніше.
- table alias editing не підтримувався reducer;
- per-table filters/indexes/DISTINCT не можна вигадувати, якщо model
  settings query-level;
- ExpressionBuilder у Canvas відсутній (Phase 16, не почато);
- CodeMirror integration відкладений (Phase 16);
- drag field-to-field для JOIN відкладений (Phase 17);
- arbitrary cyclic graph не має гарантії crossing elimination;
- manual temp table / subquery-as-source були в Classic, але не мали
  Canvas parity (Phase 13, окремий implementation gate перед стартом --
  див. Query Scope рішення в roadmap);
- немає SKD/report builder mode;
- Fields (Phase 7) і Conditions (Phase 8) --- реалізовано, див. §10;
  Grouping/Sorting/Additional workspace-и (Phase 9-11) --- placeholder,
  не почато.

Ці твердження обов'язково перевірити по актуальному repository перед
реалізацією.

## 12. Поточна color/visual модель (оновлено 2026-09-18)

Table identity colors (циклічні) лишились лише для `Minimap`
(`identityColor`/`colors.ts`) --- у самій `TableCard` identity-крапку
замінено на `MetaKindIcon` ще в Phase 5.

Canvas повністю перейшов на `codicon.css` (той самий шрифт, що вже
використовує Classic) --- Unicode/simple glyphs, згадані в попередній
версії цього документа, більше не актуальні ніде в `webview-canvas/`,
окрім самого "✕"/"→" як звичайного тексту (не іконка, навмисно). Уся
семантична іконографія (reference/ordinary field, MetaKind, inclusion
`+`/`✓`, workspace-tab іконки) --- codicon, консистентна між
TableCard/Source Browser/Inspector/WorkspaceNav.

**Візуальний статус (для швидкої відповіді на "де ми по visual roadmap"):**
Phase 5 (Focus/Graph Readability) --- **завершено**: standardized card
geometry, focus/dimming, header/field typography density, inclusion
color language (green=inclusion vs accent=selection), icon alignment,
scrollbar polish --- усе це пройшло кілька live-QA раундів (Phase
5.1-5.8 у розмовах з користувачем, не формальні номери в roadmap-файлі)
і зафіксовано як **frozen до Phase 18** (жодних змін geometry/density/
information-model без explicit approval). Це фактично закриває істотну
частину Phase 18 (Final Polish) для TableCard/Structure заздалегідь ---
типографіка, іконки, hover/selected/focus, dark/light theme вже
консистентні; те, що з Phase 18 залишається на потім, --- accessibility
audit і будь-яка полірування НОВИХ екранів (Fields/Conditions/...), яких
ще немає.

Phase 6 (Joins Overview) --- **завершено** (2026-09-18):
`JoinsOverview.tsx` --- floating popover (той самий паттерн, що Source
Browser/Join creation popover), відкривається кнопкою "Зв'язки (N)" у
Toolbar (disabled коли 0 joins). Textual list поверх `state.joins`
(kind badge + `alias ↔ alias`), клік по рядку == клік по JOIN на канві
(reuse `handleSelectJoin`) --- Inspector й canvas focus/dimming
синхронно оновлюються; ✕ на рядку == `handleRemoveJoin`. Selected-рядок
підсвічується accent-тінтом (НЕ green --- green зарезервовано для
inclusion). Toolbar тепер має третю групу кнопок: Джерело/Зв'язок (ліво,
Phase 5.9 reorder) → Зв'язки-overview → | → zoom/Fit/Авто-компоновка
(право). Усі toolbar-кнопки (Джерело/Зв'язок/Зв'язки/Fit/Авто-компоновка)
отримали codicon-іконки (add/link/list-unordered/screen-full/layout).

Phase 0-6 --- завершено.

**STOP 1 (Structure Validation) --- пройдено (2026-09-18).** Живий QA-прогон
у harness (12 canvasApp.js на момент прогону збірки, не спрощений
fixture): 12 джерел (5 довідників у ланцюжку посилань, 3 документи, один
довідник-співробітники, одна віртуальна таблиця регістра накопичення
`Остатки`, і окремий роз'єднаний фрагмент з 2 довідників), 12 JOIN'ів ---
мікс INNER/LEFT/FULL, три хаби розгалуження (`Контрагенты` --- 3 вхідних
зв'язки, `Автомобили` --- 3 вхідних), один custom-expression JOIN
(документ↔документ, замикає цикл/трикутник у графі), один JOIN на
virtual-table полях, і повністю ізольована пара.

Результат: - жодних console errors/crash при створенні 12 джерел + 12
JOIN'ів через UI (Source Browser search + JoinManagerPopover create/list
цикл); - Fit і Авто-компоновка стабільно працюють на 12 картках, без
накладання карток одна на одну; - Minimap з'являється лише коли content
реально перевищує viewport (`contentExceedsViewport`), коректно показує
всі 12 карток кольоровими прямокутниками; - Focus/dimming (Phase 5)
коректно ізолює: вибір хаб-таблиці (`Контрагенты`) притлумлює
незв'язані картки, лишаючи емфазу на інцидентних JOIN'ах+сусідах; вибір
таблиці з ІЗОЛЬОВАНОГО фрагмента притлумлює ввесь основний граф ---
підтверджує, що ізоляція рахується за реальною графовою досяжністю, а не
випадково; - custom-expression JOIN і JOIN на полях virtual table
інтегруються без спеціальних багів чи винятків у типовій перевірці
(`fieldTypeCompat`).

Відоме, свідомо прийняте обмеження (вже задокументоване в roadmap,
підтверджене цим прогоном, НЕ регресія): фіксований grid-layout
(auto-layout) не topology-aware, тож у хаб-таблиць (3+ вхідних зв'язки з
різних рядків сітки) лінії йдуть діагонально через незв'язані картки ---
читабельно завдяки kind-кольору, але візуально "гучно" при повному огляді
складного графа. Roadmap прямо забороняє force-directed layout (§ Phase
3) --- це узгоджений trade-off, не bug.

Дрібний polish-момент (не блокер): повторний клік "Авто-компоновка" при
активному selection іноді змінює zoom/pan фокус на несподіване значення
(напр. 132% з нецентрованим кадруванням) --- кандидат для Phase 18, не
для негайного фіксу.

Висновок: **зелене світло на Phase 7 (Fields Workspace)** --- structure
layer тримає складність на цільовому масштабі (8-12 sources/10-15 joins).

## 13. Головний архітектурний принцип

Classic і New Builder мають співіснувати:

``` text
                 SHARED CORE
      QueryState / reducer / parser / generator
                    │
          ┌─────────┴─────────┐
          │                   │
   Classic Builder       New Builder
   src/webview/          src/webview-canvas/
   preserve/freeze       rethink UX freely
```

Classic --- functional reference/fallback. New --- greenfield UX поверх
shared domain.
