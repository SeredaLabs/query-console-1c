/**
 * C2 slice 3: English metadata names. The platform accepts English kinds, virtual
 * tables and standard attributes and prints them in Russian; the parser stores a
 * source under its Russian full name, and field lookup finds a standard attribute
 * by its English name. Platform evidence: test/fixtures/platform/c2-english.json
 * (group `metadataNames`).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBatch } from '../../src/core/query/sdblParser';
import { canonicalTableName } from '../../src/core/query/sdblEnglish';
import { findField, resolveFieldPath } from '../../src/core/query/fieldPathResolver';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { resolveCompletionTarget } from '../../src/extension/hoverFieldInfo';
import type { MetaTable, MetaField } from '../../src/core/metadata/types';

const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'platform', 'c2-english.json'), 'utf8'));
type Case = { name: string; group: string; query: string; platform: { accepted: boolean; canonical?: string } };
const cases: Case[] = evidence.cases;

const sourceOf = (q: string): string => parseBatch(q).members[0].members[0].model.tables[0].fullName;

describe('C2: an English source is stored under its Russian full name', () => {
  // Every accepted platform case with an English kind: our full name is the one
  // the platform prints after `ИЗ`.
  const english = cases.filter(c => c.platform.accepted && /\bFROM\s+[A-Za-z]+\./.test(c.query) && !/\bFROM\s+&/.test(c.query));
  it.each(english.map(c => [c.name, c]))('%s', (_name, c: any) => {
    const printed = /ИЗ\s+([^\s(]+)/.exec(c.platform.canonical)![1];
    expect(sourceOf(c.query)).toBe(printed);
  });

  it('a configuration name or a tabular section that reads like a virtual table is kept', () => {
    expect(canonicalTableName('Document.X.Balance')).toBe('Документ.X.Balance');
    expect(canonicalTableName('Catalog.Balance')).toBe('Справочник.Balance');
    expect(canonicalTableName('Справочник.Валюты')).toBe('Справочник.Валюты');
    expect(canonicalTableName('TT')).toBe('TT');
    expect(canonicalTableName('Справочник.X.Turnovers')).toBe('Справочник.X.Turnovers');
  });

  it('virtual table parameters are laid out as for the Russian twin', () => {
    const en = parseBatch('SELECT T.* FROM AccumulationRegister.Р.Turnovers(&A, &B, Month, ) AS T').members[0].members[0].model.tables[0];
    const ru = parseBatch('ВЫБРАТЬ T.* ИЗ РегистрНакопления.Р.Обороты(&A, &B, Month, ) КАК T').members[0].members[0].model.tables[0];
    expect(en).toEqual(ru);
  });
});

describe('C2: an English standard attribute name finds the Russian field', () => {
  const field = (name: string, kind: MetaField['kind'] = 'standard'): MetaField => ({ name, kind, types: [] });
  const catalog: MetaTable = {
    kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
    fields: [field('Ссылка'), field('Код'), field('Наименование'), field('Code', 'attribute')],
  };

  it('standard fields by their English names', () => {
    expect(findField(catalog, 'Ref')?.name).toBe('Ссылка');
    expect(findField(catalog, 'description')?.name).toBe('Наименование');
  });

  it('a configuration attribute with the English name wins', () => {
    expect(findField(catalog, 'Code')?.name).toBe('Code');
  });

  it('`Type` is Вид or Тип, whichever the table has', () => {
    const journal: MetaTable = { kind: 'ЖурналДокументов', name: 'Ж', fullName: 'ЖурналДокументов.Ж', fields: [field('Тип')] };
    const accounts: MetaTable = { kind: 'ПланСчетов', name: 'П', fullName: 'ПланСчетов.П', fields: [field('Вид')] };
    expect(findField(journal, 'Type')?.name).toBe('Тип');
    expect(findField(accounts, 'Type')?.name).toBe('Вид');
  });

  it('a non-standard field is not matched by an English standard name', () => {
    const t: MetaTable = { kind: 'Справочник', name: 'X', fullName: 'Справочник.X', fields: [field('Код', 'attribute')] };
    expect(findField(t, 'Code')).toBeUndefined();
  });

  it('completion and field paths of an English query use the metadata', () => {
    const resolver = buildResolverFromTables([{
      kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
      fields: [{ name: 'Ссылка', kind: 'standard', types: [{ ref: { kind: 'Справочник', name: 'Валюты' } }] }, field('Код')],
    }] as MetaTable[]);
    const text = 'SELECT Cur.Code FROM Catalog.Валюты AS Cur';
    const target = resolveCompletionTarget(text, resolver, ['Cur'], text.indexOf('Cur.Code'));
    expect(target?.meta.fullName).toBe('Справочник.Валюты');
    const r = resolveFieldPath(target!.meta, ['Ref', 'Code'], resolver);
    expect(r.unresolvedTail).toEqual([]);
  });
});
