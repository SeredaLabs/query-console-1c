/**
 * C30: names of the result columns of one select list, by the platform rule — the one
 * place the parser (stored `Поле{n}` / parameter / `…Представление` names), the
 * generator (`КАК` it prints), UNION headers, temp-table columns, hover and the
 * Designer read them from.
 *
 * Platform rule (СхемаЗапроса via `validate_query`, SL_kza 2026-10-12;
 * `test/fixtures/platform/c30-column-names.json`):
 *  - a fixed name (an explicit `КАК`, any case, also `Поле{n}`; or one the parser already
 *    stored) is reserved first;
 *  - every other column is named left to right and takes the smallest free suffix:
 *    a field path its segments joined (`synthesizedFieldAlias`; bare or qualified alike),
 *    an aggregate its operand the same way, a bare parameter its name, `ПРЕДСТАВЛЕНИЕ(…)` /
 *    `ПРЕДСТАВЛЕНИЕССЫЛКИ(…)` the path after the source alias joined + `Представление`
 *    (a tabular-section source drops a leading `Ссылка`), a tabular-section projection
 *    its name;
 *  - any other expression takes the next free `Поле{n}` (a `ПРЕДСТАВЛЕНИЕ` does not
 *    take a number).
 */
import type { QueryModel, SelectedField, SelectedTabSectionField } from './queryModel';
import { defaultTableAlias } from './queryModel';
import { synthesizedFieldAlias, qualifiedAutoAlias, isTabularSectionSource } from './queryModelUtils';
import { bareParamName, representationArgPath } from './exprAutoAlias';
import { isWildcardExpression } from './expandStarFields';

/** One select-list element in print order (see `orderedSelectElements`). */
export type NamedElement =
  | { kind: 'field'; field: SelectedField }
  | { kind: 'ts'; tsf: SelectedTabSectionField };

/**
 * The parser synthesized this field's name (it is not the user's `КАК`). Trusted only
 * while the name is still that one: a rename in the Designer makes it explicit.
 */
export function isSynthesizedAlias(f: SelectedField): boolean {
  return f.aliasSynthesized !== undefined && f.alias === f.aliasSynthesized;
}

/** A wildcard kept as written: it has no column name of its own. */
function isUnexpandedWildcard(f: SelectedField): boolean {
  return f.expression !== undefined && f.alias === undefined && isWildcardExpression(f.expression);
}

function representationName(model: QueryModel, segs: string[]): string {
  const head = segs[0].toUpperCase();
  const source = segs.length > 1 ? model.tables.find(t => defaultTableAlias(t).toUpperCase() === head) : undefined;
  // Without sources (a select list built in the UI) the head of a dotted path is taken
  // as the source alias, as it is in every qualified argument.
  const pathSegs = source || (segs.length > 1 && model.tables.length === 0) ? segs.slice(1) : segs;
  const owner = source ?? (model.tables.length === 1 ? model.tables[0] : undefined);
  return `${qualifiedAutoAlias(pathSegs.join('.'), isTabularSectionSource(owner))}Представление`;
}

/**
 * Column names aligned with `elements`; `undefined` for a wildcard kept as written
 * (its columns are not known here).
 */
export function columnNames(model: QueryModel, elements: readonly NamedElement[]): Array<string | undefined> {
  const taken = new Set<string>();
  for (const el of elements) {
    const fixed = el.kind === 'field' ? el.field.alias : el.tsf.alias;
    if (fixed !== undefined) taken.add(fixed.toUpperCase());
  }
  const free = (base: string): string => {
    let name = base;
    for (let k = 1; taken.has(name.toUpperCase()); k++) name = `${base}${k}`;
    taken.add(name.toUpperCase());
    return name;
  };
  let n = 0;
  return elements.map(el => {
    if (el.kind === 'ts') return el.tsf.alias ?? free(el.tsf.tsName);
    const f = el.field;
    if (f.alias !== undefined) return f.alias;
    if (f.expression !== undefined) {
      if (isUnexpandedWildcard(f)) return undefined;
      const param = bareParamName(f.expression);
      if (param !== undefined) return free(param);
      const segs = representationArgPath(f.expression);
      if (segs !== undefined) return free(representationName(model, segs));
      do n++; while (taken.has(`ПОЛЕ${n}`));
      taken.add(`ПОЛЕ${n}`);
      return `Поле${n}`;
    }
    // A field path or an aggregate over one (its operand, C30 P05/P14/P19).
    return free(synthesizedFieldAlias(model, f));
  });
}
