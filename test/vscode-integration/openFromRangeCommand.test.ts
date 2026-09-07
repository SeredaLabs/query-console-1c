/**
 * Extension Host integration: перевіряє, що `OPEN_FROM_RANGE_COMMAND` (на яку веде
 * клікабельне посилання в hover — `queryHoverProvider.ts`'s `genericHint`) реально
 * відкриває панель конструктора на переданому офсеті — той самий шлях, яким уже
 * користується «1c.queryConstructor» (див. metadataPipeline.test.ts), тепер через
 * окрему точку входу.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { OPEN_FROM_RANGE_COMMAND } from '../../src/extension/openFromRangeCommand';
import { waitUntil } from './testUtil';

describe(`Extension Host: команда "${OPEN_FROM_RANGE_COMMAND}" (клік по посиланню в hover)`, () => {
  it('відкриває панель конструктора на переданому офсеті', async function () {
    this.timeout(15000);

    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Запрос.Текст = "ВЫБРАТЬ 1 КАК Число";\n',
    });
    await vscode.window.showTextDocument(doc);
    const offset = doc.getText().indexOf('"');

    const tabsBefore = vscode.window.tabGroups.all.flatMap(g => g.tabs).length;
    await vscode.commands.executeCommand(OPEN_FROM_RANGE_COMMAND, { uri: doc.uri.toString(), offset });

    const gotNewTab = await waitUntil(
      () => vscode.window.tabGroups.all.flatMap(g => g.tabs).length > tabsBefore,
      10000
    );
    assert.ok(gotNewTab, 'очікувалась нова вкладка — панель конструктора не була створена');
  });
});
