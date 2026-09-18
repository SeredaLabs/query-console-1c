# New Builder --- Visual Design Specification

## 0. Purpose

Це visual source of truth для New Builder. Він визначає layout,
proportions, spacing, typography, surfaces, component geometry, states і
reference screens.

Він НЕ створює domain capabilities.

Якщо approved screenshot і цей spec розходяться по presentation ---
screenshot має пріоритет. Якщо screenshot/spec показує unsupported
functionality --- repository/domain має пріоритет, control не
симулювати.

## 1. Design intent

New Builder = modern developer tool: - compact; - technical; - calm; -
dense, але читабельний; - neutral surfaces; - strong selection/focus; -
мінімум decoration.

Не SaaS dashboard, не CRM, не копія 1C Configurator.

## 2. Global layout

``` text
┌────────────────────────────────────────────────────────────────────────────┐
│ DOCUMENT BAR                                                               │
├─────────────────┬───────────────────────────────────┬──────────────────────┤
│                 │ WORKSPACE NAVIGATION              │                      │
│    SIDEBAR      ├───────────────────────────────────┤      INSPECTOR       │
│                 │            WORKSPACE              │                      │
├─────────────────┴───────────────────────────────────┴──────────────────────┤
│ SDBL PREVIEW                                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3. Dimensions

-   minimum app width: 1100px;
-   recommended: 1280--1920px;
-   Document Bar: 44px;
-   Workspace Navigation: 40px;
-   Sidebar: default 260px, min 220px, max 340px, collapsed 40px;
-   Inspector: default 300px, min 260px, max 380px;
-   SDBL collapsed: 36px;
-   SDBL expanded default: 180px;
-   SDBL resize range: 120--400px.

## 4. Spacing

Базова шкала: `4 / 8 / 12 / 16 / 24 / 32px`

-   control inner gap: 4--8;
-   row vertical padding: 6--8;
-   card padding: 8--12;
-   panel padding: 12;
-   section gap: 16;
-   large section gap: 24.

Не плодити випадкові 10/14/18px без причини.

## 5. Radius / borders

-   small controls: 4px;
-   cards: 6px;
-   popover/dialog: 6px;
-   large panels: 0--4px;
-   standard border: 1px theme-aware;
-   selected: accent border/outline 1--2px.

Не робити великі pill cards.

## 6. Typography

Використовувати VS Code theme/font variables де можливо.

-   UI: 13px / 18px;
-   secondary: 12px / 16px;
-   section labels: 11px, 600, uppercase, slight letter spacing;
-   panel heading: 14px, 600;
-   query title: 13--14px, 600;
-   SDBL: VS Code monospace 12--13px.

## 7. Colors

Не хардкодити palette, якщо можна використати VS Code variables.

Semantic tokens: - background; - surface-1; - surface-2; -
surface-hover; - surface-selected; - border; - border-strong; - text; -
text-secondary; - text-muted; - accent; - danger; - warning; - success.

Table identity colors використовувати як невеликі accents, не як
full-card backgrounds.

## 8. Document Bar

``` text
┌──────────────────────────────────────────────────────────────────────┐
│ 1C Query Builder   Продажі за період        ⇄ Класичний Cancel Save │
└──────────────────────────────────────────────────────────────────────┘
```

Right order: `⇄ Класичний` → `Скасувати` → `Зберегти`.

Save = primary emphasis. Classic = neutral secondary.

## 9. Workspace Navigation

Target: `Структура | Поля | Умови | Групування | Сортування | Додатково`

Active: - font weight 600; - 2px bottom accent; - no giant filled pill.

Counts secondary, напр. `Поля 5`.

## 10. Sidebar

Header: `[ Метадані ] [ Пакет 4 ]`

### Metadata

``` text
Метадані

[ 🔎 Пошук метаданих... ]

▾ Документи
    ЗаказКлиента                    +
    РеализацияТоваров               +

▾ Довідники
    Контрагенти                     +
    Номенклатура                    +

▸ Регістри накопичення
▸ Регістри відомостей
▸ Перелічення
```

Search height: 30--32px. Tree row: 28px. Sidebar padding: 8--12px.

Не мати постійного дублюючого `Обрані джерела` у target design.

### Package

``` text
ПАКЕТ

① Продажі
   SELECT → #Продажі

② Індекс
   INDEX #Продажі

③ Підсумковий
   SELECT

④ Очистити
   DROP #Продажі

+ Додати запит
```

Step min-height 48px, padding 8px. Active = subtle selected surface +
thin accent left edge.

Package не використовує Play icon.

## 11. Structure Workspace

Canvas background = editor background. Допустимий дуже subtle dot grid
16--20px.

Toolbar height: 36px.

``` text
− 100% +   Fit   Auto Layout            Зв'язки 6    + Джерело
```

Не робити toolbar великим.

## 12. TableCard

-   default width: 240px;
-   min: 220px;
-   max: 280px;
-   radius: 6px;
-   border: 1px;
-   selected: accent outline.

Header: 38px.

``` text
[color badge] Name                    ⋮
              Alias / type
```

Identity badge: 6--8px.

Field row: 27--30px.

``` text
☑ FieldName                       Type
```

Card body max-height приблизно 360--420px з internal scroll для довгих
списків.

Long names: ellipsis + tooltip. Не розширювати card до абсурдної ширини.

## 13. JOIN

Visible line: - normal 2px; - selected 3px.

Invisible hit target: 8--10px.

Default = neutral theme-aware stroke. Hover/selected = accent.

Label: `LEFT / INNER / FULL` - 20--22px height; - 11px font; - 4px
radius.

Не використовувати gradient/rainbow як основний topology cue.

## 14. Focus states

Table selected: - selected table 100%; - incident joins 100%; -
neighbors 100%; - unrelated nodes 30--40%; - unrelated joins 20--30%.

Join selected: - selected line + endpoint cards emphasized; - unrelated
dimmed.

Background click = clear focus.

Transition: 120--160ms.

## 15. Minimap

Bottom-right. Approx 160×100px. Показувати переважно коли graph реально
перевищує viewport; не нав'язувати для trivial graph.

## 16. Inspector

Header: 36px, sticky. Body scrollable. Padding: 12px. Section gap:
16--24px.

Користувач бачить одну концепцію `ВЛАСТИВОСТІ`.

### Table

``` text
ВЛАСТИВОСТІ

● Контрагенти
  Довідник

ПОЛЯ
☑ Наименование
☐ Код
☐ Группа
☐ ИНН

ІНФОРМАЦІЯ
24 поля
2 табличні частини
Ієрархічний
```

### Join

``` text
ВЛАСТИВОСТІ ЗВ'ЯЗКУ

Заказ
↓
Контрагент

Тип
[ LEFT ▾ ]

УМОВИ

Заказ.Контрагент
=
Контрагент.Ref

AND

Заказ.Организация
=
Контрагент.Организация

+ Умова

────────────
Видалити зв'язок
```

### Virtual table

``` text
ПАРАМЕТРИ ТАБЛИЦІ

ОстаткиИОбороты

Початок
[ &Начало ]

Кінець
[ &Конец ]

Періодичність
[ Месяц ▾ ]

Умова
[ ... ]
```

## 17. Joins Overview

Secondary representation, не primary tab.

Preferred: overlay drawer усередині central workspace, width 320--380px.

Row:

``` text
Заказ → Контрагент
LEFT
Контрагент = Ref
```

Selected row = subtle selected surface + accent edge.

Click list row → focus Canvas JOIN → open Inspector. Canvas JOIN
selection → corresponding list row.

## 18. Fields Workspace

``` text
┌────────────────────────────────────────────────────────────┐
│ ПОЛЯ РЕЗУЛЬТАТУ                              + Додати поле │
├────────────────────────────────────────────────────────────┤
│ ☰  Заказ.Дата                         → Дата               │
│ ☰  Контрагент.Наименование            → Контрагент         │
│ ☰  SUM(Продажи.Сумма)                 → СуммаПродаж        │
└────────────────────────────────────────────────────────────┘
```

Row: 40--44px.

Columns: - drag handle; - expression; - alias; - optional aggregate
badge; - menu.

Не загортати кожен row у велику card.

Field Inspector показує лише domain-supported controls.

## 19. Conditions Workspace

Primary language = tree + rows.

``` text
▼ Всі умови                                      AND

   Заказ.Дата
   [ >= ] [ &Начало ]

   Заказ.Проведен
   [ = ] [ ИСТИНА ]

   ▼ Будь-яка з умов                             OR

      Заказ.Сумма
      [ > ] [ 100000 ]

      Контрагент.Вид
      [ = ] [ &VIP ]

+ Умова    + Група
```

Nested indent: 20--24px/level. Condition row: 36--44px. Не створювати
arbitrary nesting, якщо domain не підтримує.

## 20. Grouping Workspace

``` text
ГРУПУВАННЯ

☰ Контрагент
☰ Номенклатура

+ Поле


АГРЕГАТИ

SUM   Продажи.Сумма     → СуммаПродаж
COUNT Заказ.Ref         → Количество

+ Агрегат


ПІДСУМКИ

☑ Увімкнути підсумки

По
[ Контрагент ▾ ]

☑ Ієрархічні
```

Секції відділяються spacing, а не giant cards.

## 21. Sorting Workspace

``` text
СОРТУВАННЯ

☰ СуммаПродаж          DESC
☰ Контрагент           ASC
☰ Дата                 AUTO

+ Поле
```

Row: 40px. Direction = compact dropdown/button.

## 22. Additional Workspace

``` text
ДОДАТКОВО

РЕЗУЛЬТАТ
☑ DISTINCT

□ Перші
  [ 100 ]

ДОСТУП
☑ Дозволені

БЛОКУВАННЯ
□ Для зміни

ТИМЧАСОВА ТАБЛИЦЯ
□ Помістити результат

Ім'я
[ #Продажі ]
```

Тільки domain-supported settings. Не робити card для кожного checkbox.

## 23. Package Main Workspace

``` text
ПАКЕТ ЗАПИТІВ

● 1  Продажі
│
│     SELECT
│     → #Продажі
│
○ 2  Індекс
│
│     INDEX #Продажі
│
○ 3  Підсумковий
│
│     SELECT
│     ← #Продажі
│
○ 4  Очистити

      DROP #Продажі

+ Додати крок
```

Vertical timeline: - node \~24px; - line 1px neutral; - active node
accent.

## 24. UNION Workspace

``` text
UNION ALL

┌ SELECT 1 ─────────────┐       ┌ SELECT 2 ─────────────┐
│ Контрагент            │ ←→    │ Клиент                │
│ Дата                   │ ←→    │ Date                  │
│ Сумма                  │ ←→    │ Amount                │
│ Статус                 │ ←→    │ —                     │
└────────────────────────┘       └───────────────────────┘
```

Alignment row: 32--36px. Mismatch = subtle warning.

Не робити drag mapping без domain support.

## 25. SDBL Dock

Collapsed:

``` text
{ } SDBL                         Generated     Copy   ▴
```

Expanded:

``` text
┌──────────────────────────────────────────────────────────────┐
│ { } SDBL                                 Copy   Collapse    │
├──────────────────────────────────────────────────────────────┤
│ 1  ВЫБРАТЬ                                                  │
│ 2      Заказ.Дата КАК Дата,                                 │
│ 3      ...                                                  │
│ 4  ИЗ                                                       │
│ 5      Документ.ЗаказКлиента КАК Заказ                      │
└──────────────────────────────────────────────────────────────┘
```

Read-only на першому етапі. Syntax colors бажано з theme/editor tokens.
Cross-highlight --- пізніша фаза.

## 26. Empty states

Structure:

``` text
Додайте перше джерело
Оберіть таблицю в панелі метаданих
[ + Додати джерело ]
```

Fields:

``` text
Немає полів результату
Оберіть поля у Structure або додайте вираз.
```

Conditions:

``` text
Умов немає
Запит повертає дані без WHERE-умов.
[ + Додати умову ]
```

Grouping:

``` text
Групування не налаштоване
Додайте поля групування або агрегати.
```

## 27. Hover / selected / disabled / errors

Hover transition: 80--120ms. Не анімувати scale/position.

Selection priority:
`selected > hover > focus-neighbor > normal > dimmed`.

Disabled opacity: 0.45--0.55. Unsupported permanent controls краще не
показувати, ніж тримати fake disabled.

Error = subtle danger edge/icon + short text. Warning = warning tone, не
full red.

## 28. Scroll / resize

-   Sidebar independent scroll.
-   Canvas pan/zoom.
-   list workspaces vertical scroll.
-   Inspector independent scroll.
-   SDBL independent code scroll.
-   Document Bar + workspace nav fixed.

Resizable: - Sidebar; - Inspector; - SDBL height.

Не робити draggable кожен divider.

## 29. Narrow width

\<1200px: - Inspector може стискатися до 260px; - Sidebar до 220px; -
secondary toolbar labels можуть скорочуватись; - Joins drawer overlay.

Не робити mobile layout.

## 30. Theme

Dark theme: - не pure black; - не pure white borders; - muted identity
colors.

Light theme: - не pure-white card soup; - subtle surface hierarchy.

## 31. Icons

Фінально --- consistent inline SVG. Не emoji. Unicode допустимі тільки
як temporary implementation.

Не використовувати Play для Package.

## 32. Animation

-   panel expand/collapse: 120--180ms;
-   hover: 80--120ms;
-   focus dim: 120--160ms;
-   drawer: 150--200ms.

Без bounce/spring effects.

## 33. Canvas interaction

Pan cursor: grab/grabbing. Dragging card не повинен pan canvas. JOIN
click/selection не повинен drag canvas.

Auto-layout gaps орієнтовно: - horizontal 80--120px; - vertical
40--64px.

## 34. Structure Reference Screen

``` text
┌────────────────────────────────────────────────────────────────────────────┐
│ 1C Query Builder   Продажі за період              ⇄ Класичний Cancel Save│
├───────────────┬──────────────────────────────────────────┬─────────────────┤
│ Метадані      │ Структура Поля Умови Групування ...    │ ВЛАСТИВОСТІ     │
│ Пакет         ├──────────────────────────────────────────┤                 │
│               │ − 100% + Fit Auto       Зв'язки 3      │ LEFT JOIN       │
│ 🔎 Пошук      │                                          │                 │
│               │ ┌ Заказ ───────────────┐                 │ Заказ           │
│ Документи     │ │ ☑ Дата              │                 │ →               │
│   Заказ       │ │ ☑ Контрагент        │                 │ Контрагент      │
│               │ │ ☐ Сумма             │                 │                 │
│ Довідники     │ └──────●──────────────┘                 │ Тип             │
│   Контрагент  │        │ LEFT                            │ [ LEFT ▾ ]      │
│               │        │                                 │                 │
│               │        ●                                 │ УМОВИ           │
│               │ ┌ Контрагент ──────────┐                 │ Заказ.X = Ref   │
│               │ │ ☑ Наименование      │                 │                 │
│               │ │ ☐ ИНН               │                 │ + Умова         │
│               │ └──────────────────────┘                 │                 │
├───────────────┴──────────────────────────────────────────┴─────────────────┤
│ { } SDBL                                        Generated       Copy   ▴  │
│ ВЫБРАТЬ ...                                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

## 35. Source-of-truth priority

### Functionality

Repository/domain → Capability Map → Roadmap → Visual Spec.

### Presentation

Approved screenshots → Visual Spec → Roadmap → Current UI.

Screenshot може визначати presentation, але не створює unsupported
domain capability.

## 36. Visual Implementation Check

Перед кожним screen:

``` text
VISUAL IMPLEMENTATION CHECK

Reference screen:
Existing component:
Exact dimensions used:
Visual states:
Domain-supported controls:
Unsupported controls from reference:
Decision:
```

## 37. Definition of Visual Done

Перевірити: - proportions; - density; - spacing; - typography; -
alignment; - hover; - selected; - dimmed; - empty; - overflow; -
dark/light; - narrow width; - SDBL integration.

Фінальний принцип:

``` text
STRUCTURE
   ↓
CURRENT SELECTION
   ↓
EDITING
   ↓
GENERATED SDBL
```

Якщо UI красивіший, але структура читається гірше --- рішення
неправильне.
