import * as vscode from 'vscode';
import { findAllQueryLiterals } from './queryAtCursor';
import { OPEN_FROM_RANGE_COMMAND } from './queryDocumentLinkProvider';

/**
 * Основна, ЗАВЖДИ видима точка входу «відкрити конструктор запиту» — на відміну
 * від Ctrl/Cmd+Click (`QueryDocumentLinkProvider`, потребує модифікатора й непомітний
 * до наведення), CodeLens малює постійний рядок з іконкою над кожним знайденим
 * літералом запиту: один звичайний клік, без утримання клавіш.
 *
 * Обидва провайдери навмисно співіснують — Ctrl/Cmd+Click лишається для тих, хто
 * вже звик; CodeLens закриває "з мінімумом дій і візуально зрозуміло" для решти.
 * Обидва ведуть на ту саму команду (`OPEN_FROM_RANGE_COMMAND`) з тим самим офсетом
 * відкриваючої лапки — розпізнавання (яка команда, який офсет) НЕ дублюється.
 */
export class QueryCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const source = document.getText();
    return findAllQueryLiterals(source).map((hit) => {
      const startPos = document.positionAt(hit.start);
      const range = new vscode.Range(startPos, startPos);
      return new vscode.CodeLens(range, {
        title: `$(link-external) ${vscode.l10n.t('Open in Query Designer')}`,
        command: OPEN_FROM_RANGE_COMMAND,
        arguments: [{ uri: document.uri.toString(), offset: hit.start }],
      });
    });
  }
}
