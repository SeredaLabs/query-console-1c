/**
 * Stage 1B.1 regression (docs/development/audits/stage-0.md, RP08): the ORDER BY
 * modifier grammar of the platform is `<field> [ИЕРАРХИЯ] [ВОЗР|УБЫВ]`. Live
 * 1C 8.3 accepts `ИЕРАРХИЯ УБЫВ` / `ИЕРАРХИЯ ВОЗР` and rejects the reversed
 * `УБЫВ ИЕРАРХИЯ` / `ВОЗР ИЕРАРХИЯ` with a syntax error, so the parser must
 * accept only the platform order and the generator must print `ИЕРАРХИЯ` before
 * the direction (previously it printed the platform-invalid `УБЫВ ИЕРАРХИЯ`).
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import type { MetadataResolver } from '../../src/core/query/metadataResolver';
import type { OrderField } from '../../src/core/query/queryModel';

const resolver = buildYamlResolver(path.resolve(__dirname, '../fixtures/corpus/metadata/cf'));
const MODES: Array<[string, MetadataResolver | undefined]> = [['without resolver', undefined], ['with resolver', resolver]];

const HEAD = 'ВЫБРАТЬ Г.Наименование КАК Наименование ИЗ Справочник.ИдентификаторыОбъектовМетаданных КАК Г УПОРЯДОЧИТЬ ПО ';
const CANONICAL_HEAD =
  'ВЫБРАТЬ\n\tГ.Наименование КАК Наименование\nИЗ\n\tСправочник.ИдентификаторыОбъектовМетаданных КАК Г\n\nУПОРЯДОЧИТЬ ПО\n\t';

const gen = (text: string, r?: MetadataResolver): string => generateBatch(parseBatch(text, r));
const firstOrderField = (text: string, r?: MetadataResolver): OrderField =>
  parseBatch(text, r).members[0].members[0].model.order!.fields[0];

describe.each(MODES)('ORDER BY hierarchy + direction (%s)', (_mode, r) => {
  // [modifiers as written, expected model, expected generated field line]
  const VALID: Array<[string, { direction: 'asc' | 'desc'; hierarchy: boolean }, string]> = [
    ['', { direction: 'asc', hierarchy: false }, 'Г.Ссылка'],
    [' ВОЗР', { direction: 'asc', hierarchy: false }, 'Г.Ссылка'],
    [' УБЫВ', { direction: 'desc', hierarchy: false }, 'Г.Ссылка УБЫВ'],
    [' ИЕРАРХИЯ', { direction: 'asc', hierarchy: true }, 'Г.Ссылка ИЕРАРХИЯ'],
    [' ИЕРАРХИЯ ВОЗР', { direction: 'asc', hierarchy: true }, 'Г.Ссылка ИЕРАРХИЯ'],
    [' ИЕРАРХИЯ УБЫВ', { direction: 'desc', hierarchy: true }, 'Г.Ссылка ИЕРАРХИЯ УБЫВ'],
  ];

  it.each(VALID)('field%s: parses into the model and generates the platform order', (mods, model, line) => {
    const f = firstOrderField(HEAD + 'Г.Ссылка' + mods, r);
    expect(f.direction).toBe(model.direction);
    expect(f.hierarchy === true).toBe(model.hierarchy);
    expect(gen(HEAD + 'Г.Ссылка' + mods, r)).toBe(CANONICAL_HEAD + line);
  });

  it.each(VALID)('field%s: parse → generate → parse → generate is stable', (mods) => {
    const once = gen(HEAD + 'Г.Ссылка' + mods, r);
    const twice = gen(once, r);
    expect(twice).toBe(once);
    const a = firstOrderField(HEAD + 'Г.Ссылка' + mods, r);
    const b = firstOrderField(once, r);
    expect({ d: b.direction, h: b.hierarchy === true }).toEqual({ d: a.direction, h: a.hierarchy === true });
  });

  it('model { hierarchy: true, direction: desc } generates `ИЕРАРХИЯ УБЫВ`, not `УБЫВ ИЕРАРХИЯ`', () => {
    // Build the combination on the model directly, independent of the parser's modifier order.
    const batch = parseBatch(HEAD + 'Г.Ссылка ИЕРАРХИЯ', r);
    const field = batch.members[0].members[0].model.order!.fields[0];
    field.direction = 'desc';
    const out = generateBatch(batch);
    expect(out).toContain('\tГ.Ссылка ИЕРАРХИЯ УБЫВ');
    expect(out).not.toMatch(/УБЫВ\s+ИЕРАРХИЯ/);
  });

  it.each([' УБЫВ ИЕРАРХИЯ', ' ВОЗР ИЕРАРХИЯ'])('platform-invalid reversed order `%s` is rejected', (mods) => {
    expect(() => parseBatch(HEAD + 'Г.Ссылка' + mods, r)).toThrow(/ИЕРАРХИЯ/);
  });

  it('several fields: modifiers bind per field in platform order', () => {
    const out = gen(HEAD + 'Г.Ссылка ИЕРАРХИЯ УБЫВ, Г.Наименование УБЫВ', r);
    expect(out).toBe(CANONICAL_HEAD + 'Г.Ссылка ИЕРАРХИЯ УБЫВ,\n\tГ.Наименование УБЫВ');
    expect(gen(out, r)).toBe(out);
  });
});
