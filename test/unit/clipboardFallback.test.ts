/**
 * Post-release audit P1 №4: `TextEditor.edit()` возвращает `boolean` — раньше он
 * игнорировался, поэтому провал вставки (после нашей же проверки staleDocument)
 * означал тихую потерю сгенерированного текста запроса, без clipboard-фолбека и
 * без уведомления. `selectClipboardFallbackReason` — чистая функция выбора
 * ПРИЧИНЫ фолбека, вынесенная из `insertResult` (которая сама зависит от
 * `vscode`), чтобы саму логику ветвления можно было проверить без реального
 * `vscode.l10n`/`vscode.window`.
 */
import { describe, it, expect } from 'vitest';
import { selectClipboardFallbackReason } from '../../src/extension/clipboardFallback';

describe('selectClipboardFallbackReason', () => {
  it('staleDocument побеждает независимо от hadTargetEditor', () => {
    expect(selectClipboardFallbackReason(true, true)).toBe('staleDocument');
    expect(selectClipboardFallbackReason(true, false)).toBe('staleDocument');
  });

  it('hadTargetEditor=true при staleDocument=false — edit() реально провалился', () => {
    expect(selectClipboardFallbackReason(false, true)).toBe('editFailed');
  });

  it('ни staleDocument, ни hadTargetEditor — редактора вообще не было (закрытая вкладка)', () => {
    expect(selectClipboardFallbackReason(false, false)).toBe('noEditor');
  });
});
