/**
 * Direct tests for the frozen legacy flat alias lookup
 * (`tooling/corpus-verify/legacyFindAliasTable.ts`). Production no longer uses
 * it; these tests pin that the shadow-mode corpus baseline it provides stays
 * exactly the same algorithm.
 */
import { describe, it, expect } from 'vitest';
import { findAliasTable } from '../../tooling/corpus-verify/legacyFindAliasTable';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import * as path from 'path';

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));

describe('findAliasTable', () => {
  it('finds a simple single-source alias', () => {
    const found = findAliasTable('ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т', resolver, 'Т');
    expect(found?.table.fullName).toBe('Справочник.Валюты');
  });

  it('returns undefined for an alias that does not exist', () => {
    expect(findAliasTable('ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т', resolver, 'НетТакого')).toBeUndefined();
  });

  it('is position-blind (known limitation): finds an alias regardless of scope, even a right-nested JOIN\'s outer seed from inside the inner condition', () => {
    // Same fixture as resolveAliasAt.test.ts's right-nested case, where the
    // real 1C-verified answer is that Т1 is NOT visible from inside the inner
    // join's own condition — findAliasTable has no notion of position at all,
    // so it still "finds" Т1 flatly. This is exactly the divergence
    // shadow-mode exists to classify, not a bug in this function.
    const text =
      'ВЫБРАТЬ Т1.Код ИЗ Справочник.Валюты КАК Т1 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ (ВЫБРАТЬ 1 КАК Знач) КАК Т2 ' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Т3 ПО Знач = Т3.Код ' +
      'ПО Т1.Код = Т2.Знач';
    expect(findAliasTable(text, resolver, 'Т1')).toBeDefined();
  });

  it('recovers from a broken SELECT list (repairSelectListsForRecovery) to still resolve the alias', () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т'; // missing comma
    const found = findAliasTable(broken, resolver, 'Т');
    expect(found?.table.fullName).toBe('Справочник.Валюты');
  });

  it('returns undefined for a subquery source (not a real metadata table)', () => {
    const text = 'ВЫБРАТЬ Т.Поле ИЗ (ВЫБРАТЬ 1 КАК Поле) КАК Т';
    expect(findAliasTable(text, resolver, 'Т')).toBeUndefined();
  });
});
