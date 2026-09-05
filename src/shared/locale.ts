export const SUPPORTED_LOCALES = ['en', 'uk', 'ru'] as const;

export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

/** Normalize VS Code locale identifiers such as `uk-UA` to a supported UI locale. */
export function normalizeLocale(locale: string): SupportedLocale {
  const language = locale.toLowerCase().split('-')[0];
  return language === 'uk' || language === 'ru' ? language : 'en';
}
