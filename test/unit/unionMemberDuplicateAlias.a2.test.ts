/**
 * Duplicate explicit column names are platform-invalid in every UNION member
 * (СхемаЗапроса and execution: `Duplicate alias`, case-insensitive; fixture
 * `test/fixtures/platform/a2-duplicate-temp-columns.json`). The Designer refused
 * them only in member 0: in a later member the parser replaced the names with the
 * column names of member 0, so the query opened and Apply wrote a valid query in
 * place of the invalid one. Now every member is rejected alike.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { validateBatchText } from '../../src/core/query/validateBatch';

interface PlatformCase {
  name: string;
  query: string;
  constructor: { accepted: boolean; error?: { message: string } };
}
const evidence: { cases: PlatformCase[] } = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'platform', 'a2-duplicate-temp-columns.json'), 'utf8'));

describe('duplicate explicit names: the Designer follows the platform verdict', () => {
  it.each(evidence.cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const open = tryOpenDesignerBatch(c.query);
    expect(open.ok).toBe(c.constructor.accepted);
    if (!c.constructor.accepted) {
      const alias = /Duplicate alias "(.+)"/u.exec(c.constructor.error!.message)![1];
      expect(open.ok ? '' : open.error).toBe(`Повторяющийся псевдоним "${alias}"`);
      expect(validateBatchText(c.query)).toEqual({ ok: false, error: `Повторяющийся псевдоним "${alias}"` });
    }
  });

  it('a later member with distinct names still opens and keeps member-0 column names', () => {
    const open = tryOpenDesignerBatch('ВЫБРАТЬ 1 КАК Перв, 2 КАК Втор ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ 3 КАК Код, 4 КАК Другое');
    expect(open.ok).toBe(true);
    if (open.ok) expect(open.doc.members[0].members[1].model.fields.map(f => f.alias)).toEqual(['Перв', 'Втор']);
  });
});
