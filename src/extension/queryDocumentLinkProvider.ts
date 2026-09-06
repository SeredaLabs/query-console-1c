import * as vscode from 'vscode';
import { findAllQueryLiterals } from './queryAtCursor';

/**
 * Команда, на яку веде кожен DocumentLink — реєструється в extension.ts, оскільки
 * саме там живе вся логіка відкриття панелі конструктора (`openConstructorFromRange`).
 */
export const OPEN_FROM_RANGE_COMMAND = 'queryConsole1c.openFromRange';

/**
 * Один DocumentLink на кожен знайдений `findAllQueryLiterals()`-хіт — Ctrl/Cmd+Click
 * у межах діапазону запускає `OPEN_FROM_RANGE_COMMAND` з {uri, offset}. Офсет —
 * позиція відкриваючої лапки хіта: `planQueryConstructor` (уже перевикористовується
 * командою обробки) сам перерахує точний `queryRange` з цього самого офсету, тож
 * діапазон не потрібно дублювати в аргументах команди.
 *
 * Розпізнавання, включно з тим, які літерали НЕ вважати запитом (конкатенація,
 * коментарі, літерали дат), повністю успадковується від `findAllQueryLiterals` —
 * той самий детектор, яким уже користуються команди «1С: Конструктор запитів».
 */
export class QueryDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const source = document.getText();
    return findAllQueryLiterals(source).map((hit) => {
      const range = new vscode.Range(document.positionAt(hit.start), document.positionAt(hit.end));
      const args = encodeURIComponent(JSON.stringify({ uri: document.uri.toString(), offset: hit.start }));
      const link = new vscode.DocumentLink(range, vscode.Uri.parse(`command:${OPEN_FROM_RANGE_COMMAND}?${args}`));
      link.tooltip = vscode.l10n.t('Ctrl/Cmd+Click to open the query designer');
      return link;
    });
  }
}
