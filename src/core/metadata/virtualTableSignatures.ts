/**
 * Phase 2x-2 (semantic-core roadmap, memory: project-semantic-core-roadmap):
 * static catalog of virtual-table positional-argument signatures, verified
 * against Хрусталёва, «Язык запросов "1С:Предприятия 8"», 2-е изд. (page
 * cited per register kind below). Consumed by the hover feature to describe
 * "this is the `<role>` parameter of `<Table>.<Slice>`" for a cursor sitting
 * on a `virtualTableArg` source-map event (see `sourceMap.ts`) — this file
 * has no parsing/positioning logic of its own, only the static shape.
 *
 * Keyed by (register kind, slice) since the SAME slice name can have a
 * DIFFERENT arity between register kinds — e.g. `Остатки` is
 * `[Период, Условие]` for РегистрНакопления but
 * `[Период, УсловиеСчета, Субконто, Условие]` for РегистрБухгалтерии.
 */
import type { TableKind } from './types';

export type VirtualParamRole =
  | 'period' | 'periodStart' | 'periodEnd'
  | 'periodicity' | 'completionMethod'
  | 'condition'
  | 'accountCondition' | 'accountConditionDt' | 'accountConditionKt' | 'corrAccountCondition'
  | 'subconto' | 'subcontoDt' | 'subcontoKt' | 'corrSubconto'
  | 'order' | 'limit'
  | 'mainDimensions' | 'baseDimensions' | 'sections';

export interface VirtualTableParamSpec {
  /** Exact name as printed in the book/1C docs, e.g. "Период", "УсловиеСчетаДт". */
  name: string;
  role: VirtualParamRole;
}

export interface VirtualTableSignature {
  registerKind: 'РегистрСведений' | 'РегистрНакопления' | 'РегистрБухгалтерии' | 'РегистрРасчета';
  /** Exact slice name, or (регистр расчета only) the literal prefix `'База'` for `База<Имя>` forms. */
  slice: string;
  /** True only for the `База<ИмяБазовогоРегистра>` family — `slice` is a PREFIX match, not exact. */
  slicePrefix?: boolean;
  params: readonly VirtualTableParamSpec[];
}

const p = (name: string, role: VirtualParamRole): VirtualTableParamSpec => ({ name, role });

/** Catalog from `.claude/scratch_phase2x2_virtual_table_design.md` §1, literally. */
export const VIRTUAL_TABLE_SIGNATURES: readonly VirtualTableSignature[] = [
  // 1.1 РегистрСведений (p. 213-214)
  { registerKind: 'РегистрСведений', slice: 'СрезПоследних', params: [p('Период', 'period'), p('Условие', 'condition')] },
  { registerKind: 'РегистрСведений', slice: 'СрезПервых', params: [p('Период', 'period'), p('Условие', 'condition')] },

  // 1.2 РегистрНакопления (p. 234-264)
  { registerKind: 'РегистрНакопления', slice: 'Остатки', params: [p('Период', 'period'), p('Условие', 'condition')] },
  {
    registerKind: 'РегистрНакопления', slice: 'Обороты',
    params: [p('НачалоПериода', 'periodStart'), p('КонецПериода', 'periodEnd'), p('Периодичность', 'periodicity'), p('Условие', 'condition')],
  },
  {
    registerKind: 'РегистрНакопления', slice: 'ОстаткиИОбороты',
    params: [
      p('НачалоПериода', 'periodStart'), p('КонецПериода', 'periodEnd'), p('Периодичность', 'periodicity'),
      p('МетодДополнения', 'completionMethod'), p('Условие', 'condition'),
    ],
  },

  // 1.3 РегистрБухгалтерии (p. 278-315) — different arity from 1.2 even for same-named slices
  {
    registerKind: 'РегистрБухгалтерии', slice: 'Остатки',
    params: [p('Период', 'period'), p('УсловиеСчета', 'accountCondition'), p('Субконто', 'subconto'), p('Условие', 'condition')],
  },
  {
    registerKind: 'РегистрБухгалтерии', slice: 'Обороты',
    params: [
      p('НачалоПериода', 'periodStart'), p('КонецПериода', 'periodEnd'), p('Периодичность', 'periodicity'),
      p('УсловиеСчета', 'accountCondition'), p('Субконто', 'subconto'), p('Условие', 'condition'),
      p('УсловиеКорСчета', 'corrAccountCondition'), p('КорСубконто', 'corrSubconto'),
    ],
  },
  {
    registerKind: 'РегистрБухгалтерии', slice: 'ОборотыДтКт',
    params: [
      p('НачалоПериода', 'periodStart'), p('КонецПериода', 'periodEnd'), p('Периодичность', 'periodicity'),
      p('УсловиеСчетаДт', 'accountConditionDt'), p('СубконтоДт', 'subcontoDt'),
      p('УсловиеСчетаКт', 'accountConditionKt'), p('СубконтоКт', 'subcontoKt'), p('Условие', 'condition'),
    ],
  },
  {
    registerKind: 'РегистрБухгалтерии', slice: 'ОстаткиИОбороты',
    params: [
      p('НачалоПериода', 'periodStart'), p('КонецПериода', 'periodEnd'), p('Периодичность', 'periodicity'),
      p('МетодДополнения', 'completionMethod'), p('УсловиеСчета', 'accountCondition'), p('Субконто', 'subconto'), p('Условие', 'condition'),
    ],
  },
  {
    registerKind: 'РегистрБухгалтерии', slice: 'ДвиженияССубконто',
    params: [p('НачалоПериода', 'periodStart'), p('КонецПериода', 'periodEnd'), p('Условие', 'condition'), p('Порядок', 'order'), p('Первые', 'limit')],
  },

  // 1.4 РегистрРасчета (p. 327-334)
  { registerKind: 'РегистрРасчета', slice: 'ФактическийПериодДействия', params: [p('Условие', 'condition')] },
  { registerKind: 'РегистрРасчета', slice: 'ДанныеГрафика', params: [p('Условие', 'condition')] },
  {
    registerKind: 'РегистрРасчета', slice: 'База', slicePrefix: true,
    params: [
      p('ИзмеренияОсновногоРегистра', 'mainDimensions'), p('ИзмеренияБазовогоРегистра', 'baseDimensions'),
      p('Разрезы', 'sections'), p('Условие', 'condition'),
    ],
  },
];

/**
 * `slice` is the exact slice text as it appears in `SelectedTable.fullName`'s
 * 3rd dotted segment (e.g. `'СрезПоследних'`, `'БазаНачисленияБазовые'`) — the
 * `База<Имя>` family matches by prefix, everything else by exact equality.
 */
export function lookupVirtualTableSignature(
  registerKind: TableKind,
  slice: string,
): VirtualTableSignature | undefined {
  return VIRTUAL_TABLE_SIGNATURES.find((sig) =>
    sig.registerKind === registerKind && (sig.slicePrefix ? slice.startsWith(sig.slice) : slice === sig.slice)
  );
}
