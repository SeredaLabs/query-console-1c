/**
 * Extension Host integration (ТЗ п.4 "закрыть integration gap", ROADMAP.md):
 * `insertResult` заменяет ТОЛЬКО диапазон литерала запроса в реальном
 * vscode.TextDocument — включая защиту от устаревшей версии документа
 * (staleDocument, см. src/extension/insertResult.ts). Это принципиально
 * не проверяется vitest-моками: нужен настоящий `TextEditor.edit`/`Position`/
 * `Range`, которые даёт только реальный Extension Host.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { insertResult } from '../../src/extension/insertResult';

describe('Extension Host: insertResult — реальная замена BSL-литерала', () => {
  it('заменяет только queryRange, остальной код документа не затрагивается', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Запрос = Новый Запрос;\nЗапрос.Текст = "СТАРЫЙ ТЕКСТ";\nХ = 1;\n',
    });
    const editor = await vscode.window.showTextDocument(doc);
    const text = doc.getText();
    const start = text.indexOf('"');
    const end = text.indexOf('";') + 1;

    await insertResult('ВЫБРАТЬ 1', {
      document: doc,
      selection: editor.selection,
      queryRange: { start, end },
      documentVersion: doc.version,
      wrapAsBslString: true,
    });

    const updated = editor.document.getText();
    assert.ok(updated.includes('Запрос.Текст = "ВЫБРАТЬ 1";'), `литерал не заменился корректно:\n${updated}`);
    assert.ok(updated.includes('Х = 1;'), 'остальной код документа не должен пострадать');
  });

  it('устаревшая версия документа (файл изменился, пока панель была открыта) НЕ трогает документ', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Запрос.Текст = "СТАРЫЙ";\n',
    });
    const editor = await vscode.window.showTextDocument(doc);
    const staleVersion = doc.version;

    // имитация правки пользователем в исходном редакторе, пока панель конструктора
    // оставалась открытой — см. SavedEditorState.documentVersion в insertResult.ts
    await editor.edit(b => b.insert(new vscode.Position(0, 0), '// правка пользователя\n'));
    assert.notStrictEqual(doc.version, staleVersion);

    const before = doc.getText();
    await insertResult('ВЫБРАТЬ 1', {
      document: doc,
      selection: editor.selection,
      queryRange: { start: 0, end: 5 },
      documentVersion: staleVersion,
      wrapAsBslString: true,
    });

    assert.strictEqual(doc.getText(), before, 'документ не должен измениться при устаревшей относительно захваченной версии');
  });
});
