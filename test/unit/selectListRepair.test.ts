/**
 * Direct tests for `repairSelectListsForRecovery`, moved from
 * `src/extension/hoverFieldInfo.ts` into `src/core/query` (Phase 1c of the
 * semantic-core roadmap, memory: project-semantic-core-roadmap) so the new
 * tolerant snapshot builder can reuse it. Previously only exercised indirectly
 * through `hoverFieldInfo.test.ts`'s `findAliasTable`/`describeChain` behavior;
 * this file tests the repair function itself, now that it's a public core export.
 */
import { describe, it, expect } from 'vitest';
import { repairSelectListsForRecovery } from '../../src/core/query/selectListRepair';
import { parseBatch } from '../../src/core/query/sdblParser';

describe('repairSelectListsForRecovery', () => {
  it('returns undefined when there is no top-level ВЫБРАТЬ to repair', () => {
    expect(repairSelectListsForRecovery('ГДЕ 1 = 1')).toBeUndefined();
  });

  it('replaces a broken field list with a trivial placeholder, keeping ИЗ intact', () => {
    const broken = 'ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т'; // missing comma
    const repaired = repairSelectListsForRecovery(broken);
    expect(repaired).toBeDefined();
    expect(repaired).toContain('ИЗ Справочник.Валюты КАК Т');
    // The repaired text must actually parse where the original didn't.
    expect(() => parseBatch(broken)).toThrow();
    expect(() => parseBatch(repaired!)).not.toThrow();
  });

  it('repairs EVERY top-level UNION member independently', () => {
    const broken =
      'ВЫБРАТЬ А.Поле1 А.Поле2 ИЗ Справочник.А КАК А ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ Б.Поле1 Б.Поле2 ИЗ Справочник.Б КАК Б';
    const repaired = repairSelectListsForRecovery(broken);
    expect(repaired).toBeDefined();
    const doc = parseBatch(repaired!);
    expect(doc.members[0].members).toHaveLength(2); // both UNION branches survived
  });

  it('does not repair a field list broken INSIDE a nested subquery (documented limitation)', () => {
    // Верхній рівень сам по собі коректний; лише вкладений підзапит зламаний
    // (пропущена кома). Функція все одно підміняє ЗОВНІШНІЙ список полів (вона
    // не перевіряє, чи він і так валідний — лише знаходить перший-ліпший
    // top-level ВЫБРАТЬ…ИЗ), але всередину дужок `(…)` не заходить — вкладений
    // зламаний список лишається незайманим, тож результат ВСЕ ОДНО не парситься.
    const broken = 'ВЫБРАТЬ Т.Поле ИЗ (ВЫБРАТЬ Б.Поле1 Б.Поле2 ИЗ Справочник.Б КАК Б) КАК Т';
    const repaired = repairSelectListsForRecovery(broken);
    expect(repaired).toBeDefined();
    expect(repaired).toContain('Б.Поле1 Б.Поле2'); // inner breakage untouched
    expect(() => parseBatch(repaired!)).toThrow();
  });

  it('leaves an already-valid query\'s ИЗ clause parseable after repair', () => {
    const broken = 'ВЫБРАТЬ Т.А Т.Б Т.В ИЗ Справочник.Валюты КАК Т ГДЕ Т.А = 1';
    const repaired = repairSelectListsForRecovery(broken)!;
    const doc = parseBatch(repaired);
    expect(doc.members[0].members[0].model.tables[0].alias).toBe('Т');
  });
});
