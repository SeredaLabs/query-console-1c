# New Builder --- Current State

> Updated against repository HEAD on 2026-09-24. The concise capability
> matrix lives in `.claude/new_builder_capability_map.md`; this document keeps
> the implementation detail and invariants.

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

Окремий webview entry/bundle (`out/webview/canvasApp.js`). Використовує той
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
Структура (`list-tree`), Поля (`symbol-field`), Умови (`filter`),
Групування (`group-by-ref-type`), Сортування (`sort-precedence`),
Додатково (`settings-gear`) --- усі шість мають реальний вміст (Phase
7-11, див. §10; оновлено 2026-09-23). Ключ `workspacePlaceholder` лишився
в i18n, але ніде не рендериться.

`PackageNav` вимірює фактичні DOM-ширини, а не перемикається за наперед
заданою кількістю запитів: повні номери Package/UNION лишаються видимими,
доки реально вміщуються, і тільки тоді переходять у pager `current/total`.
Package має пріоритет доступної ширини перед внутрішньою UNION-навігацією.

Спільний host Classic/Canvas при `queryConsole.openInNewWindow=true`
best-effort переносить панель у допоміжне вікно VS Code і відразу вмикає його
compact mode; якщо команда хоста недоступна, конструктор просто лишається у
звичайній вкладці. Canvas показує власний монохромний database/query glyph у
`DocumentBar` і використовує прозору tab-icon, щоб у некомпактному режимі не
було двох однакових identity-маркерів. Classic не має inline-маркера, тому
зберігає theme-aware SVG у вкладці редактора.

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

JOIN geometry тепер рахується одним детермінованим batch у
`structure/edgeRouter.ts`: ортогональні маршрути обходять прямокутники інших
карток із clearance, incident edges отримують окремі впорядковані port slots,
паралельні JOIN не мають ідентичного path, а вже прокладені сегменти дають
штраф за overlap/crossing. Badge обирає вільний сегмент маршруту з перевіркою
колізій із картками та попередніми badge. Той самий масив route points
використовують основний SVG, hit-area, overlay і minimap. Це локальний router
для поточних/вручну пересунутих позицій; автоматичне розташування вузлів
лишається існуючим BFS і не переводилось на ELK.

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

## 10. Інші panels (оновлено 2026-09-19: усі 6 вкладок WorkspaceNav тепер мають реальний вміст — Fields/Conditions/Grouping/Sorting/Additional)

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
створення `subquery`/`hierarchy`/`negated`-умов: вони можуть потрапити в
стан під час відкриття існуючого SDBL і мають зберігатися round-trip, але
Canvas UI такі умови структурно не створює. Простий v1-layout (без
адаптивних breakpoints, як у
Fields) --- кандидат для вирівнювання з Fields-патерном пізніше, якщо
знадобиться на вузьких viewport.

**Grouping Workspace (Phase 9) --- реалізовано** (2026-09-19,
`src/webview-canvas/grouping/GroupingWorkspace.tsx`): НАВМИСНО мінімальний
--- лише список `grouping.groupFields: FieldRef[]` (ADD_GROUP_FIELD/
REMOVE_GROUP_FIELD), без properties-панелі чи expression-бару (FieldRef
тут не має нічого іншого редагованого). Свідомо НЕ включено (explicit
scope decision користувача, задокументовано в коді):
- `grouping.aggregates` (окремий legacy/Classic-механізм призначення
  агрегатних функцій, паралельний `SelectedField.func`, яким уже керує
  Fields tab) --- НЕ дубльовано тут, щоб не було двох місць для одного
  поняття;
- "групуючі набори" (`grouping.multiple`/`groupSets`, Classic
  GroupingTab.tsx) --- окремий scope пізніше;
- HAVING (`model.having`) --- генератор його рендерить (`renderHaving`),
  але reducer не має ЖОДНОГО ADD_HAVING/SET_HAVING_* action; додавання
  такого UI вимагало б нових reducer actions, що суперечить принципу
  "переюзати наявне" цього проходу.

Reducer-side нюанс: `REMOVE_GROUP_FIELD` адресує елемент за (tableId,path)
--- для expression-based записів (tableId==='', path=''), що їх
auto-додає `SET_FIELD_FUNC` з Fields tab, це видалило б УСІ такі записи
одночасно; тому UI дозволяє remove лише для простих (не-expression)
рядків (expression-рядки читаються, але керуються тільки з Fields tab).
Live-QA підтвердив: ручний groupField + окремий агрегат на іншому полі
через Fields tab коректно співіснують без дублювання/конфліктів
(`СГРУППИРОВАТЬ ПО` містить лише явно згруповане поле, агрегатне поле
в SELECT не потрапляє в групування).

**Sorting Workspace (Phase 10) --- реалізовано** (2026-09-19,
`src/webview-canvas/sorting/SortingWorkspace.tsx`): список
`state.order.fields: OrderField[]` (ADD_ORDER_FIELD/REMOVE_ORDER_FIELD/
SET_ORDER_DIRECTION) + чекбокс "Автоупорядкування" (SET_ORDER_AUTO) ---
жодних нових reducer actions. Кандидати для "+ Поле" --- ЛИШЕ прості
(не-expression) поля, що ВЖЕ у SELECT (`state.selectedFields`), той
самий обсяг, що й Classic `OrderTab.tsx` (`distinctFieldRefs`), а НЕ всі
поля джерел (як у Grouping/Conditions) --- `OrderField` адресує лише
(tableId,path)/selectAlias/літеральний `&Параметр`, без довільних
виразів чи полів поза SELECT. Порожній стан веде на вкладку **Поля**
(не Структуру, на відміну від інших вкладок) --- саме там джерело
кандидатів для сортування.

Свідомо НЕ включено: reorder/пріоритет сортування --- `MOVE_ORDER_FIELD`
НЕ існує в reducer'і (на відміну від Fields' `MOVE_FIELD`), і Classic
`OrderTab.tsx` теж не має reorder UI (пріоритет --- порядок додавання) ---
це узгоджено з уже наявною поведінкою, не regression.

Live-QA підтвердив: додавання поля, зміна напрямку (УБЫВ), чекбокс
автоупорядкування і видалення --- усі коректно відображаються в
згенерованому SDBL (`УПОРЯДОЧИТЬ ПО ... УБЫВ` / `АВТОУПОРЯДОЧИВАНИЕ`).

**Additional Workspace (Phase 11) --- реалізовано** (2026-09-19,
`src/webview-canvas/additional/AdditionalWorkspace.tsx`, ОСТАННЯ вкладка
з roadmap --- усі 6 вкладок `WorkspaceNav` тепер мають реальний вміст).
Форма налаштувань (не грід-патерн, як інші вкладки) з трьох секцій:
- **"Вибірка записів"** --- ПЕРВЫЕ N / РАЗЛИЧНЫЕ / РАЗРЕШЕННЫЕ
  (SET_SELECTION_TOP/SET_SELECTION_DISTINCT/SET_SELECTION_ALLOWED,
  `state.selection: Selection`);
- **"Тип запиту"** (Phase 12A --- Temp Table UI Foundation, 2026-09-20)
  --- ДВІ половини, producer + consumer, ОБИДВІ вже повністю підтримані
  доменом, нуль нових reducer actions:
  - **producer**: `QueryType` (select/createTemp/appendTemp/dropTemp
    radio) + `tempTableName` text input, ті самі `SET_QUERY_TYPE`/
    `SET_TEMP_TABLE_NAME` actions, що й Classic `AdditionalTab.tsx`.
    `queryType`/`tempTableName` вже коректно зберігались/відновлювались
    у snapshot-логіці (`snapshots.ts`) і вже читались `PackageNav`'s
    `isTempTable` badge/`batchMemberName` ще ДО цієї зміни --- секція
    просто дає користувачу спосіб їх встановити; badge та ім'я
    ("ВТ_Ім'я · Тимчасова таблиця") запрацювали одразу без жодних змін
    у `PackageNav.tsx`.
  - **consumer**: `MetadataTree.tsx` тепер отримує опціональний
    `tempTables`/`onAddTempTable` --- окрема група "Тимчасові таблиці"
    (поза `GROUP_KINDS`, без search-фільтрації, той самий підхід, що й
    Classic `DbTreePanel`'s "tree.tempTables" секція), наповнена
    `availableTempTables(state)` (вже існуюча функція в
    `snapshots.ts`, сканує ЗАВЕРШЕНІ попередні package-члени з
    `queryType==='createTemp'|'appendTemp'`, синтезує `MetaTable` з
    їхнього SELECT-списку). Клік/double-click диспатчить `ADD_TEMP_TABLE`
    (НЕ `ADD_TABLE`!) --- критично, бо тільки цей action реєструє
    синтетичну метадані у `state.syntheticTables`, інакше подальший
    field-lookup (`allTables(state)`) не знайшов би колонки ВТ. New
    Builder використовує той самий double-click/"+" патерн, що й для
    звичайних таблиць --- НЕ drag&drop, яким це зроблено в Classic (свідоме
    UX-рішення, консистентне з рештою New Builder tree, не проблема
    паритету).
  - Live-QA підтвердив повний producer→consumer цикл: `createTemp`
    query 1 (`ПОМЕСТИТЬ ВТ_Автомобили`) → query 2 бачить ВТ у "Тимчасові
    таблиці", додає її як джерело, генерує коректний
    `ВЫБРАТЬ ... ИЗ ВТ_Автомобили КАК ВТ_Автомобили`.
  - Це НЕ Phase 13 повністю --- subquery-as-source (важча половина, з
    окремими condition-subquery/EXISTS gaps, див. §11) і "вручну описана
    тимчасова таблиця" (окремий `SelectedTable.tempTable`-діалог, Classic
    "Temporary table window") свідомо НЕ входять у цей зріз.
- **"Блокування"** --- ДЛЯ ИЗМЕНЕНИЯ (SET_LOCK_ENABLED/ADD_LOCK_TABLE/
  REMOVE_LOCK_TABLE, `state.lockForUpdate: string[]` адресує таблиці за
  `fullName`, НЕ за `id`; чекбокс-список будується з `state.selectedTables`).

Жодних нових reducer actions. Свідомо НЕ включено:
- **"Кеш метаданих"** (refresh-button + preserveComments) --- Canvas не має
  відповідного UI. Після об'єднання host-коду `panel.ts` уже підтримує
  `refreshCache`, тому для майбутнього додавання потрібне лише обережне
  Canvas UI wiring, а не окремий протокол чи копія host-логіки.

Live-QA підтвердив точний порядок ключових слів генератора (`selectionModifiers()`:
РАЗРЕШЕННЫЕ → РАЗЛИЧНЫЕ → ПЕРВЫЕ N) і коректний `ДЛЯ ИЗМЕНЕНИЯ
<Таблиця>` при виборі джерела для блокування.

SDBL preview (`SdblDock`) у Canvas існує (низ екрана, collapsible) і вже
закриває базову частину Phase 15: реальний generated text, read-only
CodeMirror/SDBL highlighting, copy, resize та expand/collapse. Не реалізовано
лише field/join/condition-to-SDBL cross-highlight; тому Phase 15 ще не
закрита формально.

**UNION + temp-table compound-carrier invariant (fix-фаза, 2026-09-20, ПЕРЕД Phase 12B)** ---
під час дизайну Phase 12B (візуалізація producer→consumer у `PackageNav`)
виявлено й виправлено pre-existing (ще з Classic) semantic bug: `queryType`/
`tempTableName` зберігались НЕЗАЛЕЖНО в кожному union-члені (`SavedQuery`
per-slot), хоча `ПОМЕСТИТЬ`/`ДОБАВИТЬ` має РІВНО один граматичний слот у 1С
SDBL (одразу після списку полів ПЕРШОГО учасника; `ОБЪЕДИНИТЬ` --- пізніша
секція ТОГО САМОГО оператора, `docs/development/query-model.md`). Reducer
дозволяв побудувати невалідні стани (createTemp на не-першому union-члені,
кілька createTemp, dropTemp усередині union), а генератор (`buildQueryBlock`)
рендерив `queryType` з БУДЬ-ЯКОГО учасника без перевірки позиції.
Виправлено (без нового domain-абстракції, тільки нормалізація існуючого):
- `compoundQueryType(state)`/`compoundTempTableName(state)` (нові selector'и
  в `snapshots.ts`) --- читають через member 0 незалежно від активного
  учасника; `AdditionalTab.tsx`/`AdditionalWorkspace.tsx` тепер показують
  ЦЕЙ compound-стан, а не `state.queryType` активного слоту напряму.
- `SET_QUERY_TYPE`/`SET_TEMP_TABLE_NAME` маршрутизують запис у member 0's
  saved slot, коли активний учасник ≠ 0 (а НЕ no-op/disable --- це дало б
  дивний UX "чому я не можу редагувати Тип запиту, дивлячись на SELECT 2").
- `dropTemp` заблоковано (no-op), поки `queryList.length > 1`; `ADD_QUERY`
  заблоковано (no-op), поки поточний (єдиний) запит --- `dropTemp` (dropTemp
  XOR union --- УНИЧТОЖИТЬ самостійний оператор, несумісний з SELECT-arm).
- `REMOVE_QUERY(0)` мігрує carrier (queryType/tempTableName) на НОВИЙ
  member 0 замість тихої втрати наміру користувача.
- `buildQueryBlock` (generator) отримав `isFirst` параметр --- захист in
  depth: навіть якщо хтось напряму сконструює модель з createTemp на
  не-першому учаснику (round-trip хендредагованого SDBL, не через reducer),
  `ПОМЕСТИТЬ`/`ДОБАВИТЬ` НЕ потрапить у вивід поза першим блоком.
- Нормалізація existing saved state (invalid non-zero-member queryType при
  restore) СВІДОМО відкладена --- потребує окремого рішення про
  deterministic-vs-ambiguous carrier resolution, не destructive reset.
- 10 нових тестів (`queryStore.test.ts`, `sdblGenerator.test.ts`) --- усі
  invariant-стани з аудиту (routing, dropTemp block, REMOVE_QUERY migration
  у трьох гілках, generator position-defense).

**Phase 12B --- Package Temp-Table Continuity --- реалізовано** (2026-09-20,
`src/webview-canvas/components/PackageNav.tsx` + новий похідний селектор
`derivePackageTempTableContinuity` у `snapshots.ts`). Візуалізує вже-існуючий
producer→consumer зв'язок (createTemp/appendTemp → FROM тієї ж ВТ у
пізнішому package-члені) БЕЗ жодного нового domain-стану чи графа залежностей.

Алгоритм (`derivePackageTempTableContinuity(state): Map<memberIndex, PackageTempTableRelation[]>`):
1. Проходить `assembleBatch(state).members`; для кожного package-члена читає
   compound carrier (`members[i].members[0].model.queryType`/`tempTableName`
   --- той самий member-0-invariant, що вже зафіксований аудитом) --- якщо
   `createTemp`/`appendTemp` з іменем, реєструє producer-роль для цього
   члена; `origin`-мапа (`ім'я → перший package-член, що його визначив`)
   дедуплікує ПОВТОРЮВАНІ імена ТОЧНО так само, як уже робить
   `availableTempTables`'s `seenNames` (first-wins, жодної нової семантики).
2. Проходить УСІ union-члени (не лише member 0!) кожного package-запиту,
   шукаючи `SelectedTable.fullName`, що збігається з раніше зареєстрованим
   ім'ям ВТ, ЯКЩО producer йде РАНІШЕ в пакеті (`originIndex < i`, package
   ordering enforced). Знайдений збіг --- consumer-роль для цього члена,
   із посиланням на producer-член.
3. Повертає на член: 0-N ролей (`creates`/`appends`/`consumes`), кожна --- з
   `relatedMembers` (для producer --- consumers; для consumer --- рівно один
   producer). Порожня Map, коли в пакеті немає жодної ВТ.

Свідоме рішення по appendTemp/повторюваних іменах (не вигадана семантика):
member, що робить `appendTemp` до ВЖЕ існуючого імені, отримує ВЛАСНИЙ
маркер (`role: 'appends'`), але НЕ отримує "consumedBy" --- домен не дає
способу відрізнити, чиї саме рядки (creator чи appender) прочитав
конкретний пізніший споживач, тож усі споживачі завжди резолвяться на
ПЕРШОГО (origin) виробника --- вигадувати точніший розподіл означало б
implicit-семантику, якої `availableTempTables` сама не підтверджує.

PackageNav UI (A+B hybrid, погоджений заздалегідь): один codicon-database
маркер на package-чіпі (не printить ім'я ВТ у самому чіпі; порожньо, коли
`continuity.size===0` --- рядок лишається настільки ж компактним, як і
сьогодні). Tooltip (native `title`, багаторядковий) пояснює роль --- "Створює
ВТ_X\n\nВикористовується: Запит 2" / "Використовує ВТ_X\n\nСтворено: Запит
1" / мульти-ВТ список. Hover ТА keyboard focus (`tabIndex=0`, `onFocus`)
на маркері підсвічують пов'язані package-чіпи accent-кольором
(`boxShadow: inset 0 -2px 0 accent`) --- той самий "субтільний, не яскравий"
принцип, що й focus/dimming на канві; жодних permanent ліній/стрілок/нового
рядка. Активний package-чіп (`[n]`, bold+accent color) лишається візуально
сильнішим за hover-highlight (різні механізми: колір тексту vs
box-shadow-підкреслення).

Live-QA підтвердив: порожній пакет --- нуль зайвого UI; 2-member
producer→consumer --- обидва маркери й tooltip коректні; keyboard-focus
highlight підсвічує саме пов'язаний чіп (перевірено програмно, мишача
`hover` через MCP browser tool не транслюється 1:1 у координати цього
конкретного елемента --- відомий tooling-нюанс, не баг застосунку); 1024px
і 768px --- без horizontal overflow, без layout jump.

Не видалено (навмисно, per explicit scope): активного-запиту суфікс
"ВТ_X · Тимчасова таблиця" лишається --- ВІЗУАЛЬНО частково дублює новий
маркер+tooltip для АКТИВНОГО producer-чіпа, але це не автоматично
видалено в цій фазі (окреме рішення користувача, не наша call).

10 нових тестів (`derivePackageTempTableContinuity` describe у
`queryStore.test.ts`) --- усі сценарії з ТЗ: один/декілька consumers, один
consumer декількох ВТ, consumer у не-першому UNION-члені, producer із
власним UNION, unused ВТ, package ordering, appendTemp-до-тієї-самої-назви,
повторювані імена. UI-рівень покритий лише через live-QA (не React
component tests) --- відповідає explicit "Add UI tests only where useful".

**Phase 12 --- фінальний стан, ЗАФІКСОВАНО (2026-09-20).** Після Phase 12A/12B
пройшло ще три доопрацьовувальні fix-паси (той самий audit-cycle, що й
compound-carrier вище, без нового roadmap-номера кожному) --- разом вони
закривають ВЕСЬ semantic/lifecycle шар temp-таблиць, спільний для Classic і
New Builder, ПЕРЕД стартом PackageNav quick-actions:

- **`appendTemp` continuity (contributor chain)** --- `derivePackageTempTableContinuity`
  для consumer-ролі повертає `relatedMembers` = ВСІ contributors (creator +
  усі appenders) lifetime'у, що його читає consumer, а не лише перший
  creator (виправлення `.filter(c => c < i)` після падіння pre-existing
  тесту --- consumer МІЖ creator і пізнішим appender інакше помилково
  зв'язувався з appender, якого ще не було на позиції consumer'а). Створено
  document-level `compoundCarrierOf(doc: QueryDocument)` (`unionModel.ts`)
  --- єдине джерело істини для "member-0 несе carrier", щоб деталь
  реалізації не витікала в кожен виклик окремо.
- **`8.3.25+` badge** --- `appendTemp` ("Додавання до тимчасової таблиці")
  позначено версійним badge (не warning-колір, tooltip з поясненням) в
  ОБОХ Additional-панелях (Classic `AdditionalTab.tsx` + New Builder
  `AdditionalWorkspace.tsx`) --- суто інформаційний UI-нюанс, без нової
  domain-семантики чи reducer-обмеження за версією.
- **`dropTemp` lifecycle-awareness** --- `availableTempTables`/
  `derivePackageTempTableContinuity` РАНІШЕ повністю ігнорували
  `dropTemp` (ВТ лишалась "вічно доступною" після створення). Введено
  єдиний спільний state-machine `deriveTempTableLifetimes(members):
  Map<name, TempTableLifetime[]>` (`snapshots.ts`) --- `TempTableLifetime
  = {name, createIndex, appendIndices, dropIndex, fields}`; КОЖЕН
  `createTemp` тієї самої назви ЗАВЖДИ відкриває НОВИЙ, незалежний
  lifetime (навіть поверх ще не закритого попереднього --- "останній
  виграє" fallback для того, що в реальному 1С уже runtime-помилка, без
  вигаданої "чистої" семантики для invalid стану). `dropTemp` --- ТЕПЕР
  повноцінна continuity-роль (`role: 'drops'`), той самий codicon-database
  маркер (роль --- лише в tooltip, жодної нової іконки/кольору за explicit
  рішенням користувача). `availableTempTables` після `dropIndex` більше НЕ
  показує ВТ доступною для наступних членів пакета.
- **Position-aware metadata resolution ("Option B")** --- виявлена й
  виправлена суміжна вада: `ADD_TEMP_TABLE`'s `uniqueSourceName()`
  трактував КОЖНЕ повторне додавання package-похідної ВТ як колізію імен і
  перейменовував її (`ВТ_A` → `ВТ_A2`), бо `state.syntheticTables` --- це
  ГЛОБАЛЬНИЙ, ніколи не очищуваний реєстр (правильний для свого вузького
  призначення --- ручні/ad hoc синтетичні джерела --- але помилково
  застосовувався і до package-похідних ВТ). Порівняно два варіанти
  виправлення (документовано в аудиті цієї фази): "A" --- глобальний
  replace-in-syntheticTables (мав відомий "stale resolution при
  navigate-back" ґандж, ВІДХИЛЕНО explicit рішенням користувача) проти "B"
  --- position-aware resolution через уже наявний `deriveTempTableLifetimes`
  (обрано, малий локальний фікс, БЕЗ нового persisted стану). Реалізовано:
  - `allTables(state)` тепер компонує ТРИ ДЖЕРЕЛА в явному пріоритеті:
    `[...availableTempTables(state), ...metadataCatalogRef.current,
    ...state.syntheticTables]` --- package-похідне ЗАВЖДИ перше (`.find()`
    бере його раніше за будь-який stale manual-запис з тим самим іменем).
    Пріоритет зафіксований регресійним тестом (порядок масивів --- тепер
    семантично важливий, а не випадковий).
  - `ADD_TEMP_TABLE` розгалужується через новий `isPackageTempTableName(state,
    fullName)` (`snapshots.ts`, перевіряє належність до ПОТОЧНО відкритого
    package lifetime): package-похідна ВТ --- НЕ реєструється в
    `syntheticTables` взагалі (fullName лишається БЕЗ змін, лише alias
    дизамбігується --- ТОЧНО той самий `base+1`-паттерн, що вже й
    `ADD_TABLE` для self-join звичайних джерел); manual/ad hoc ВТ --- стара
    поведінка (uniqueSourceName + syntheticTables) без жодної зміни.
  - `UPDATE_TEMP_TABLE` --- захисний guard (`isPackageTempTableName` → no-op,
    referentially-equal state): package-похідну структуру НЕ можна
    відредагувати вручну (вона й так резолвиться щоразу заново з
    lifetime-джерела), лише manual/ad hoc ВТ лишається editable.
  - UI-афорданс "Редагування структури ВТ" (Classic `TablesPanel.tsx`
    Edit-кнопка) --- прихований для package-похідних ВТ через похідний
    `focusedIsPackageTempTable` (обчислюється в `ConstructorView.tsx` з
    `isPackageTempTableName`), БЕЗ нового прапорця на `SelectedTable`.
  - Regression-тести (`queryStore.test.ts`, новий describe "allTables /
    ADD_TEMP_TABLE / UPDATE_TEMP_TABLE --- Option B") фіксують: незалежні
    lifetime'и (той самий `fullName` двічі, РІЗНІ схеми, навігація вперед
    і назад --- без leak в жоден бік), self-join (fullName ідентичний,
    alias дизамбігований --- `ВТ_A`/`ВТ_A1`, НЕ `ВТ_A2`), append-ланцюг
    (create→append→consume --- одна логічна ідентичність), manual ВТ
    (незмінна поведінка), UPDATE-guard (referential no-op), name-collision
    пріоритет (package-похідне виграє над stale manual). Генератор-рівневий
    self-join тест (`sdblGenerator.test.ts`) підтверджує коректний SDBL:
    `ИЗ ВТ_A КАК ВТ_A, ВТ_A КАК ВТ_A1`.
  - **Live-QA (2026-09-20, після повної перезбірки) підтвердив ОБИДВА
    критичні сценарії руками, не лише тестами:** (1) `createTemp
    ВТ_A(Наименование) → consume → dropTemp → createTemp ВТ_A(Дата) →
    consume` --- друге споживання бачить `Дата` (не leak з першого
    lifetime), навігація НАЗАД до першого consumer після цього все ще
    показує `Наименование` (не leak з другого) --- нуль `ВТ_A2`-style
    перейменувань упродовж усього сценарію; (2) package-похідна ВТ додана
    ДВІЧІ в один запит (self-join) --- обидві картки мають identical
    `fullName: ВТ_A`, aliases `ВТ_A`/`ВТ_A1`, згенерований SDBL підтверджує
    `ИЗ ВТ_A КАК ВТ_A, ВТ_A КАК ВТ_A1`.

**Архітектурне розмежування трьох джерел метаданих (закріплено Option B,
критично для будь-якої майбутньої роботи з `allTables`/`ADD_TEMP_TABLE`/
`ADD_TABLE`):**

```
metadata catalog (metadataCatalogRef.current)
    реальні метадані конфігурації 1С (глобальні, статичні, read-only)

syntheticTables (state.syntheticTables)
    ручні/ad hoc синтетичні метадані (подзапити, вручну описані ВТ) ---
    ГЛОБАЛЬНЕ поле QueryState, НІКОЛИ не очищується при перемиканні
    запиту/пакета; коректне ЛИШЕ для свого вузького призначення

package temp tables (availableTempTables(state))
    похідні від ПОЗИЦІЇ в пакеті + temp-table lifetime
    (deriveTempTableLifetimes) --- НІКОЛИ не персистяться як окремий
    стан; той самий `fullName` в РІЗНИХ package-позиціях може резолвитись
    у РІЗНІ схеми (окремі lifetimes) --- це очікувана, тестами зафіксована
    поведінка, а не bug

SelectedTable (state.selectedTables)
    інстанс джерела в КОНКРЕТНОМУ запиті (id, fullName, alias?) ---
    fullName ЗАВЖДИ ідентичність (не змінюється для self-join)

alias (defaultTableAlias(t) / t.alias)
    ЄДИНИЙ механізм дизамбігуації кількох інстансів того самого fullName
    в одному запиті (self-join) --- НІКОЛИ не fullName/identity
```

Classic і New Builder ділять ЦІЛКОМ ці семантики (жоден з трьох fix-пасів
цієї фази не торкнувся domain-шару окремо для одного з двох UI) ---
`isPackageTempTableName`/`allTables`/`compoundCarrierOf` викликаються з
обох `src/webview/` і `src/webview-canvas/` без розбіжностей.

## 11. Відомі обмеження / gaps (оновлено 2026-09-24)

**Поточний milestone:** baseline Phases 0--12 реалізований; STOP 2 ще не
зафіксований; наступна основна фаза --- Phase 13. Phase 14 виконана
достроково, Phase 15 виконана без cross-highlight, Phase 18 частково виконана
для Structure/TableCard.

- немає query execution/results/row forecast --- і не повинно бути;
- **Відкриття й збереження запиту працюють** (оновлено 2026-09-23;
  попередня версія цього пункту стверджувала протилежне). Команда
  `1c.queryConstructorCanvas` шукає запит під курсором (`extension.ts`),
  `canvasPanel.ts` шле `hasInitialQuery: !!initialQueryText` і
  `loadModel`; Canvas розбирає його тим самим `tryOpenBatch` →
  `LOAD_BATCH`, що й Classic. Помилка розбору --- блокуючий overlay, з
  якого лише Close (без `insertText`). «Зберегти» шле `insertText` через
  той самий `insertResult()`. Перевірка перед збереженням --- СПІЛЬНИЙ із
  Classic `src/webview/applyGate.ts` (`findStaticApplyBlocker` постійно,
  `decideApply` → `validateBatchText` при натисканні); повідомлення ядра
  локалізує Classic `localizeDiagnostic`. Правило: у Canvas не дублювати
  логіку Classic, а перевикористовувати/виносити в спільний модуль.
- Спільний із Classic код (2026-09-23, правило «не дублювати Classic»):
  сесія з хостом і стан завантаження --- `webview/hooks/useDesignerSession.ts`
  (Canvas тепер показує overlay завантаження); хост панелі ---
  `panel.ts` `createDesignerPanel` (`canvasPanel.ts` лише задає bundle/
  заголовок; хост уже обробляє `expandRef`/`refreshCache`, тож для них
  потрібен лише UI); дерево метаданих --- `webview/metadataTreeModel.ts` +
  `components/highlightMatches.tsx`; оператори --- `webview/conditionOperators.ts`;
  `bridge`/`ResizeHandle` --- Classic-модулі; поля сортування ---
  `distinctFieldRefs`. Сторожі: `applyGate`/`metadataTreeModel`/`canvasReuse`/
  `canvasLoadFailure` тести.
- формальний STOP 2 не пройдено: немає зафіксованого Classic/Canvas
  semantic-parity прогону на однаковій domain model;
- `npm run test:e2e` досі запускає лише Classic harness (`main.js`) і не
  покриває реальний Canvas-сценарій load → edit → Save → insertText;
- немає UI оновлення кешу метаданих, UI розгортання полів-посилань,
  reorder/rename запитів пакета;
- кнопку «Скасувати» в Canvas свідомо НЕ додаємо (рішення користувача
  2026-09-23): Canvas --- вкладка/вікно VS Code, закриття якого вже дорівнює
  скасуванню (панель знищується без `insertText`); явний вихід потрібен лише
  на overlay помилки відкриття, і там кнопка «Закрити» є. Не вважати це
  прогалиною паритету з Classic.
- table alias editing не підтримувався reducer;
- параметри віртуальної таблиці відображаються лише як badge: у Canvas немає
  UI, що диспатчить уже наявний `SET_VIRTUAL_PARAMS`;
- per-table filters/indexes/DISTINCT не можна вигадувати, якщо model
  settings query-level;
- ExpressionBuilder у Canvas відсутній (Phase 16, не почато);
- CodeMirror вже використовується read-only у SDBL dock; інтеграція
  ExpressionBuilder/editable expression UX відкладена до Phase 16;
- drag field-to-field для JOIN відкладений (Phase 17);
- arbitrary cyclic graph не має гарантії crossing elimination;
- manual temp table / subquery-as-source були в Classic, але не мали
  Canvas parity (Phase 13, окремий implementation gate перед стартом --
  див. Query Scope рішення в roadmap);
- немає SKD/report builder mode;
- Fields (Phase 7), Conditions (Phase 8), Grouping (Phase 9), Sorting
  (Phase 10) і Additional (Phase 11) --- вкладки реалізовано, див. §10,
  але НЕ весь scope цих фаз з roadmap: немає ИТОГИ (Phase 9), індексів
  (Phase 11), "групуючих наборів", HAVING, reorder пріоритету сортування,
  "Кеш метаданих". "Тип запиту"/тимчасові таблиці реалізовано (Phase 12A:
  `QueryIdentityPopover.tsx`, `AdditionalWorkspace.tsx`), зіставлення
  колонок ОБЪЕДИНЕНИЯ --- `UnionMappingPopover.tsx`.
- Phase 14 фактично реалізована: `PackageNav` керує UNION/UNION ALL і
  учасниками, `UnionMappingPopover` показує позиційне зіставлення та дозволяє
  змінювати aliases/порядок без вигаданого explicit-mapping domain object;
- Phase 15 реалізована, крім cross-highlight між workspace selection і
  відповідним фрагментом згенерованого SDBL.

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
audit і системне полірування вже реалізованих Fields/Conditions/Grouping/
Sorting/Additional та майбутніх екранів.

Phase 6 (Joins Overview) --- **завершено** (2026-09-18):
`JoinsOverview.tsx` (станом на 2026-09-23 окремого файлу немає --- список
живе в `structure/JoinManagerPopover.tsx`) --- floating popover (той самий паттерн, що Source
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

Історична примітка до цього STOP 1-прогону: тоді JOIN-лінії були простими
діагоналями й могли проходити через незв'язані картки. Цей конкретний gap
закрито у 0.1.87: `edgeRouter.ts` будує obstacle-aware ортогональні маршрути,
розводить паралельні ребра та порти хабів, а minimap використовує ту саму
геометрію. Auto-layout вузлів усе ще лишається детермінованим BFS, а router не
гарантує усунення кожного перетину у довільному циклічному графі; це вже
вужче активне обмеження, не старе проходження ліній крізь картки.

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
