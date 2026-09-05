import * as vscode from 'vscode';
import { formatAsBslString } from '../core/query/sdblGenerator';
import { buildResultProcessingCode } from '../core/query/resultProcessingTemplate';

export interface SavedEditorState {
  document: vscode.TextDocument;
  selection: vscode.Selection;
  /** Символьные смещения `[start, end)` литерала запроса для замены при сохранении. */
  queryRange?: { start: number; end: number };
  /**
   * Версия документа (`document.version`) на момент захвата `queryRange`. Панель
   * конструктора может оставаться открытой сколь угодно долго, пока пользователь
   * правит тот же файл в исходном редакторе — тогда сохранённые смещения `queryRange`
   * указывают уже не на тот текст. Без этой проверки «ОК» тихо заменял бы случайный
   * фрагмент кода вместо текста запроса (реальный риск потери данных).
   */
  documentVersion?: number;
  /** Обернуть результат в строковый литерал 1С (`"…|…"`) перед заменой. */
  wrapAsBslString?: boolean;
  /**
   * Вставлять код обработки результата (Запрос/УстановитьПараметр/Выполнить/Выборка/Цикл)
   * вместо голого литерала. Действует ТОЛЬКО при создании нового запроса — при открытии
   * уже существующего (см. extension.ts) это поле не выставляется, чтобы повторное
   * открытие никогда не задваивало обвязку вокруг уже написанного пользователем кода.
   */
  resultProcessing?: boolean;
}

/** Отступ (пробелы/табы) строки, на которой стоит позиция — под неё выравниваются
 * все строки вставляемого блока, кроме первой (она сама уже на этом отступе). */
function lineIndentAt(document: vscode.TextDocument, position: vscode.Position): string {
  const lineText = document.lineAt(position.line).text;
  return lineText.slice(0, lineText.length - lineText.trimStart().length);
}

export async function insertResult(text: string, saved?: SavedEditorState): Promise<void> {
  const foundEditor = saved
    ? vscode.window.visibleTextEditors.find(e => e.document === saved.document)
    : vscode.window.activeTextEditor;

  // Документ изменился с момента захвата queryRange (панель могла простоять открытой
  // сколько угодно, пока пользователь правил тот же файл) — сохранённые смещения
  // больше не гарантированно указывают на текст запроса. Безопаснее считать целевой
  // редактор недоступным (тот же путь, что и при закрытой вкладке), чем заменить
  // случайный фрагмент кода.
  const staleDocument =
    !!foundEditor && saved?.queryRange !== undefined &&
    saved.documentVersion !== undefined && foundEditor.document.version !== saved.documentVersion;
  const targetEditor = staleDocument ? undefined : foundEditor;

  if (targetEditor) {
    const range: vscode.Range = saved?.queryRange
      ? new vscode.Range(
          targetEditor.document.positionAt(saved.queryRange.start),
          targetEditor.document.positionAt(saved.queryRange.end)
        )
      : saved
        ? saved.selection
        : targetEditor.selection;
    const payload = saved?.resultProcessing
      ? buildResultProcessingCode(text, lineIndentAt(targetEditor.document, range.start))
      : saved?.wrapAsBslString
        ? formatAsBslString(text)
        : text;
    await targetEditor.edit(b => b.replace(range, payload));
    await vscode.window.showTextDocument(targetEditor.document, targetEditor.viewColumn);
  } else {
    const payload = saved?.resultProcessing ? buildResultProcessingCode(text) : text;
    await vscode.env.clipboard.writeText(payload);
    vscode.window.showInformationMessage(
      staleDocument
        ? vscode.l10n.t('The source file changed while Query Designer was open. The query text was copied to the clipboard; insert it manually.')
        : vscode.l10n.t('The query text was copied to the clipboard.')
    );
  }
}
