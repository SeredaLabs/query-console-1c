/**
 * Extension Host integration (Ctrl/Cmd+Click → конструктор запиту): перевіряє, що
 * `QueryDocumentLinkProvider` реально знаходить діапазон запиту в справжньому
 * vscode.TextDocument і що команда, на яку веде лінк, реально відкриває панель
 * конструктора — той самий шлях, яким уже користується «1c.queryConstructor»
 * (див. metadataPipeline.test.ts), тепер через окрему точку входу.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { QueryDocumentLinkProvider, OPEN_FROM_RANGE_COMMAND } from '../../src/extension/queryDocumentLinkProvider';
import { waitUntil } from './testUtil';

describe('Extension Host: DocumentLink на тексті запиту (Ctrl/Cmd+Click)', () => {
  it('provideDocumentLinks знаходить діапазон літерала і кодує {uri, offset} у target', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Запрос.Текст =\n"ВЫБРАТЬ\n|\tТовары.Наименование\n|ИЗ\n|\tСправочник.Товары КАК Товары";\n',
    });

    const links = new QueryDocumentLinkProvider().provideDocumentLinks(doc);
    assert.strictEqual(links.length, 1, 'мав знайтись рівно один літерал запиту');

    const [link] = links;
    const text = doc.getText();
    const expectedStart = text.indexOf('"');
    const expectedEnd = text.indexOf('";') + 1;
    assert.strictEqual(doc.offsetAt(link.range.start), expectedStart, 'початок діапазону — відкриваюча лапка');
    assert.strictEqual(doc.offsetAt(link.range.end), expectedEnd, 'кінець діапазону — за закриваючою лапкою');
    assert.ok(link.tooltip?.length, 'tooltip має пояснювати, що Ctrl/Cmd+Click відкриває конструктор');

    const target = link.target!;
    assert.strictEqual(target.scheme, 'command');
    assert.strictEqual(target.path, OPEN_FROM_RANGE_COMMAND);
    const args = JSON.parse(decodeURIComponent(target.query)) as { uri: string; offset: number };
    assert.strictEqual(args.uri, doc.uri.toString());
    assert.strictEqual(args.offset, expectedStart);
  });

  it('provideDocumentLinks НЕ створює лінк для звичайного (не-запитового) рядкового літерала', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Сообщить("Просто текст, не запрос");\n',
    });
    const links = new QueryDocumentLinkProvider().provideDocumentLinks(doc);
    assert.strictEqual(links.length, 0);
  });

  it(`команда "${OPEN_FROM_RANGE_COMMAND}" відкриває панель конструктора на переданому офсеті`, async function () {
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

/**
 * На відміну від тестів вище (які викликають `QueryDocumentLinkProvider` напряму),
 * ці два йдуть через `vscode.executeLinkProvider` — вбудовану команду, яка реально
 * проганяє документ через селектор-роутинг VS Code так само, як інтерактивний
 * ховер/правий клік. Перевіряють дві реальні файлові ситуації, які прямий виклик
 * класу не покриває: файл усередині відкритої робочої області і файл без неї.
 */
describe('Extension Host: DocumentLink через справжній маршрутизатор VS Code (vscode.executeLinkProvider)', () => {
  it('знаходить лінк на sample.bsl (файл усередині відкритої робочої області)', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'тестова робоча область не відкрита (див. .vscode-test.mjs)');
    const bslUri = vscode.Uri.joinPath(workspaceFolder!.uri, 'sample.bsl');
    const doc = await vscode.workspace.openTextDocument(bslUri);
    await vscode.window.showTextDocument(doc);

    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', doc.uri);
    assert.ok(links && links.length > 0, `vscode.executeLinkProvider не повернув жодного лінка для ${bslUri.fsPath}`);
  });

  it('знаходить лінк на .bsl-файлі БЕЗ відкритої робочої області (loose file)', async () => {
    const looseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loose-bsl-'));
    const loosePath = path.join(looseDir, 'loose.bsl');
    fs.writeFileSync(loosePath, 'Запрос.Текст = "ВЫБРАТЬ 1 КАК Число";\n', 'utf8');

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(loosePath));
    await vscode.window.showTextDocument(doc);

    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', doc.uri);
    assert.ok(links && links.length > 0, 'лінк мав знайтись і для файлу поза відкритою робочою областю');
  });
});
