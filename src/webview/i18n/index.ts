import en from './en.json';
import uk from './uk.json';
import ru from './ru.json';
import type { SupportedLocale } from '../../shared/locale';

type Messages = typeof en;
export type MessageKey = keyof Messages;

const dictionaries: Record<SupportedLocale, Record<MessageKey, string>> = { en, uk, ru };
let activeLocale: SupportedLocale = 'en';

export function setLocale(locale: SupportedLocale): void {
  activeLocale = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function getLocale(): SupportedLocale {
  return activeLocale;
}

export function t(key: MessageKey, args: Record<string, string | number> = {}): string {
  const template = dictionaries[activeLocale][key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(args, name) ? String(args[name]) : match
  );
}

/** Translate stable outer forms emitted by the language-independent query core. */
export function localizeDiagnostic(message: string): string {
  if (message.startsWith('Запрос содержит ошибку: ')) {
    return t('diagnostic.queryContainsError', { detail: localizeDiagnostic(message.slice('Запрос содержит ошибку: '.length)) });
  }
  let match = message.match(/^Лексическая ошибка (\d+):(\d+) — (.*)$/s);
  if (match) return t('diagnostic.lexicalError', { line: match[1], column: match[2], detail: localizeCoreDetail(match[3]) });
  match = message.match(/^Ошибка разбора (\d+):(\d+) — (.*) \(получено «(.*)»\)$/s);
  if (match) return t('diagnostic.parseError', { line: match[1], column: match[2], detail: localizeCoreDetail(match[3]), token: match[4] });
  match = message.match(/^\{\((\d+), (\d+)\)\}: Таблица не найдена "(.*)"$/s);
  if (match) return t('diagnostic.tableNotFoundAt', { line: match[1], column: match[2], table: match[3] });
  match = message.match(/^Таблица не найдена "(.*)"$/s);
  if (match) return t('diagnostic.tableNotFound', { table: match[1] });
  match = message.match(/^Повторяющийся псевдоним "(.*)"$/s);
  if (match) return t('diagnostic.duplicateAlias', { alias: match[1] });
  match = message.match(/^Количество столбцов в результате запроса с объединением не совпадает \((.*)\)$/s);
  if (match) return t('diagnostic.unionColumnCount', { counts: match[1] });
  if (activeLocale !== 'ru' && /[А-Яа-яЁё]/.test(message)) return t('diagnostic.unknownCoreError');
  return message;
}

function localizeCoreDetail(detail: string): string {
  if (activeLocale === 'ru') return detail;
  let match = detail.match(/^ожидалось ключевое слово «(.*)»$/s);
  if (match) return t('diagnostic.expectedKeyword', { value: match[1] });
  match = detail.match(/^ожидался символ «(.*)»$/s);
  if (match) return t('diagnostic.expectedSymbol', { value: match[1] });
  match = detail.match(/^неожиданный символ (.*)$/s);
  if (match) return t('diagnostic.unexpectedCharacter', { value: match[1] });
  if (detail === 'незакрытый строковый литерал') return t('diagnostic.unclosedString');
  if (detail === 'незакрытый литерал даты') return t('diagnostic.unclosedDate');
  return t('diagnostic.unsupportedSyntax');
}

export function localizeLintWarning(code: string, message: string): string {
  if (code === 'like-leading-wildcard') return t('warning.likeLeadingWildcard');
  if (code === 'full-join') return t('warning.fullJoin');
  if (code === 'join-with-subquery') {
    const source = message.match(/\((.*)\)/)?.[1] ?? '';
    return t('warning.joinWithSubquery', { source });
  }
  if (code === 'top-without-order') return t('warning.topWithoutOrder');
  if (activeLocale !== 'ru' && /[А-Яа-яЁё]/.test(message)) return t('warning.unknownCoreWarning');
  return message;
}
