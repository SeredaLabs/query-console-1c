/**
 * C29: column synthesis of the metadata parsers must match the fields the platform
 * exposes to queries. Platform evidence: СхемаЗапроса / `validate_query` and
 * `get_metadata_structure` on SL_kza (2026-10-11); 97 objects compared, all other
 * columns equal including common attributes and their order.
 *
 *  1. Every document has `Проведен`, also with `Posting = Deny` (platform: `Встреча`,
 *     `ДокументРасчетовСКонтрагентом`, `СогласованиеЗаказаМистШоп`), right after `Дата`.
 *  2. `ДатаОбмена` is not a query field of an exchange plan (platform: `Field not found`),
 *     although the XML lists the `ExchangeDate` standard attribute.
 *  3. A data-separator common attribute used `Auto` (AutoUse = Use) is a field only in
 *     exchange plans (platform: `Field not found` in every other kind). Explicit Use /
 *     DontUse and non-separator Auto are unchanged (no platform evidence to change them).
 *  4. A chart of accounts has `Порядок` after `Наименование` when `OrderLength > 0`
 *     (platform: `ПланСчетов.Хозрасчетный.Порядок`). The `OrderLength = 0` case follows
 *     the XML fixture (no `Порядок`); it is not yet confirmed on the platform.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describe, it, expect, afterEach } from 'vitest';
import { parseXml, firstElementChild } from '../../src/core/metadata/parser/dom';
import { parseDocument } from '../../src/core/metadata/parser/document';
import { parseExchangePlan } from '../../src/core/metadata/parser/exchangePlan';
import { parseChartOfAccounts } from '../../src/core/metadata/parser/chartOfAccounts';
import { parseCommonAttribute } from '../../src/core/metadata/parser/commonAttribute';
import { SNAPSHOT_FORMAT_VERSION } from '../../src/core/metadata/parser/snapshotBuilder';
import { loadMetadataSnapshotFirst } from '../../src/core/metadata/parser/loadMetadataSafe';
import { resolveManagedCfDir } from '../../src/core/metadata/parser/generationStore';

const NS = 'xmlns="http://v8.1c.ru/8.3/MDClasses" xmlns:xr="http://v8.1c.ru/8.3/xcf/readable"';
const objectEl = (xml: string): any => firstElementChild(parseXml(`<MetaDataObject ${NS}>${xml}</MetaDataObject>`)!.documentElement);
const fieldNames = (o: { fields: { name: string }[] } | null): string[] => (o?.fields ?? []).map(f => f.name);

describe('C29 (1): every document has Проведен after Дата', () => {
  const doc = (posting: string): any =>
    objectEl(`<Document uuid="d"><Properties><Name>Д</Name><NumberLength>9</NumberLength>${posting}</Properties><ChildObjects/></Document>`);
  it.each([
    ['Posting = Allow', '<Posting>Allow</Posting>'],
    ['Posting = Deny', '<Posting>Deny</Posting>'],
    ['no Posting element', ''],
  ])('%s', (_name, posting) => {
    const names = fieldNames(parseDocument(doc(posting)));
    expect(names.slice(0, 6)).toEqual(['Ссылка', 'ВерсияДанных', 'ПометкаУдаления', 'Номер', 'Дата', 'Проведен']);
  });
});

describe('C29 (2): ДатаОбмена is not a query field of an exchange plan', () => {
  const xml = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'cf-objects', 'ExchangePlans', 'ОбновлениеИнформационнойБазы.xml'), 'utf8');
  it('the XML still lists ExchangeDate; the parsed fields do not have ДатаОбмена', () => {
    expect(xml).toContain('ExchangeDate');
    const names = fieldNames(parseExchangePlan(firstElementChild(parseXml(xml)!.documentElement)));
    expect(names).not.toContain('ДатаОбмена');
    expect(names.slice(0, 8)).toEqual(['Ссылка', 'ВерсияДанных', 'ПометкаУдаления', 'ЭтотУзел', 'Код', 'Наименование', 'НомерОтправленного', 'НомерПринятого']);
  });
});

describe('C29 (4): chart of accounts Порядок when OrderLength > 0', () => {
  const chart = (orderLength: number): any =>
    objectEl(`<ChartOfAccounts uuid="c"><Properties><Name>П</Name><CodeLength>8</CodeLength><DescriptionLength>120</DescriptionLength><OrderLength>${orderLength}</OrderLength></Properties><ChildObjects/></ChartOfAccounts>`);
  it('OrderLength = 5: Порядок after Наименование, before Вид', () => {
    expect(fieldNames(parseChartOfAccounts(chart(5))).slice(0, 9))
      .toEqual(['Ссылка', 'ВерсияДанных', 'ПометкаУдаления', 'Родитель', 'Код', 'Наименование', 'Порядок', 'Вид', 'Забалансовый']);
  });
  it('OrderLength = 0: no Порядок (XML fixture; not yet confirmed on the platform)', () => {
    expect(fieldNames(parseChartOfAccounts(chart(0)))).not.toContain('Порядок');
  });
});

describe('C29 (3): an Auto data separator is a member only for exchange plans', () => {
  const ca = (separation: string, autoUse: string, items: Array<[string, string]>): any =>
    objectEl(`<CommonAttribute uuid="a"><Properties><Name>Р</Name><AutoUse>${autoUse}</AutoUse><DataSeparation>${separation}</DataSeparation><Content>${
      items.map(([m, u]) => `<xr:Item><xr:Metadata>${m}</xr:Metadata><xr:Use>${u}</xr:Use></xr:Item>`).join('')
    }</Content></Properties></CommonAttribute>`);

  it('separator, AutoUse = Use: an explicit Auto item counts only for an exchange plan', () => {
    const parsed = parseCommonAttribute(ca('Separate', 'Use', [['Catalog.Валюты', 'Auto'], ['ExchangePlan.Обмен', 'Auto'], ['Document.Д', 'Use']]))!;
    expect(parsed.content).toEqual(['ПланОбмена.Обмен', 'Документ.Д']);
  });

  it('explicit Use / DontUse of a separator are unchanged', () => {
    const parsed = parseCommonAttribute(ca('Separate', 'Use', [['InformationRegister.Р', 'Use'], ['Catalog.Валюты', 'DontUse']]))!;
    expect(parsed.content).toEqual(['РегистрСведений.Р']);
    expect(parsed.dontUse).toEqual(['Справочник.Валюты']);
  });

  it('a non-separator Auto item is unchanged (no platform evidence)', () => {
    const parsed = parseCommonAttribute(ca('DontUse', 'Use', [['Catalog.Валюты', 'Auto']]))!;
    expect(parsed.content).toEqual(['Справочник.Валюты']);
  });
});

describe('C29: a snapshot written by the previous parser is rebuilt', () => {
  let tmpDir = '';
  afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('formatVersion 1 with the old document columns → rebuilt from XML with Проведен', () => {
    expect(SNAPSHOT_FORMAT_VERSION).toBeGreaterThan(1);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c29-snapshot-'));
    const cfPath = path.join(tmpDir, 'cf-src');
    fs.cpSync(path.join(__dirname, '..', 'fixtures', 'cf'), cfPath, { recursive: true });
    const snapshotOut = path.join(tmpDir, 'snapshot-out'), yamlOut = path.join(tmpDir, 'yaml-out');
    expect(loadMetadataSnapshotFirst(cfPath, snapshotOut, yamlOut).source).toBe('direct-snapshot');

    // What an installed version 1 snapshot holds: the document without Проведен.
    const file = path.join(resolveManagedCfDir(snapshotOut), 'metadata-snapshot.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const doc = raw.model.tables.find((t: any) => t.fullName === 'Документ.ТестДок');
    doc.fields = doc.fields.filter((f: any) => f.name !== 'Проведен');
    fs.writeFileSync(file, JSON.stringify({ ...raw, formatVersion: 1 }));

    const r = loadMetadataSnapshotFirst(cfPath, snapshotOut, yamlOut);
    expect(r.source).toBe('direct-snapshot');
    expect(fieldNames(r.model.tables.find(t => t.fullName === 'Документ.ТестДок')!)).toContain('Проведен');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
  });
});
