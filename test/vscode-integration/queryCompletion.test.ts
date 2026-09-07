/**
 * Extension Host integration (автодоповнення полів запиту): перевіряє, що
 * `QueryCompletionProvider` реально пропонує поля через справжні метадані,
 * зібрані з реального XML fixture (`test/fixtures/cf`) — той самий підхід, що
 * й queryHover.test.ts, — і що `vscode.executeCompletionItemProvider`
 * (справжній селектор-роутинг VS Code) реально його викликає для `.bsl`-документа.
 *
 * ПРИМІТКА: `test/fixtures/cf` містить лише один каталог — `Справочник.Тест`
 * (поля `Активен` (булево) і `Валюта` (посилання на `Справочник.Валюты`, якого
 * САМОГО в цій fixture НЕМАЄ)) — той самий fixture, що й у queryHover.test.ts.
 *
 * Урок з Ctrl/Cmd+Click- і hover-розслідувань — тому нижче є блок через
 * `vscode.executeCompletionItemProvider` з явною активацією розширення
 * (`ext.activate()`) ПЕРЕД викликом.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { QueryCompletionProvider } from '../../src/extension/queryCompletionProvider';
import { FIXTURE_CF } from './testUtil';

const QUERY_TEXT = 'ВЫБРАТЬ Т.Активен ИЗ Справочник.Тест КАК Т';
const QUERY_LITERAL = `Запрос.Текст = "${QUERY_TEXT}";\n`;

describe('Extension Host: автодоповнення полів після крапки', () => {
  let outputChannel: vscode.OutputChannel;

  before(async () => {
    outputChannel = vscode.window.createOutputChannel('1C Query Constructor Test: completion');
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', FIXTURE_CF, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', undefined, vscode.ConfigurationTarget.Global);
    outputChannel.dispose();
  });

  function makeProvider(): QueryCompletionProvider {
    return new QueryCompletionProvider(
      { globalStorageUri: vscode.Uri.file(os.tmpdir()) } as unknown as vscode.ExtensionContext,
      outputChannel,
      () => FIXTURE_CF
    );
  }

  it('пропонує поля таблиці одразу після крапки за псевдонімом ("Т.")', async function () {
    this.timeout(20000);

    const content = 'Запрос.Текст = "ВЫБРАТЬ Т. ИЗ Справочник.Тест КАК Т";\n';
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content });
    const offset = content.indexOf('Т.') + 2; // курсор одразу після крапки

    const items = await makeProvider().provideCompletionItems(doc, doc.positionAt(offset));
    assert.ok(items, 'очікувались варіанти автодоповнення');
    const labels = items!.map((i) => i.label as string);
    assert.ok(labels.includes('Активен'), `мало бути поле "Активен", отримано: ${labels.join(', ')}`);
    assert.ok(labels.includes('Валюта'), `мало бути поле "Валюта", отримано: ${labels.join(', ')}`);

    const activen = items!.find((i) => i.label === 'Активен')!;
    assert.strictEqual(activen.kind, vscode.CompletionItemKind.Field, '"Активен" — не посилання, звичайне поле');

    const valuta = items!.find((i) => i.label === 'Валюта')!;
    assert.strictEqual(valuta.kind, vscode.CompletionItemKind.Reference, '"Валюта" — посилальне поле');
  });

  it('НЕ пропонує варіантів, якщо перед крапкою невідомий псевдонім (fail-open)', async function () {
    this.timeout(20000);

    const content = 'Запрос.Текст = "ВЫБРАТЬ Т.Активен ИЗ Справочник.Тест КАК Т ГДЕ НетТакогоПсевдонима.Код = 1";\n';
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content });
    const offset = content.indexOf('НетТакогоПсевдонима.') + 'НетТакогоПсевдонима.'.length;

    const items = await makeProvider().provideCompletionItems(doc, doc.positionAt(offset));
    assert.strictEqual(items, undefined);
  });

  it('повертає undefined поза межами будь-якого літерала запиту', async function () {
    this.timeout(20000);

    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Сообщить("Просто текст.");\n',
    });
    const offset = doc.getText().indexOf('текст.') + 'текст.'.length;
    const items = await makeProvider().provideCompletionItems(doc, doc.positionAt(offset));
    assert.strictEqual(items, undefined);
  });
});

/**
 * На відміну від тестів вище (прямий виклик класу), цей блок йде через
 * `vscode.executeCompletionItemProvider` — вбудовану команду, яка реально
 * проганяє документ через селектор-роутинг VS Code, так само як введення крапки
 * користувачем у реальному редакторі.
 */
describe('Extension Host: автодоповнення через справжній маршрутизатор VS Code (vscode.executeCompletionItemProvider)', () => {
  before(async () => {
    const ext = vscode.extensions.getExtension('SeredaLabs.query-console-1c');
    await ext?.activate();

    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', FIXTURE_CF, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', undefined, vscode.ConfigurationTarget.Global);
  });

  it('знаходить варіанти автодоповнення на .bsl-файлі через реальний селектор-роутинг', async function () {
    this.timeout(20000);

    const looseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-bsl-'));
    const loosePath = path.join(looseDir, 'completion.bsl');
    const content = 'Запрос.Текст = "ВЫБРАТЬ Т. ИЗ Справочник.Тест КАК Т";\n';
    fs.writeFileSync(loosePath, content, 'utf8');

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(loosePath));
    await vscode.window.showTextDocument(doc);
    const pos = doc.positionAt(content.indexOf('Т.') + 2);

    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider', doc.uri, pos
    );
    assert.ok(result && result.items.length > 0, `vscode.executeCompletionItemProvider не повернув жодного варіанта для ${loosePath}`);
    const labels = result!.items.map((i) => i.label as string);
    assert.ok(labels.includes('Активен'), `мало бути поле "Активен", отримано: ${labels.join(', ')}`);
  });
});
