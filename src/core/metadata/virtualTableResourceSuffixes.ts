/**
 * Single source of truth for the resource-suffix expansion rules used when
 * building virtual-table output fields. Both metadata builders
 * (`yamlLoader.ts`'s `buildAccumRegSlices`, `accountingVirtualTables.ts`'s
 * `buildAccountingRegSlices`) AND the hover-side reverse lookup
 * (`virtualTableOutputField.ts`) import these same constants — so the two
 * directions (build the output field name / recover the base field it came
 * from) can never drift apart into two independently-maintained copies.
 */

/** Развёртка ресурса <R> по виду виртуальной таблицы регистра накопления (по эталону
 *  конструктора 1С): Остатки → <R>Остаток; Обороты(Balance) → <R>Оборот/Приход/Расход;
 *  Обороты(Turnovers) → <R>Оборот; ОстаткиИОбороты → 5 суффиксов. */
export const ACCUM_RESOURCE_SUFFIXES = {
  Остатки: ['Остаток'],
  ОборотыBalance: ['Оборот', 'Приход', 'Расход'],
  ОборотыTurnovers: ['Оборот'],
  ОстаткиИОбороты: ['НачальныйОстаток', 'Оборот', 'Приход', 'Расход', 'КонечныйОстаток'],
} as const;

/** Регистр бухгалтерии — своя (не совпадающая с накоплением) раскладка суффиксов. */
export const ACCOUNTING_RESOURCE_SUFFIXES: Record<string, readonly string[]> = {
  Остатки: ['Остаток', 'ОстатокДт', 'ОстатокКт', 'РазвернутыйОстатокДт', 'РазвернутыйОстатокКт'],
  Обороты: ['Оборот', 'ОборотДт', 'ОборотКт'],
  ОборотыДтКт: ['Оборот'],
  ОстаткиИОбороты: [
    'НачальныйОстаток', 'НачальныйОстатокДт', 'НачальныйОстатокКт',
    'НачальныйРазвернутыйОстатокДт', 'НачальныйРазвернутыйОстатокКт',
    'Оборот', 'ОборотДт', 'ОборотКт',
    'КонечныйОстаток', 'КонечныйОстатокДт', 'КонечныйОстатокКт',
    'КонечныйРазвернутыйОстатокДт', 'КонечныйРазвернутыйОстатокКт',
  ],
};
