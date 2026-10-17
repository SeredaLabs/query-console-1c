/**
 * C24 (A2 closure audit): a temp table whose creator kept a wildcard has only part
 * of its columns registered. A later `ВЫБРАТЬ * ИЗ ВТ` must then either expand to
 * all the columns the platform returns or stay `*` — never to the known part only.
 * Platform: `test/fixtures/platform/a2-nested-projection-temp.json`, S2 (executed)
 * and S3 (СхемаЗапроса only): the temp table has `…, Маркер`.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';

const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'a2-nested-projection-temp.json'), 'utf8'));
const s2 = evidence.cases.find((c: { name: string }) => c.name === 'S2_scalar_after_nested_star');
const s3 = evidence.constructorOnlyCases.find((c: { name: string }) => c.name === 'S3_scalar_after_catalog_star');
const policies = ['preserve', 'analysis', 'constructor'] as const;

/** The consumer statement's select list: column paths, or `*` when kept. */
const consumer = (query: string, policy: typeof policies[number], resolver?: MetadataResolver): string[] =>
  parseBatch(query, resolver, { wildcardPolicy: policy }).members[1].members[0].model.fields.map(f => f.path || f.expression!);

describe('C24: a wildcard over a temp table with partly known columns', () => {
  it.each(policies)('%s: nested-SELECT creator (S2) — all platform columns or `*`', policy => {
    const out = consumer(s2.query, policy);
    expect([s2.executeColumns, ['*']]).toContainEqual(out);
  });

  it.each(policies)('%s: configuration-table creator without metadata (S3) — `*` kept', policy => {
    expect(consumer(s3.query, policy)).toEqual(['*']);
  });

  it('analysis with complete metadata (S3): the platform columns, in order', () => {
    const platform: string[] = s3.constructorColumns[s3.constructorColumns.length - 1];
    const resolver = buildResolverFromTables([{
      kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
      fields: platform.filter(n => n !== 'Маркер').map(name => ({ name, kind: 'attribute', types: [] })),
    }] as MetaTable[]);
    expect(consumer(s3.query, 'analysis', resolver)).toEqual(platform);
  });

  it.each(policies)('%s: a creator without a wildcard still expands', policy => {
    const query = 'ВЫБРАТЬ 1 КАК Код, 2 КАК Маркер ПОМЕСТИТЬ ВТ_A2б;\n\nВЫБРАТЬ * ИЗ ВТ_A2б КАК Б';
    expect(consumer(query, policy)).toEqual(['Код', 'Маркер']);
  });
});
