import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { COMMENT_LOSS_ON_OPEN, tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import * as generator from '../../src/core/query/sdblGenerator';
import { generateBatch } from '../../src/core/query/sdblGenerator';

afterEach(() => vi.restoreAllMocks());

const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
for (const metadata of [false, true]) describe(`designer comment-loss boundary (metadata=${metadata})`, () => {
  const active = metadata ? resolver : undefined;
  it.each([
    'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = 1 // keep\nИЛИ Т.Код = 2',
    'ВЫБРАТЬ Т.Код КАК А, КОЛИЧЕСТВО(*) КАК Н ИЗ Справочник.Валюты КАК Т СГРУППИРОВАТЬ ПО Т.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(*) > 1 // keep\nИ СУММА(1) > 0',
    'ВЫБРАТЬ П.А ИЗ (ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО Т.Код = Б.Код // keep\n) КАК П',
    'ВЫБРАТЬ Т.Код // keep\n+ 1 КАК А ИЗ Справочник.Валюты КАК Т',
    'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т СГРУППИРОВАТЬ ПО Т.Код // keep\n',
    'ВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ИТОГИ КОЛИЧЕСТВО(А) // keep\nКАК Н ПО ОБЩИЕ',
  ])('requires confirmation with a validated candidate: %s', input => {
    const opened = tryOpenDesignerBatch(input, active);
    expect(opened).toMatchObject({ ok: false, error: COMMENT_LOSS_ON_OPEN, commentLossDoc: expect.any(Object) });
    if (!('commentLossDoc' in opened)) throw new Error('missing confirmation candidate');
    expect(opened.commentLossDoc.members.length).toBeGreaterThan(0);
  });
  it.each([
    '// keep\nВЫБРАТЬ 1 КАК А',
    'ВЫБРАТЬ 1 КАК А // keep\n',
    'ВЫБРАТЬ "// inside string" КАК А',
    'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&Д // keep\n, ИСТИНА) КАК Т',
    'ВЫБРАТЬ 1 КАК Число ИТОГИ ПО Число ПЕРИОДАМИ(Месяц, 1 // keep\n, 2)',
    'ВЫБРАТЬ 1 КАК А;\n/////////////////\nВЫБРАТЬ 2 КАК Б',
  ])('opens preserved comments / strings / separators and reopens: %s', input => {
    const opened = tryOpenDesignerBatch(input, active);
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.error);
    expect(tryOpenDesignerBatch(generateBatch(opened.doc), active).ok).toBe(true);
  });
  it('detects one dropped occurrence even when an identical comment survives', () => {
    const input = '// keep\nВЫБРАТЬ Т.Код КАК А ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = 1 // keep\nИЛИ Т.Код = 2';
    const opened = tryOpenDesignerBatch(input, active);
    expect(opened).toMatchObject({ ok: false, error: COMMENT_LOSS_ON_OPEN, commentLossDoc: expect.any(Object) });
    if (!('commentLossDoc' in opened)) throw new Error('missing confirmation candidate');
    expect(opened.commentLossDoc.members.length).toBeGreaterThan(0);
  });
});


it.each([
  'ВЫБРАТЬ ИЗ ИЗ // keep',
  'ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А, Справочник.Валюты КАК А // keep',
])('syntax/semantic failure never offers a comment-loss override: %s', input => {
  const opened = tryOpenDesignerBatch(input);
  expect(opened.ok).toBe(false);
  expect(opened).not.toHaveProperty('commentLossDoc');
});

it('generation failure remains an error without a confirmation candidate', () => {
  vi.spyOn(generator, 'generateBatch').mockImplementation(() => { throw new Error('generation failed'); });
  expect(tryOpenDesignerBatch('// keep\nВЫБРАТЬ 1 КАК А')).toEqual({ ok: false, error: 'generation failed' });
});
