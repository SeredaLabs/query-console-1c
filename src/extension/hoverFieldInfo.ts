/**
 * Чистый помощник для семантики поля запроса (`Alias.Field[.Field…]`) в исходнике
 * `.bsl` — общее ядро для hover (`queryHoverProvider.ts`) И автодополнения
 * (`queryCompletionProvider.ts`). Находит цепочку идентификаторов вокруг позиции
 * курсора (по СЫРОМУ тексту литерала запроса, тем же смещениям, что уже даёт
 * `queryAtCursor.ts`) и, если её голова — известный псевдоним источника, описывает
 * конкретный сегмент через `resolveFieldPath`.
 *
 * Модуль ДОЛЖЕН оставаться чистым (без `import vscode`) — как и `queryAtCursor.ts`;
 * связка с `vscode.HoverProvider`/`vscode.CompletionItemProvider` — отдельные
 * файлы (`queryHoverProvider.ts`, `queryCompletionProvider.ts`).
 *
 * Phase 3d/3e (semantic-core roadmap, memory: project-semantic-core-roadmap):
 * both `describeChain` (hover) and `resolveCompletionTarget` (autocomplete)
 * resolve the chain's HEAD alias via `resolveHeadTable`, which uses ONLY
 * `resolveAliasAt` (position-aware — respects real JOIN-condition scoping and
 * nearest-ancestor subquery correlation, live-verified against real 1C). A
 * non-`'resolved'` outcome (`'unknown'`/`'ambiguous'`) means NO answer for
 * that alias — an explicit product decision: a flat, whole-batch,
 * first-match guess risked confidently-WRONG answers in exactly the cases
 * (e.g. a right-nested JOIN's own inner condition, an alias reused across
 * UNION branches) this resolver exists to fix. The old flat lookup is no
 * longer used in production; a frozen copy lives in
 * `tooling/corpus-verify/legacyFindAliasTable.ts` solely as the corpus
 * shadow-mode baseline.
 */
import type { MetadataResolver } from '../core/query/metadataResolver';
import type { MetaTable } from '../core/metadata/types';
import type { SelectedTable } from '../core/query/queryModel';
import { resolveFieldPath, type FieldPathResolution } from '../core/query/fieldPathResolver';
import { buildSemanticSnapshotFromText } from '../core/semantic/buildSemanticSnapshot';
import { resolveAliasAt } from '../core/semantic/resolveAliasAt';
import { hasTrustworthyPositions } from '../core/semantic/semanticSnapshot';
import { resolveSymbolTable } from '../core/semantic/collectSymbols';
import { isOutputAliasReference } from '../core/semantic/resolveOutputAliasReference';
import { describeVirtualTableArgAt, type VirtualTableArgDescription } from '../core/semantic/describeVirtualTableArg';
import { keywordValuesForRole, type VirtualParamRole } from '../core/metadata/virtualTableSignatures';
import { describeVirtualTableOutputField, type VirtualTableOutputFieldInfo } from '../core/metadata/virtualTableOutputField';
import { deriveTempTableLifetimes, visibleTempTableAt } from '../core/query/tempTableSemantics';

// The chain finders are pure text helpers shared with the Classic expression
// editor webview, so they live in core; re-exported to keep this module's API.
export { findChainAt, findChainForCompletion, type FieldChainSegment } from '../core/query/fieldChain';

export interface ChainDescription {
  /** Полное имя метаданных таблицы, на которую ссылается голова цепочки —
   * `undefined`, если псевдоним не найден или таблица не резолвится по метаданным
   * (параметр `&Имя`, подзапрос, неизвестная/неполная ВТ, пробел в метаданных —
   * unknown != invalid). */
  tableFullName?: string;
  /** Резолюция сегментов ПОСЛЕ головы через `resolveFieldPath` — `undefined`, если
   * таблица головы не резолвится (см. выше) или цепочка состоит из одной головы. */
  resolution?: FieldPathResolution;
  /**
   * Set only when the head resolves to a virtual-table source AND the FIRST
   * segment after it is a resource field this project's own metadata
   * builders expanded from a real base-register resource (see
   * `virtualTableOutputField.ts`) — hover enrichment naming which base field
   * it represents. `undefined` for every other case: dimensions/attributes
   * pass through unchanged and already show correct info from the virtual
   * table's own metadata with no enrichment needed; регистр бухгалтерии's
   * synthesized fields (Счет, СубконтоN, etc.) have no base field to map
   * back to at all.
   */
  virtualTableField?: VirtualTableOutputFieldInfo;
}

/**
 * Резолвить ГОЛОВУ ланцюжка (`alias`) до її таблиці — спільне ядро для
 * `describeChain` і `resolveCompletionTarget` (Phase 3d/3e).
 *
 * Коли снепшот має надійні позиції (`hasTrustworthyPositions`: повністю
 * розбираний запит, АБО `'recovered'` зі зламаним SELECT-списком, чий ремонт
 * зберіг зміщення) І `headPosition` відомий — резолвить позиційно-
 * усвідомлений `resolveAliasAt`; будь-який результат, крім `'resolved'`
 * (`'unknown'`/`'ambiguous'`), означає `undefined` — свідоме продуктове
 * рішення НЕ підстраховуватись старим плоским пошуком у цьому випадку, бо це
 * ризикувало б повернути підтверджено НЕПРАВИЛЬНУ відповідь саме в тих
 * випадках (право-вкладений JOIN тощо), заради яких цей резолвер і будувався.
 *
 * Курсор усередині заміненого SELECT-списку при цьому не проблема: заглушка
 * тієї ж довжини лишає його в межах діапазону того самого учасника
 * `ОБЪЕДИНЕНИЯ`, тож область видимості визначається правильно — саме це
 * захищає від реального продакшн-регресу v0.1.33 (пропущена кома ламала весь
 * SELECT).
 *
 * Інакше — `undefined` (unknown != invalid). Це `'unavailable'` (запит не
 * розбирається навіть після ремонту — колишній плаский пошук робив той самий
 * розбір і теж нічого не знаходив) або невідомий `headPosition` (для символу
 * ідентифікатора `rawOffsetToQueryTextOffset` його завжди дає).
 */
function resolveHeadTable(
  queryText: string,
  resolver: MetadataResolver,
  alias: string,
  headPosition: number | undefined,
): { table: SelectedTable; meta: MetaTable | undefined } | undefined {
  const snapshot = buildSemanticSnapshotFromText(1, queryText, resolver);
  if (!hasTrustworthyPositions(snapshot) || headPosition === undefined) return undefined;

  // Phase 2x-1: a bare identifier inside УПОРЯДОЧИТЬ/ИТОГИ can name a
  // SELECT-output column, not a source alias at all — resolving it as one
  // would risk a confident, WRONG answer if the name happens to collide
  // with a real table alias elsewhere in the query.
  if (isOutputAliasReference(snapshot, headPosition, alias)) return undefined;
  const resolution = resolveAliasAt(snapshot, headPosition, alias);
  if (resolution.kind !== 'resolved') return undefined;
  const table = resolveSymbolTable(snapshot.model, resolution.value.ref.path);
  // Підзапит (fullName === '') і параметр-джерело (`&Имя`) — не справжня
  // таблиця метаданих, unknown.
  if (!table || !table.fullName || table.fullName.startsWith('&')) return undefined;
  // A virtual-table source (`ИЗ РегистрНакопления.Х.Остатки(...) КАК Т`) is
  // NEVER in `tableByFullName` — `buildResolverFromTables` deliberately
  // keeps virtual tables in a separate map (`virtualTableByFullName`), real
  // tables take priority on a name collision. Without this fallback, hover/
  // completion on ANY field of a virtual-table alias (`Т.КоличествоОстаток`)
  // silently showed nothing at all — not wrong, just always empty — since
  // `meta` came back `undefined` for every virtual source, regardless of
  // this roadmap's other work. Long-standing gap, not a regression from any
  // specific phase.
  let meta = resolver.tableByFullName(table.fullName) ?? resolver.virtualTableByFullName?.(table.fullName);
  // Output columns are trustworthy only for a fully parsed snapshot. A
  // recovered snapshot deliberately replaces broken SELECT lists with
  // placeholders, so deriving a temp schema from it would look plausible but
  // be wrong. The source alias itself may still resolve above; only field
  // metadata stays fail-open in that case.
  if (!meta && snapshot.completeness === 'complete') {
    const batchSegment = resolution.value.ref.path.find(segment => segment.kind === 'batch');
    if (batchSegment?.kind === 'batch') {
      const temp = visibleTempTableAt(
        deriveTempTableLifetimes(snapshot.model),
        batchSegment.index,
        table.fullName,
      );
      // Incomplete output (most importantly an unresolved `*`) is not a safe
      // completion set and cannot support negative field conclusions.
      if (temp?.complete) meta = temp.table;
    }
  }
  return { table, meta };
}

function describeViaTable(
  table: { fullName: string },
  meta: MetaTable | undefined,
  chain: string[],
  resolver: MetadataResolver,
): ChainDescription {
  if (!meta) return { tableFullName: table.fullName };
  if (chain.length === 1) return { tableFullName: meta.fullName };
  const resolution = resolveFieldPath(meta, chain.slice(1), resolver);
  let virtualTableField: VirtualTableOutputFieldInfo | undefined;
  if (meta.virtual && resolution.resolved.length > 0) {
    const baseMeta = resolver.tableByFullName(meta.virtual.baseFullName);
    if (baseMeta) virtualTableField = describeVirtualTableOutputField(meta.kind, baseMeta, resolution.resolved[0].field.name);
  }
  return { tableFullName: meta.fullName, resolution, virtualTableField };
}

/**
 * Разбирает `queryText` (уже реконструированный из BSL-литерала, БЕЗ `|`-префиксов
 * — см. `queryAtCursor.ts`'s `unpipe`) и описывает `chain` (текстовые сегменты,
 * `chain[0]` — предполагаемый псевдоним источника).
 *
 * `headPosition` — смещение головы `chain[0]` В КООРДИНАТАХ `queryText` (не
 * сырого документа — см. `queryAtCursor.ts`'s `rawOffsetToQueryTextOffset` для
 * перевода).
 */
export function describeChain(
  queryText: string,
  resolver: MetadataResolver,
  chain: string[],
  headPosition: number | undefined,
): ChainDescription {
  if (chain.length === 0) return {};
  const found = resolveHeadTable(queryText, resolver, chain[0], headPosition);
  if (!found) return {};
  return describeViaTable(found.table, found.meta, chain, resolver);
}

/**
 * Phase 2x-2: describes the virtual-table positional argument at `position`
 * (in `queryText` coordinates — same as `describeChain`'s `headPosition`),
 * e.g. "this is the `Период` parameter of `РегистрНакопления.Продажи.Остатки`".
 *
 * Deliberately a SEPARATE entry point from `describeChain`/`findChainAt`: an
 * argument can be `&Параметр` (lexed as a distinct `'param'` token, never an
 * identifier chain `findChainAt` would even find) or a whole condition
 * expression (`Регистратор = &Регистратор`) — there is no head alias to
 * resolve here at all, just a raw text position inside a known argument slot.
 * `undefined` — fail-open (unknown != invalid) — whenever
 * `describeVirtualTableArgAt` can't say (see its own doc).
 */
export function describeVirtualTableArg(
  queryText: string,
  resolver: MetadataResolver,
  position: number,
): VirtualTableArgDescription | undefined {
  const snapshot = buildSemanticSnapshotFromText(1, queryText, resolver);
  const result = describeVirtualTableArgAt(snapshot, position);
  return result.kind === 'resolved' ? result.value : undefined;
}

/**
 * Phase 2x-2, increment 3: the fixed keyword values for a virtual-table
 * argument at `position`, when (and only when) that argument's role is
 * `Периодичность`/`МетодДополнения` (`keywordValuesForRole` — the only two
 * roles backed by a closed enum, not a field/value/condition expression).
 * `undefined` — fail-open — for every other role, or when `position` isn't
 * inside a virtual-table argument at all.
 */
export function virtualTableArgKeywordValues(
  queryText: string,
  resolver: MetadataResolver,
  position: number,
): readonly string[] | undefined {
  const snapshot = buildSemanticSnapshotFromText(1, queryText, resolver);
  const result = describeVirtualTableArgAt(snapshot, position);
  if (result.kind !== 'resolved') return undefined;
  return keywordValuesForRole(result.value.param.role);
}

/**
 * Phase 2x-2, increment 2: roles whose argument text is an SDBL condition
 * expression evaluated against the REGISTER'S OWN fields (dimensions/
 * resources/attributes, unqualified — no alias prefix, confirmed against
 * Хрусталёва's book for every catalogued form) rather than a value list,
 * keyword, or array of field-name strings — those (`subconto*`, `order`/
 * `limit`, `mainDimensions`/`baseDimensions`/`sections`) are a genuinely
 * different shape, deliberately out of scope here (increments 3/4).
 */
const CONDITION_ROLES: ReadonlySet<VirtualParamRole> = new Set([
  'condition', 'accountCondition', 'accountConditionDt', 'accountConditionKt', 'corrAccountCondition',
]);

/**
 * `<Kind>.<Name>.<Slice>` → `<Kind>.<Name>` — the REAL register a virtual-table
 * slice was built from. 1C metadata names never contain a dot, so dropping the
 * last dotted segment is exact, not a heuristic (matches how
 * `virtualTableSignatures.ts` itself derives `registerKind`/`slice` from the
 * same three segments).
 */
function baseRegisterFullName(virtualTableFullName: string): string {
  return virtualTableFullName.split('.').slice(0, 2).join('.');
}

export interface VirtualTableConditionFieldChain {
  /** The REGISTER's own full name (not the virtual-table slice) — `Условие`
   *  fields are the register's raw fields, evaluated BEFORE the slice/output
   *  columns are computed (e.g. `Товар`, not `ТоварОстаток`). */
  registerFullName: string;
  resolution: FieldPathResolution;
}

/**
 * Phase 2x-2, increment 2: resolves `chain` (a bare identifier, or a chain
 * through a reference field — e.g. `Контрагент.ИНН`) found at `headPosition`
 * INSIDE a virtual-table `Условие`/`УсловиеСчета`/etc. argument, against the
 * underlying register's own metadata — NOT an alias lookup (there is no alias
 * here at all, unlike `describeChain`/`resolveHeadTable`: the identifier
 * names a field of the register directly, so the WHOLE chain — including
 * `chain[0]` — is fed to `resolveFieldPath`, not just the tail after a head).
 *
 * `undefined` — fail-open — whenever `headPosition` isn't inside a
 * condition-shaped virtual-table argument at all, or the register's own
 * metadata isn't available (`unknown != invalid`, matches every other check
 * in this module).
 */
export function describeVirtualTableConditionFieldChain(
  queryText: string,
  resolver: MetadataResolver,
  chain: string[],
  headPosition: number | undefined,
): VirtualTableConditionFieldChain | undefined {
  if (headPosition === undefined || chain.length === 0) return undefined;
  const snapshot = buildSemanticSnapshotFromText(1, queryText, resolver);
  const result = describeVirtualTableArgAt(snapshot, headPosition);
  if (result.kind !== 'resolved' || !CONDITION_ROLES.has(result.value.param.role)) return undefined;
  const registerFullName = baseRegisterFullName(result.value.tableFullName);
  const meta = resolver.tableByFullName(registerFullName);
  if (!meta) return undefined;
  return { registerFullName, resolution: resolveFieldPath(meta, chain, resolver) };
}

export interface CompletionTarget {
  /** Таблиця метаданих, чиї `.fields` треба запропонувати як варіанти
   * автодоповнення. */
  meta: MetaTable;
}

/**
 * Розбирає `queryText` і резолвить `prefixChain` (`prefixChain[0]` — псевдонім
 * джерела, решта — вже НАБРАНИЙ шлях по полях-посиланнях ДО сегмента, що зараз
 * вводиться, — див. `findChainForCompletion`) до таблиці метаданих, чиї поля
 * треба запропонувати. `undefined` — fail-open (unknown != invalid): псевдонім
 * не знайдено, метаданих немає, або шлях не резолвиться до кінця (частину
 * ланцюжка не вдалося пройти) — пропонувати ВГАДАНІ варіанти тут гірше, ніж не
 * запропонувати нічого.
 *
 * `headPosition` — те саме, що й у `describeChain` (Phase 3e): офсет голови
 * `prefixChain[0]` У КООРДИНАТАХ `queryText`, для позиційно-усвідомленого
 * `resolveAliasAt` через спільний `resolveHeadTable`.
 */
export function resolveCompletionTarget(
  queryText: string,
  resolver: MetadataResolver,
  prefixChain: string[],
  headPosition: number | undefined,
): CompletionTarget | undefined {
  if (prefixChain.length === 0) return undefined;
  const found = resolveHeadTable(queryText, resolver, prefixChain[0], headPosition);
  if (!found || !found.meta) return undefined;

  if (prefixChain.length === 1) return { meta: found.meta };

  const resolution = resolveFieldPath(found.meta, prefixChain.slice(1), resolver);
  if (resolution.unresolvedTail.length > 0) return undefined;
  const last = resolution.resolved[resolution.resolved.length - 1];
  if (!last || last.kind !== 'reference' || !last.refTarget) return undefined;
  return { meta: last.refTarget };
}
