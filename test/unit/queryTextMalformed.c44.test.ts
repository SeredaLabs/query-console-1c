import { afterEach, describe, expect, it } from 'vitest';
import { analyze, MALFORMED_CUSTOM_EXPRESSION } from '../../src/core/query/queryAnalysisService';
import { tryOpenDesignerBatch } from '../../src/webview/openDesignerBatch';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { findStaticApplyBlocker } from '../../src/webview/applyGate';
import { localizeDiagnostic, setLocale, t } from '../../src/webview/i18n';

// C44: the Query Text status bar used `tryOpenBatch` only, so a condition the
// tolerant parser keeps as custom text ("✓") was refused only by the final
// OK / Save (`findStaticApplyBlocker` → `malformedCustom`). Both must now agree.

const FROM = 'ВЫБРАТЬ В.Код КАК Код ИЗ Справочник.Валюты КАК В';
const malformed = [
  `${FROM} ГДЕ В.Код = `,
  `${FROM} ГДЕ (В.Код = 1`,
  `${FROM} СГРУППИРОВАТЬ ПО В.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(В.Код) >`,
  `ВЫБРАТЬ В.Код КАК Код ПОМЕСТИТЬ ВТ ИЗ Справочник.Валюты КАК В ГДЕ В.Код = 1;\nВЫБРАТЬ ВТ.Код ИЗ ВТ КАК ВТ ГДЕ (ВТ.Код = 2`,
  `ВЫБРАТЬ П.Код КАК Код ИЗ (${FROM} ГДЕ В.Код = ) КАК П`,
];
const valid = [
  `${FROM} ГДЕ В.Код = 1`,
  `${FROM} ГДЕ (В.Код = 1)`,
  `${FROM} ГДЕ В.Код = &Код И В.Код ПОДОБНО "%а"`,
  `${FROM} ГДЕ В.Код МЕЖДУ &А И &Б`,
  `${FROM} СГРУППИРОВАТЬ ПО В.Код ИМЕЮЩИЕ КОЛИЧЕСТВО(В.Код) > 1`,
  `ВЫБРАТЬ П.Код КАК Код ИЗ (${FROM} ГДЕ В.Код = 1) КАК П`,
];

function finalApplyBlocker(text: string) {
  const r = tryOpenDesignerBatch(text);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  return findStaticApplyBlocker(reducer(initialState(), { type: 'LOAD_BATCH', doc: r.doc }));
}

describe('C44: Query Text analysis matches the final Apply gate', () => {
  for (const text of malformed) {
    it(`reports a malformed custom expression: ${JSON.stringify(text)}`, () => {
      expect(finalApplyBlocker(text)).toEqual({ kind: 'malformedCustom' });
      const r = analyze(text);
      expect(r.diagnostics).toEqual([{ message: MALFORMED_CUSTOM_EXPRESSION }]);
      expect(r.result).toBeNull();
      expect(r.warnings).toEqual([]);
    });
  }

  for (const text of valid) {
    it(`keeps a valid control query clean: ${JSON.stringify(text)}`, () => {
      expect(finalApplyBlocker(text)).toBeNull();
      const r = analyze(text);
      expect(r.diagnostics).toEqual([]);
      expect(r.result).not.toBeNull();
    });
  }
});

describe('C44: the malformed-expression diagnostic is localized', () => {
  afterEach(() => setLocale('en'));
  for (const locale of ['en', 'uk', 'ru'] as const) {
    it(locale, () => {
      setLocale(locale);
      expect(localizeDiagnostic(MALFORMED_CUSTOM_EXPRESSION)).toBe(t('constructor.malformedCustom'));
    });
  }
});
