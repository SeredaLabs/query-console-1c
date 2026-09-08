/**
 * Чистая (без `import vscode`) логика выбора ПРИЧИНЫ clipboard-фолбека при
 * вставке результата конструктора (`insertResult.ts`) — вынесена отдельно, чтобы
 * саму логику ветвления можно было проверить юнит-тестом (модуль с `import vscode`
 * не загружается в vitest — там нет реального пакета `vscode`).
 *
 * Post-release audit P1 №4: `TextEditor.edit()` возвращает `boolean` — раньше
 * результат игнорировался, поэтому провал вставки (уже ПОСЛЕ собственной
 * проверки staleDocument в insertResult.ts) означал тихую потерю сгенерированного
 * текста запроса — без clipboard-фолбека и без уведомления пользователя.
 */
export type ClipboardFallbackReason = 'staleDocument' | 'editFailed' | 'noEditor';

/**
 * `hadTargetEditor` — был ли у нас валидный (не устаревший) редактор-цель ДО
 * попытки `edit()`; если да, но мы всё равно оказались здесь — значит сам
 * `edit()` вернул `false`.
 */
export function selectClipboardFallbackReason(
  staleDocument: boolean,
  hadTargetEditor: boolean
): ClipboardFallbackReason {
  if (staleDocument) return 'staleDocument';
  if (hadTargetEditor) return 'editFailed';
  return 'noEditor';
}
