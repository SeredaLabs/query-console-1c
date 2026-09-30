import type { MetaTable } from '../core/metadata/types';
import { accumPeriodFields } from '../core/query/accumVirtualFields';
import { defaultTableAlias, type SelectedTable } from '../core/query/queryModel';
import type { ExpressionSource } from './expressionEditor/expressionContext';

/** Preserve Classic's alias and virtual period-field context in every expression editor. */
export function expressionSources(selected: SelectedTable[], tables: MetaTable[]): ExpressionSource[] {
  return selected.flatMap(sel => {
    const meta = tables.find(m => m.fullName === sel.fullName);
    if (!meta) return [];
    const periodFields = meta.virtual && ['Обороты', 'ОборотыДтКт', 'ОстаткиИОбороты'].includes(meta.virtual.slice)
      ? accumPeriodFields(sel.virtual?.periodicity) : [];
    return [{ alias: defaultTableAlias(sel), meta: periodFields.length
      ? { ...meta, fields: [...periodFields, ...meta.fields] } : meta }];
  });
}
