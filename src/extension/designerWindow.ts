const MOVE_EDITOR_TO_NEW_WINDOW = 'workbench.action.moveEditorToNewWindow';
const ENABLE_COMPACT_AUXILIARY_WINDOW = 'workbench.action.enableCompactAuxiliaryWindow';

/**
 * Moves the active designer editor into an auxiliary window and makes that
 * window compact. The move command resolves only after VS Code focuses the new
 * auxiliary editor, so the second command is scoped to that window.
 *
 * Both commands are best-effort: older or restricted VS Code hosts may not
 * expose them, and opening the designer must still succeed in the current tab.
 */
export async function moveDesignerToCompactWindow(
  enabled: boolean,
  executeCommand: (command: string) => unknown
): Promise<void> {
  if (!enabled) return;

  try {
    await executeCommand(MOVE_EDITOR_TO_NEW_WINDOW);
    await executeCommand(ENABLE_COMPACT_AUXILIARY_WINDOW);
  } catch {
    // Unsupported command: keep the designer wherever VS Code opened it.
  }
}
