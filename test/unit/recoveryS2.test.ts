/**
 * S2: editor assistance survives text that is being typed. Stage 0 recovery probes
 * C06/C13 (unclosed `(` in SELECT swallowed ИЗ), C11 (unclosed condition subquery)
 * and C18/C19 (broken ORDER/GROUP made the whole package unavailable). Recovery
 * feeds only the semantic snapshot (hover/completion); Apply never uses it.
 */
import { describe, it, expect } from 'vitest';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { resolveCompletionTarget } from '../../src/extension/hoverFieldInfo';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import {
  repairTrailingSectionsForRecovery,
  repairUnbalancedParensForRecovery,
} from '../../src/core/query/selectListRepair';
import type { MetaTable } from '../../src/core/metadata/types';

const T = (name: string, fields: string[]): MetaTable => ({
  kind: 'Справочник', name, fullName: `Справочник.${name}`,
  fields: fields.map(f => ({ name: f, kind: 'standard' as const, types: [{ primitive: 'Строка' as const }] })),
});
const resolver = buildResolverFromTables([T('Товары', ['Ссылка', 'Наименование', 'Контрагент']), T('Контрагенты', ['Ссылка', 'ИНН'])]);
const FROM = 'ИЗ\n\tСправочник.Товары КАК Т';

/** `¦` marks the cursor right after `<alias>.`; returns the completion table there. */
function completionAt(marked: string, alias: string): string | undefined {
  const pos = marked.indexOf('¦');
  const text = marked.replace('¦', '');
  return resolveCompletionTarget(text, resolver, [alias], pos - alias.length - 1)?.meta.fullName;
}

describe('S2: recovery while typing', () => {
  for (const [id, marked, alias, table] of [
    ['C18', `ВЫБРАТЬ\n\tТ.Ссылка\n${FROM}\nУПОРЯДОЧИТЬ ПО\n\tТ.¦ ,`, 'Т', 'Справочник.Товары'],
    ['C19', `ВЫБРАТЬ\n\tТ.Ссылка\n${FROM}\nСГРУППИРОВАТЬ ПО\n\tТ.¦ ,`, 'Т', 'Справочник.Товары'],
    ['C06', `ВЫБРАТЬ\n\tТ.Ссылка,\n\tПОДСТРОКА(Т.¦\n${FROM}`, 'Т', 'Справочник.Товары'],
    ['C13', `ВЫБРАТЬ\n\tТ.Ссылка,\n\t(Т.¦Наименование\n${FROM}`, 'Т', 'Справочник.Товары'],
    ['C11', `ВЫБРАТЬ\n\tТ.Ссылка\n${FROM}\nГДЕ\n\tТ.Контрагент В (ВЫБРАТЬ К.¦ ИЗ Справочник.Контрагенты КАК К`, 'К', 'Справочник.Контрагенты'],
    ['C11 outer', `ВЫБРАТЬ\n\tТ.Ссылка\n${FROM}\nГДЕ\n\tТ.Контрагент В (ВЫБРАТЬ Т.¦ ИЗ Справочник.Контрагенты КАК К`, 'Т', 'Справочник.Товары'],
  ]) {
    it(`${id}: completion after \`${alias}.\``, () => {
      expect(completionAt(marked, alias)).toBe(table);
      const snapshot = buildSemanticSnapshotFromText(1, marked.replace('¦', ''), resolver);
      expect(snapshot.completeness).toBe('recovered');
      expect(snapshot.sourceMapEvents.length).toBeGreaterThan(0);
    });
  }

  it('a broken ORDER BY in one statement keeps the other statements', () => {
    const text = `ВЫБРАТЬ Т.Ссылка ${FROM};\nВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К УПОРЯДОЧИТЬ ПО К. ,`;
    const snapshot = buildSemanticSnapshotFromText(1, text, resolver);
    expect(snapshot.completeness).toBe('recovered');
    expect(snapshot.model.members).toHaveLength(2);
  });

  it('valid text is still parsed as complete, including balanced parentheses', () => {
    const text = `ВЫБРАТЬ ПОДСТРОКА(Т.Наименование, 1, 2) КАК П ${FROM} ГДЕ Т.Контрагент В (ВЫБРАТЬ К.Ссылка ИЗ Справочник.Контрагенты КАК К) УПОРЯДОЧИТЬ ПО П`;
    expect(buildSemanticSnapshotFromText(1, text, resolver).completeness).toBe('complete');
    expect(repairUnbalancedParensForRecovery(text)).toBeUndefined();
  });

  it('repairs keep every original offset', () => {
    const order = `ВЫБРАТЬ Т.Ссылка ${FROM}\nУПОРЯДОЧИТЬ ПО\n\tТ. ,;\nВЫБРАТЬ 1`;
    const fixed = repairTrailingSectionsForRecovery(order)!;
    const at = order.indexOf('УПОРЯДОЧИТЬ');
    expect(fixed).toHaveLength(order.length);
    expect(fixed.slice(0, at)).toBe(order.slice(0, at));
    expect(fixed.slice(fixed.indexOf(';'))).toBe(';\nВЫБРАТЬ 1');
    expect(fixed).not.toContain('УПОРЯДОЧИТЬ');
    expect(fixed.slice(at, fixed.indexOf(';')).trim()).toBe('ДЛЯ ИЗМЕНЕНИЯ');
    expect(fixed.slice(0, fixed.indexOf(';')).endsWith('ДЛЯ ИЗМЕНЕНИЯ')).toBe(true);

    const parens = `ВЫБРАТЬ ПОДСТРОКА(Т.\n${FROM} ГДЕ Т.К В (ВЫБРАТЬ К.К ИЗ Справочник.К КАК К`;
    const closed = repairUnbalancedParensForRecovery(parens)!;
    expect(closed).toBe(parens.replace('ПОДСТРОКА(', 'ПОДСТРОКА ') + ')');
  });

  it('sections inside a subquery are not blanked', () => {
    const text = `ВЫБРАТЬ П.Ссылка ИЗ (ВЫБРАТЬ Т.Ссылка ${FROM} УПОРЯДОЧИТЬ ПО Т.Ссылка) КАК П УПОРЯДОЧИТЬ ПО П.`;
    const fixed = repairTrailingSectionsForRecovery(text)!;
    expect(fixed).toContain('УПОРЯДОЧИТЬ ПО Т.Ссылка)');
    const outer = text.lastIndexOf('УПОРЯДОЧИТЬ');
    expect(fixed).toBe(text.slice(0, outer) + ' '.repeat(text.length - outer - 'ДЛЯ ИЗМЕНЕНИЯ'.length) + 'ДЛЯ ИЗМЕНЕНИЯ');
  });
});
