/**
 * U3: with comma-separated FROM roots a join condition (`ПО`) sees only its own
 * join chain (СхемаЗапроса on SL_kza 8.3.15.1489,
 * `test/fixtures/platform/u3-comma-join-visibility.json`). Bare names in `ПО`
 * resolve within that chain: a name present in the chain and in another root
 * binds to the chain, a name only in another root is not bound to it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';

const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'u3-comma-join-visibility.json'), 'utf8'));
const field = (name: string, ref?: string) => ({ name, kind: 'attribute', types: ref ? [{ ref: { kind: 'Справочник', name: ref } }] : [{ primitive: 'Строка' }] });
/** The SL_kza shape of the two catalogs the fixture uses. */
const resolver = buildResolverFromTables([
  { kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты', fields: [field('Ссылка', 'Валюты'), field('Код'), field('Наименование'), field('Символ')] },
  { kind: 'Справочник', name: 'Контрагенты', fullName: 'Справочник.Контрагенты', fields: [field('Ссылка', 'Контрагенты'), field('Код'), field('Наименование'), field('ВалютаКонтрагента', 'Валюты')] },
] as MetaTable[]);
const onClause = (query: string, policy: 'analysis' | 'constructor') =>
  generateBatch(parseBatch(query, resolver, { wildcardPolicy: policy }), { wildcardPolicy: policy }).replace(/\s+/g, ' ').split(' ПО ')[1];
const byName = (name: string) => evidence.cases.find((c: { name: string }) => c.name === name);

describe('U3: bare names in ПО resolve within their own chain', () => {
  it.each(['analysis', 'constructor'] as const)('%s: a name in the chain and in another root binds to the chain, as on the platform', policy => {
    const c = byName('U3f_bare_field_in_chain_and_other_root');
    expect(onClause(c.query, policy)).toBe(c.platform.on);
  });

  it.each(['analysis', 'constructor'] as const)('%s: a name only in another root is not bound to it', policy => {
    for (const name of ['U3d_bare_field_only_in_other_root', 'U3e_bare_field_only_in_later_root']) {
      const c = byName(name);
      expect(c.platform.accepted).toBe(false);
      expect(onClause(c.query, policy)).not.toContain('Т1.Символ');
    }
  });

  it('the own-chain reference the platform accepts is unchanged', () => {
    const c = byName('U3c_on_refs_own_chain');
    expect(onClause(c.query, 'constructor')).toBe(c.platform.on);
  });
});
