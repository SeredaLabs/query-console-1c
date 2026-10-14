import type { QueryModel, SelectedField, SelectedTabSectionField } from './queryModel';
import { deriveProjectionFacts, fieldAlias, type SelectElement } from './unionModel';
import { isStructurallyValidExpression } from './expressionSyntaxCheck';

/** Existing schema boundaries, not parser/generator wildcard policies (A2). */
export type ProducerColumnPolicy = 'parser-registry' | 'designer' | 'semantic';

export interface ProducerColumn {
  element: SelectElement;
  name: string;
}

/**
 * The model is the first UNION member, which owns the producer's result names.
 * These named compatibility policies retain the existing differences:
 * - registry: scalar output (head only for nested output), named columns, duplicates unchanged;
 * - Designer: same scalar scope, no unnamed stars, unique names;
 * - semantics: all outer elements, no unresolved stars, unique names.
 * Nested projections stay nested. Types and temp-table lifetimes are not inferred.
 */
export function deriveProducerColumns(model: QueryModel, policy: ProducerColumnPolicy): {
  columns: ProducerColumn[];
  /** Only the semantic policy establishes completeness for negative validation. */
  complete: boolean;
} {
  const facts = deriveProjectionFacts(model);
  // Match selectElementNames' object-identity semantics, including repeated model
  // references. Naming still reserves aliases across the entire select list.
  const names = new Map<SelectedField | SelectedTabSectionField, string>();
  for (const { element, outputName } of facts) {
    if (outputName !== undefined) names.set(element.kind === 'field' ? element.field : element.tsf, outputName);
  }
  // Wildcard expansion also uses trailingFields for scalar-only suffixes and
  // later sources. Only actual nested output retains the legacy head boundary.
  const elements: SelectElement[] = policy === 'semantic' || !model.tabSectionFields?.length
    ? facts.map(f => f.element)
    : model.fields.map(field => ({ kind: 'field', field }));
  const columns: ProducerColumn[] = [];
  const seen = new Set<string>();
  let complete = policy === 'semantic' && elements.length > 0;
  for (const element of elements) {
    const key = element.kind === 'field' ? element.field : element.tsf;
    const outputName = names.get(key);
    if ((policy === 'semantic' || (policy === 'designer' && outputName === undefined)) && element.kind === 'field' && (
      element.field.path === '*' || /(?:^|\.)\*$/u.test(element.field.expression?.trim() ?? '')
    )) {
      complete = false;
      continue;
    }
    const baseName = outputName ?? (policy === 'parser-registry' ? undefined
      : element.kind === 'field' ? fieldAlias(element.field, model) : (element.tsf.alias ?? element.tsf.tsName));
    if (baseName === undefined || (policy !== 'parser-registry' && (!baseName || baseName === '*'))) {
      complete = false;
      continue;
    }
    // Tolerant parsing may retain an unfinished expression with a valid name.
    // That name is useful, but it does not prove which columns are missing.
    if (policy === 'semantic' && element.kind === 'field' && element.field.expression !== undefined &&
        !isStructurallyValidExpression(element.field.expression)) complete = false;
    let name = baseName;
    if (policy !== 'parser-registry') {
      let suffix = 0;
      while (seen.has(name.toUpperCase())) name = `${baseName}${++suffix}`;
      seen.add(name.toUpperCase());
    }
    columns.push({ element, name });
  }
  return { columns, complete };
}
