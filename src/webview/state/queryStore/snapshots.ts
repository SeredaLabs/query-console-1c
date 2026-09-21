import type { MetaField, MetaTable } from '../../../core/metadata/types';
import type { Grouping, Indexing, Order, QueryModel, QueryType, ReportBuilder, SelectedField, Totals } from '../../../core/query/queryModel';
import { compoundCarrierOf, fieldAlias, type QueryDocument, type UnionMember } from '../../../core/query/unionModel';
import type { BatchDocument } from '../../../core/query/batchModel';
import type { BatchSnapshot, QueryState, SavedQuery } from '../queryStore';

/** Пустой построитель отчёта: все секции без строк. */
export function emptyBuilder(): ReportBuilder {
  return { fields: [], conditions: [], order: [], totals: [] };
}

/**
 * Предзаполнение окна «Временная таблица» для существующего источника-ВТ (двойной
 * клик). Имя — РЕАЛЬНОЕ имя ВТ (`sel.fullName`, напр. `#ВТ`/`&ВТ`), а НЕ
 * `defaultTableAlias`: иначе двойной клик по `#ВТ КАК ВТ` потеряет ведущий `#`.
 * Поля — из синтетической метатаблицы источника.
 */
export function tempTableDialogInitial(state: QueryState, editId: string): { name: string; fields: { name: string }[] } | undefined {
  const sel = state.selectedTables.find(t => t.id === editId);
  if (!sel) return undefined;
  const meta = state.syntheticTables.find(t => t.fullName === sel.fullName);
  if (!meta) return undefined;
  return { name: sel.fullName, fields: meta.fields.map(f => ({ name: f.name })) };
}

/** Извлечь working set активного запроса в сериализуемый SavedQuery. */
export function snapshotActive(state: QueryState): SavedQuery {
  return {
    selectedTables: state.selectedTables, selectedFields: state.selectedFields, tabSectionFields: state.tabSectionFields,
    grouping: state.grouping, conditions: state.conditions, joins: state.joins, selection: state.selection,
    queryType: state.queryType, tempTableName: state.tempTableName, lockForUpdate: state.lockForUpdate,
    lockEnabled: state.lockEnabled,
    order: state.order, totals: state.totals, builder: state.builder, indexing: state.indexing,
    comments: state.queryComments,
  };
}

/**
 * Восстановить плоские поля из снимка (или пустые значения по умолчанию при null).
 * Транзитные поля фокуса всегда сбрасываются.
 */
export function restoreSaved(_state: QueryState, saved: SavedQuery | null): Partial<QueryState> {
  const base = saved ?? {
    selectedTables: [], selectedFields: [], tabSectionFields: [],
    grouping: { multiple: false, groupFields: [], groupSets: [], aggregates: [] } as Grouping,
    conditions: [], joins: [], selection: {}, queryType: 'select' as QueryType, tempTableName: '', lockForUpdate: [],
    lockEnabled: false,
    order: { fields: [], auto: false } as Order,
    totals: { groupFields: [], totalFields: [], grand: false } as Totals,
    builder: emptyBuilder(), indexing: { indexes: [] } as Indexing, comments: undefined,
  };
  return {
    selectedTables: base.selectedTables, selectedFields: base.selectedFields, tabSectionFields: base.tabSectionFields,
    grouping: base.grouping, conditions: base.conditions, joins: base.joins, selection: base.selection,
    queryType: base.queryType, tempTableName: base.tempTableName, lockForUpdate: base.lockForUpdate,
    order: base.order, totals: base.totals, builder: base.builder, indexing: base.indexing,
    queryComments: base.comments, lockEnabled: base.lockEnabled,
    focusedSelectedTableId: null, focusedSelectedFieldIdx: null,
  };
}

/** Собрать QueryModel из снимка (или из плоских полей активного запроса). */
export function buildModelFromFlat(flat: SavedQuery): QueryModel {
  return {
    tables: flat.selectedTables, fields: flat.selectedFields, tabSectionFields: flat.tabSectionFields,
    grouping: flat.grouping, conditions: flat.conditions, joins: flat.joins, selection: flat.selection,
    queryType: flat.queryType, tempTableName: flat.tempTableName, lockForUpdate: flat.lockForUpdate,
    // Блокировка включена, но ни одной таблицы не выбрано — это голая `ДЛЯ ИЗМЕНЕНИЯ`
    // (блокировка всех источников), а не отсутствие секции (см. комментарий у
    // SavedQuery.lockEnabled и QueryModel.lockForUpdateBare).
    lockForUpdateBare: flat.lockEnabled && flat.lockForUpdate.length === 0,
    order: flat.order, totals: flat.totals, builder: flat.builder, indexing: flat.indexing, comments: flat.comments,
  };
}

/**
 * Обратное преобразование `buildModelFromFlat`: модель → плоский SavedQuery.
 * Поля-опционалы заполняются теми же пустыми значениями, что и в `restoreSaved`.
 */
export function modelToFlat(model: QueryModel): SavedQuery {
  return {
    selectedTables: model.tables, selectedFields: model.fields, tabSectionFields: model.tabSectionFields ?? [],
    grouping: model.grouping ?? { multiple: false, groupFields: [], groupSets: [], aggregates: [] },
    conditions: model.conditions ?? [], joins: model.joins ?? [], selection: model.selection ?? {},
    queryType: model.queryType ?? 'select', tempTableName: model.tempTableName ?? '', lockForUpdate: model.lockForUpdate ?? [],
    lockEnabled: (model.lockForUpdate?.length ?? 0) > 0 || !!model.lockForUpdateBare,
    order: model.order ?? { fields: [], auto: false }, totals: model.totals ?? { groupFields: [], totalFields: [], grand: false },
    builder: model.builder ?? emptyBuilder(), indexing: model.indexing ?? { indexes: [] }, comments: model.comments,
  };
}

/** Снимок документа объединения из распарсенного QueryDocument. */
export function docToSnapshot(doc: QueryDocument): BatchSnapshot {
  return { queryList: doc.members.map(m => ({ name: m.name, distinct: m.distinct })), activeQuery: 0, savedQueries: doc.members.map(m => modelToFlat(m.model)) };
}

/** Собрать участников объединения из active working set и сохранённых снимков. */
export function assembleMembers(state: QueryState): UnionMember[] {
  return state.queryList.map((meta, i) => {
    const saved = i === state.activeQuery ? snapshotActive(state) : state.savedQueries[i];
    const flat = saved ?? snapshotActive(state);
    return { name: meta.name, distinct: meta.distinct, model: buildModelFromFlat(flat) };
  });
}

/** Собрать текущий документ объединения в снимок пакета. */
export function snapshotActiveBatch(state: QueryState): BatchSnapshot {
  const savedQueries = state.queryList.map((_, i) => i === state.activeQuery ? snapshotActive(state) : (state.savedQueries[i] ?? snapshotActive(state)));
  return { queryList: state.queryList, activeQuery: state.activeQuery, savedQueries };
}

/** Восстановить документ объединения из снимка пакета или пустого состояния. */
export function restoreBatch(state: QueryState, snap: BatchSnapshot | null): Partial<QueryState> {
  if (snap === null) return { queryList: [{ name: 'Запрос 1', distinct: false }], activeQuery: 0, savedQueries: [null], ...restoreSaved(state, null) };
  const savedQueries: (SavedQuery | null)[] = snap.savedQueries.slice();
  savedQueries[snap.activeQuery] = null;
  return { queryList: snap.queryList, activeQuery: snap.activeQuery, savedQueries, ...restoreSaved(state, snap.savedQueries[snap.activeQuery]) };
}

/**
 * Сводка запроса пакета для бокової смуги вкладок (`ConstructorView.tsx`'s
 * `sideTabsStrip`) — ім'я + все, що можна показати в підказці без нового
 * обчислення: тип, назви вибраних полів, кількість джерел/умов і кількість
 * учасників ОБЪЕДИНЕНИЯ. Усі значення — з ПЕРШОГО учасника документа, тим
 * самим принципом, що й саме ім'я нижче (див. коментар `batchMemberName`).
 */
export interface BatchMemberInfo {
  name: string;
  queryType: QueryType;
  /** Назви вибраних полів (алиас/вираз/останній сегмент шляху) — не лише к-сть. */
  fieldNames: string[];
  tablesCount: number;
  conditionsCount: number;
  /** Кількість учасників ОБЪЕДИНЕНИЯ в цьому запиті пакета (>1, якщо є). */
  memberCount: number;
}

export function batchMemberInfo(state: QueryState, i: number): BatchMemberInfo {
  const isActive = i === state.activeBatch;
  const first = isActive
    ? (state.activeQuery === 0 ? snapshotActive(state) : state.savedQueries[0]!)
    : state.batchSaved[i]!.savedQueries[0];
  const memberCount = isActive ? state.queryList.length : state.batchSaved[i]!.queryList.length;
  // Пряме читання з `SavedQuery` (не через `buildModelFromFlat`): усі поля тут
  // обов'язкові (на відміну від опціональних `QueryModel.queryType`/`.conditions`,
  // призначених для інших сценаріїв), тож зайвого приведення типів не треба.
  const name = (first.queryType === 'createTemp' || first.queryType === 'appendTemp') && first.tempTableName
    ? first.tempTableName
    : first.queryType === 'dropTemp'
      ? `- ${first.tempTableName}`
      : `Запрос пакета ${i + 1}`;
  return {
    name,
    queryType: first.queryType,
    fieldNames: first.selectedFields.map(f => fieldAlias(f)),
    tablesCount: first.selectedTables.length,
    conditionsCount: first.conditions.length,
    memberCount,
  };
}

/** Производное имя запроса пакета по первому участнику объединения его документа. */
export function batchMemberName(state: QueryState, i: number): string {
  return batchMemberInfo(state, i).name;
}

/**
 * UNION + temp-table semantic audit (2026-09-20): `ПОМЕСТИТЬ`/`ДОБАВИТЬ` has
 * exactly ONE grammatical slot in 1C SDBL (immediately after the field list,
 * before `ИЗ`; `ОБЪЕДИНИТЬ` is a LATER clause of that same statement — see
 * `docs/development/query-model.md`). `queryType`/`tempTableName` therefore
 * belong to the compound query/UNION document as a whole, not to whichever
 * member happens to be active. Member 0 is the physical storage location
 * (an implementation detail — it's the only member the generator is allowed
 * to render `ПОМЕСТИТЬ`/`ДОБАВИТЬ` from), but UI/reducer callers should read
 * through these accessors rather than `state.queryType`/`state.tempTableName`
 * directly, so the "member 0 carries it" detail doesn't leak into call sites.
 */
export function compoundQueryType(state: QueryState): QueryType {
  if (state.activeQuery === 0) return state.queryType;
  return state.savedQueries[0]?.queryType ?? 'select';
}

export function compoundTempTableName(state: QueryState): string {
  if (state.activeQuery === 0) return state.tempTableName;
  return state.savedQueries[0]?.tempTableName ?? '';
}

/**
 * Одне "життя" тимчасової таблиці в межах пакета: відкривається `createTemp`,
 * накопичує `appendTemp`, і може закриватися `dropTemp`. Ціле ім'я (упер-кейс)
 * може мати КІЛЬКА lifetimes по черзі (create → drop → create знову) —
 * кожен `createTemp` завжди починає НОВИЙ lifetime, незалежно від того, чи
 * попередній був закритий дропом (це відповідає реальній 1С-семантиці:
 * ПОМЕСТИТЬ завжди створює таблицю заново).
 */
interface TempTableLifetime {
  name: string; // канонічне ім'я, як його написав create (case, як є)
  createIndex: number;
  appendIndices: number[];
  dropIndex: number | null;
  fields: MetaField[]; // колонки з CREATE-учасника (ДОБАВИТЬ не змінює структуру)
}

/**
 * UNION + temp-table lifecycle audit (2026-09-20): спільний внутрішній stateу
 * machine, яким тепер користуються І `availableTempTables`, І
 * `derivePackageTempTableContinuity` — щоб не мати дві subtly different
 * реалізації одного й того самого поняття "коли ВТ доступна". Виводить усі
 * lifetimes ПО ВСЬОМУ пакету за один прохід у порядку пакета:
 * - `createTemp X` --- ЗАВЖДИ відкриває НОВИЙ lifetime для X (навіть якщо
 *   попередній ще не закритий дропом --- це вже помилковий пакет із погляду
 *   1С (runtime error "ВТ вже існує"), ми не намагаємось вигадати для нього
 *   особливу семантику, лише не падаємо: новий lifetime просто затінює
 *   попередній для всіх позицій ПІСЛЯ другого create, що є найбезпечнішим
 *   "останній виграє" резолвом, а не крашем чи мовчазним ігноруванням);
 * - `appendTemp X` --- додається до lifetime X, що є ВІДКРИТИМ на цій
 *   позиції (за версією `openLifetimeAt` нижче); якщо жодного відкритого
 *   lifetime немає (`ДОБАВИТЬ` без попереднього `ПОМЕСТИТЬ` в цьому пакеті)
 *   --- запис про сам append-член все одно повертається викликачами (це факт
 *   про сам член), але без прив'язки до жодного lifetime;
 * - `dropTemp X` --- закриває ВІДКРИТИЙ на цій позиції lifetime X; якщо
 *   такого немає (`УНИЧТОЖИТЬ` без існуючої ВТ) --- так само, немає
 *   прив'язки, але сам факт "цей член дропає X" не губиться.
 * Ці два "no active lifetime" випадки НЕ отримали вигаданої семантики
 * (свідомо, за прямою вказівкою) --- лише не крашать і не тихо ігнорують сам
 * факт ролі члена.
 */
function deriveTempTableLifetimes(members: QueryDocument[]): Map<string, TempTableLifetime[]> {
  const byName = new Map<string, TempTableLifetime[]>();

  function openLifetimeAt(upper: string, atIndex: number): TempTableLifetime | undefined {
    const list = byName.get(upper);
    if (!list) return undefined;
    // Останній (найновіший) lifetime, що вже відкрився ДО atIndex і ще не
    // закритий ДО atIndex (dropIndex null, або dropIndex >= atIndex --- дроп
    // ще не "стався" з точки зору позиції atIndex).
    for (let k = list.length - 1; k >= 0; k--) {
      const lt = list[k];
      if (lt.createIndex < atIndex && (lt.dropIndex === null || lt.dropIndex >= atIndex)) return lt;
    }
    return undefined;
  }

  for (let i = 0; i < members.length; i++) {
    const carrier = compoundCarrierOf(members[i]);
    if (!carrier.tempTableName) continue;
    const upper = carrier.tempTableName.toUpperCase();

    if (carrier.queryType === 'createTemp') {
      const model = members[i].members[0]?.model;
      const cols: string[] = [];
      const seenCols = new Set<string>();
      for (const f of model?.fields ?? []) {
        const a = fieldAlias(f, model!);
        if (!a || a === '*') continue;
        let alias = a;
        let n = 0;
        while (seenCols.has(alias.toUpperCase())) alias = `${a}${++n}`;
        seenCols.add(alias.toUpperCase());
        cols.push(alias);
      }
      const lifetime: TempTableLifetime = {
        name: carrier.tempTableName,
        createIndex: i,
        appendIndices: [],
        dropIndex: null,
        fields: cols.map(c => ({ name: c, kind: 'attribute', types: [] })),
      };
      (byName.get(upper) ?? byName.set(upper, []).get(upper)!).push(lifetime);
    } else if (carrier.queryType === 'appendTemp') {
      openLifetimeAt(upper, i)?.appendIndices.push(i);
    } else if (carrier.queryType === 'dropTemp') {
      const lt = openLifetimeAt(upper, i);
      if (lt) lt.dropIndex = i;
    }
  }

  return byName;
}

/**
 * Доступные временные таблицы для активного запроса пакета: только те, чей
 * lifetime ОТКРЫТ на позиции активного запроса (создан раньше, и если был
 * `dropTemp` --- ещё не к этому моменту). ВТ не доступна своему создателю.
 * Колонки берутся из ТЕКУЩЕГО (открытого) lifetime, а не из первого
 * когда-либо встреченного create с этим именем (было исправлено в рамках
 * lifecycle audit 2026-09-20 --- см. `deriveTempTableLifetimes`).
 */
export function availableTempTables(state: QueryState): MetaTable[] {
  const batch = assembleBatch(state);
  const lifetimes = deriveTempTableLifetimes(batch.members);
  const out: MetaTable[] = [];
  for (const list of lifetimes.values()) {
    for (let k = list.length - 1; k >= 0; k--) {
      const lt = list[k];
      if (lt.createIndex < state.activeBatch && (lt.dropIndex === null || lt.dropIndex >= state.activeBatch)) {
        out.push({ kind: 'ВременнаяТаблица', name: lt.name, fullName: lt.name, fields: lt.fields });
        break; // лише найновіший відкритий lifetime для цього імені.
      }
    }
  }
  return out;
}

/**
 * PackageNav Quick Actions (2026-09-20): той самий набір, що й
 * `availableTempTables`, але з `createdAt` (package-member index, де
 * відкрився lifetime) --- потрібен ЛИШЕ для UI-підпису picker'а ("створена в
 * Запит N"), не для жодної нової domain-семантики. Окрема функція, а не
 * розширення сигнатури `availableTempTables` (щоб не ламати наявних
 * викликачів, яким `createdAt` не потрібен).
 */
export function availableTempTablesWithOrigin(state: QueryState): { table: MetaTable; createdAt: number }[] {
  const batch = assembleBatch(state);
  const lifetimes = deriveTempTableLifetimes(batch.members);
  const out: { table: MetaTable; createdAt: number }[] = [];
  for (const list of lifetimes.values()) {
    for (let k = list.length - 1; k >= 0; k--) {
      const lt = list[k];
      if (lt.createIndex < state.activeBatch && (lt.dropIndex === null || lt.dropIndex >= state.activeBatch)) {
        out.push({ table: { kind: 'ВременнаяТаблица', name: lt.name, fullName: lt.name, fields: lt.fields }, createdAt: lt.createIndex });
        break;
      }
    }
  }
  return out;
}

/**
 * Option B (metadata-resolution audit, 2026-09-20): чи є `fullName`
 * package-derived тимчасовою таблицею, ДОСТУПНОЮ на поточній позиції
 * (`state.activeBatch`) --- тобто ЧИТАЄТЬСЯ позиційно з реального
 * `createTemp`/`appendTemp` десь у пакеті, а НЕ manual/ad hoc записом у
 * `state.syntheticTables`. Використовується, щоб:
 * - `ADD_TEMP_TABLE` НЕ реєстрував ще один synthetic-запис і НЕ
 *   перейменовував `fullName` для вже відомої package-ВТ (self-join
 *   лишається можливим тим самим шляхом, що й `ADD_TABLE`);
 * - `UPDATE_TEMP_TABLE` не міг перезаписати структуру, якою насправді
 *   керує producer-lifetime, а не ручний редактор;
 * - UI ховав афорданс "редагувати структуру ВТ вручну" для такого джерела
 *   (структура ВТ похідна від реального `createTemp`, а не описується
 *   користувачем).
 */
export function isPackageTempTableName(state: QueryState, fullName: string): boolean {
  const upper = fullName.toUpperCase();
  return availableTempTables(state).some(t => t.fullName.toUpperCase() === upper);
}

/** Одна темп-таблична роль package-запиту в межах Phase 12B continuity. */
export interface PackageTempTableRelation {
  tempTableName: string;
  role: 'creates' | 'appends' | 'consumes' | 'drops';
  /**
   * Значення залежить від `role`:
   * - `creates`/`appends` --- package-члени, що СПОЖИВАЮТЬ саме ЦЕЙ lifetime
   *   (може бути порожньо --- ВТ, яку ніхто не використовує, це не помилка);
   * - `consumes` --- усі contributors (create+append) lifetime, з якого
   *   читає цей член (може бути декілька --- contributor chain);
   * - `drops` --- усі contributors (create+append) lifetime, який ЦЕЙ член
   *   закриває.
   */
  relatedMembers: number[];
  /**
   * Лише для `creates`/`appends`: індекс члена, що ЗАКРИВАЄ lifetime, до
   * якого належить ЦЕЙ contributor (якщо lifetime вже закритий дропом).
   * Окреме поле, а НЕ частина `relatedMembers` --- інакше тултип "Використовується:"
   * помилково перелічив би dropTemp-член як "споживача".
   */
  droppedBy?: number;
}

/**
 * Phase 12B --- похідна (не-збережена, не-domain) модель temp-table continuity
 * для `PackageNav`: для кожного package-члену --- список його ролей щодо
 * тимчасових таблиць пакета. Порожній масив/відсутність запису --- член не
 * бере участі, PackageNav не показує жодного маркера.
 *
 * Lifecycle audit (2026-09-20): і producer/consumer-резолюція, і сам dropTemp
 * тепер ідуть через СПІЛЬНИЙ `deriveTempTableLifetimes` (як і
 * `availableTempTables` вище) --- НЕ дві subtly different реалізації одного
 * поняття. `dropTemp` тепер теж отримує роль (`role: 'drops'`) і власний
 * маркер у PackageNav --- раніше він взагалі не був видимий у continuity.
 *
 * Contributor chain (як і раніше, тепер прив'язана до lifetime, а не до
 * "усіх creates/appends з таким іменем коли-небудь"): consumer, що йде
 * ПІСЛЯ ланцюжка `create → append → append → ...` для ВІДКРИТОГО на його
 * позиції lifetime, пов'язаний з УСІМА contributors цього lifetime.
 * Приклад повного циклу:
 * ```
 * Q1 create ВТ_A ─┐
 *                 ├─ Q3 consumes ВТ_A  (relatedMembers: [Q1, Q2])
 * Q2 append ВТ_A ─┘
 * Q4 drops ВТ_A      (relatedMembers: [Q1, Q2]; Q1/Q2 отримують droppedBy: Q4)
 * Q5 create ВТ_A     (новий, незалежний lifetime)
 * Q6 consumes ВТ_A   (relatedMembers: [Q5] --- НЕ [Q1, Q2])
 * ```
 * Інші правила без змін: споживання шукається по ВСІХ UNION-членах
 * package-запиту (не лише member 0); package ordering (lifetime має бути
 * відкритий САМЕ на позиції члена, що його читає/дропає).
 */
export function derivePackageTempTableContinuity(state: QueryState): Map<number, PackageTempTableRelation[]> {
  const batch = assembleBatch(state);
  const members = batch.members;
  const lifetimes = deriveTempTableLifetimes(members);
  const result = new Map<number, PackageTempTableRelation[]>();

  // Зворотні індекси: member -> роль (create/append/drop) + який lifetime.
  const memberRole = new Map<number, { role: 'creates' | 'appends' | 'drops'; lifetime: TempTableLifetime }>();
  for (const list of lifetimes.values()) {
    for (const lt of list) {
      memberRole.set(lt.createIndex, { role: 'creates', lifetime: lt });
      for (const a of lt.appendIndices) memberRole.set(a, { role: 'appends', lifetime: lt });
      if (lt.dropIndex !== null) memberRole.set(lt.dropIndex, { role: 'drops', lifetime: lt });
    }
  }

  function contributorsOf(lt: TempTableLifetime): number[] {
    return [lt.createIndex, ...lt.appendIndices].sort((a, b) => a - b);
  }

  const consumersByContributor = new Map<number, Set<number>>();
  const consumedByMember = new Map<number, { name: string; producedBy: number[] }[]>();
  for (let i = 0; i < members.length; i++) {
    const seenForThisMember = new Set<string>();
    for (const um of members[i].members) {
      for (const tbl of um.model.tables) {
        const upper = tbl.fullName.toUpperCase();
        if (seenForThisMember.has(upper)) continue;
        const list = lifetimes.get(upper);
        if (!list) continue;
        let openLt: TempTableLifetime | undefined;
        for (let k = list.length - 1; k >= 0; k--) {
          const lt = list[k];
          if (lt.createIndex < i && (lt.dropIndex === null || lt.dropIndex >= i)) { openLt = lt; break; }
        }
        if (!openLt) continue;
        seenForThisMember.add(upper);
        // `deriveTempTableLifetimes` будує lifetime цілком (з УСІМА appends,
        // включно з тими, що йдуть ПІСЛЯ позиції i) за один прохід ДО цього
        // циклу — тому тут явно відсікаємо contributors, що ще не сталися
        // на позиції i (package ordering для самого contributor chain, а не
        // лише для "чи lifetime відкритий").
        const contributors = contributorsOf(openLt).filter(c => c < i);
        (consumedByMember.get(i) ?? consumedByMember.set(i, []).get(i)!).push({ name: openLt.name, producedBy: contributors });
        for (const c of contributors) {
          if (!consumersByContributor.has(c)) consumersByContributor.set(c, new Set());
          consumersByContributor.get(c)!.add(i);
        }
      }
    }
  }

  for (let i = 0; i < members.length; i++) {
    const relations: PackageTempTableRelation[] = [];
    const own = memberRole.get(i);
    if (own && (own.role === 'creates' || own.role === 'appends')) {
      const consumers = Array.from(consumersByContributor.get(i) ?? []).sort((a, b) => a - b);
      relations.push({
        tempTableName: own.lifetime.name,
        role: own.role,
        relatedMembers: consumers,
        droppedBy: own.lifetime.dropIndex ?? undefined,
      });
    } else if (own && own.role === 'drops') {
      relations.push({ tempTableName: own.lifetime.name, role: 'drops', relatedMembers: contributorsOf(own.lifetime) });
    }
    for (const c of consumedByMember.get(i) ?? []) {
      relations.push({ tempTableName: c.name, role: 'consumes', relatedMembers: c.producedBy });
    }
    if (relations.length > 0) result.set(i, relations);
  }
  return result;
}

/** Собрать пакет: активный документ из live-состояния, остальные из снимков. */
export function assembleBatch(state: QueryState): BatchDocument {
  return {
    members: state.batchSaved.map((snap, i) => {
      if (i === state.activeBatch) return { members: assembleMembers(state) };
      const batch = snap!;
      return { members: batch.queryList.map((meta, j) => ({ name: meta.name, distinct: meta.distinct, model: buildModelFromFlat(batch.savedQueries[j]) })) };
    }),
  };
}

/** Вернуть копию пакета без комментариев для генерации канонического текста. */
export function stripBatchComments(batch: BatchDocument): BatchDocument {
  return {
    members: batch.members.map(doc => ({
      members: doc.members.map(m => {
        const { comments: _drop, ...modelRest } = m.model;
        void _drop;
        return { ...m, model: { ...modelRest, fields: stripFieldComments(modelRest.fields) } };
      }),
    })),
  };
}

export function stripFieldComments(fields: SelectedField[]): SelectedField[] {
  return fields.map(f => {
    if (f.commentLeading === undefined && f.commentTrailing === undefined) return f;
    const { commentLeading, commentTrailing, ...rest } = f;
    return rest;
  });
}
