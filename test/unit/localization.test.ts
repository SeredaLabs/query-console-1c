import { afterEach, describe, expect, it } from 'vitest';
import { normalizeLocale } from '../../src/shared/locale';
import { localizeDiagnostic, localizeLintWarning, setLocale, t } from '../../src/webview/i18n';

afterEach(() => setLocale('en'));

describe('localization', () => {
  it.each([
    ['en', 'en'], ['en-US', 'en'], ['uk', 'uk'], ['uk-UA', 'uk'],
    ['ru', 'ru'], ['ru-RU', 'ru'], ['de-DE', 'en'], ['', 'en'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });

  it('translates the same key in all supported locales', () => {
    setLocale('en');
    expect(t('actions.cancel')).toBe('Cancel');
    setLocale('uk');
    expect(t('actions.cancel')).toBe('Скасувати');
    setLocale('ru');
    expect(t('actions.cancel')).toBe('Отмена');
  });

  it('interpolates named values', () => {
    setLocale('en');
    expect(t('tree.matchPosition', { current: 2, total: 7 })).toBe('2 of 7');
  });

  it('localizes stable query-core diagnostics without translating identifiers', () => {
    setLocale('uk');
    expect(localizeDiagnostic('{(3, 7)}: Таблица не найдена "Справочник.Валюты"'))
      .toBe('3:7: Таблицю не знайдено: "Справочник.Валюты"');
  });

  it('localizes linter warnings by stable code', () => {
    setLocale('en');
    expect(localizeLintWarning('top-without-order', 'ignored source text'))
      .toBe('TOP N without ORDER BY is non-deterministic');
  });

  it('does not leak Russian parser prose into the English diagnostic', () => {
    setLocale('en');
    const message = localizeDiagnostic('Ошибка разбора 2:4 — пустой список выборки (получено «ИЗ»)');
    expect(message).toBe('Parse error 2:4 — syntax near this position is incomplete or unsupported (received “ИЗ”)');
  });

  it('uses a localized fallback for a new core diagnostic', () => {
    setLocale('uk');
    expect(localizeDiagnostic('Нове повідомлення ядра'))
      .toBe('Під час аналізу запиту отримано непідтримувану діагностику');
  });
});
