/**
 * CSP-нонс текущего <script>, вставленный хостом (panel.ts) — тот же, что уже
 * разрешает выполнение самого бандла через `script-src 'nonce-…'`. CodeMirror
 * (через style-mod) на лету создаёт <style> с текстом правил подсветки;
 * без нонса это создание блокируется CSP страницы (у нас style-src разрешает
 * это через 'unsafe-inline', но в некоторых окружениях/версиях webview этого
 * недостаточно) — передаём нонс явно через EditorView.cspNonce (см. CodeEditor.tsx),
 * что гарантированно работает независимо от 'unsafe-inline'.
 *
 * `document.currentScript` действителен только во время синхронного исполнения
 * тела скрипта верхнего уровня — читаем его здесь, в первом же модуле, который
 * исполняется при загрузке бандла.
 */
export const CSP_NONCE = (document.currentScript as HTMLScriptElement | null)?.nonce ?? '';
