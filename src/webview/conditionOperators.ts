import type { ConditionOperator } from '../core/query/queryModel';

/** Comparison operators offered for field conditions and join conditions — one
 * list for Classic (Conditions/Connections tabs) and Canvas (Conditions
 * workspace, join Inspector and join creation). */
export const CONDITION_OPERATORS: ConditionOperator[] = ['=', '<>', '>', '>=', '<', '<=', 'В', 'МЕЖДУ', 'ПОДОБНО'];
