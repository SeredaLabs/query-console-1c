/**
 * Extension Host integration (CodeLens «Open in Query Designer»): перевіряє, що
 * `QueryCodeLensProvider` реально знаходить кожен літерал запиту й веде на ту саму
 * команду (`OPEN_FROM_RANGE_COMMAND`), що й Ctrl/Cmd+Click
 * (`queryDocumentLink.test.ts`) — CodeLens лише додає ЗАВЖДИ видиму, клікабельну
 * без модифікатора точку входу поруч, не замінюючи Ctrl/Cmd+Click.
 *
 * Урок з Ctrl/Cmd+Click- і hover-розслідувань («тестувався прямим викликом, але
 * реальний VS Code selector routing залишався неперевіреним») — тому нижче є блок
 * через `vscode.executeCodeLensProvider`, з явною активацією розширення
 * (`ext.activate()`) ПЕРЕД викликом: `activate()` (де реєструється
 * `QueryCodeLensProvider`) інакше може ще жодного разу не виконатись —
 * activationEvents тут лише `onCommand:*`, без onStartupFinished/onLanguage
 * (див. queryHover.test.ts, той самий патерн).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { QueryCodeLensProvider } from '../../src/extension/queryCodeLensProvider';
import { OPEN_FROM_RANGE_COMMAND } from '../../src/extension/queryDocumentLinkProvider';

describe('Extension Host: CodeLens «Open in Query Designer» на літералі запиту', () => {
  it('provideCodeLenses ставить один CodeLens на початок кожного літерала запиту', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Запрос.Текст =\n"ВЫБРАТЬ\n|\tТовары.Наименование\n|ИЗ\n|\tСправочник.Товары КАК Товары";\n',
    });

    const lenses = new QueryCodeLensProvider().provideCodeLenses(doc);
    assert.strictEqual(lenses.length, 1, 'мав знайтись рівно один літерал запиту');

    const [lens] = lenses;
    const text = doc.getText();
    const expectedStart = text.indexOf('"');
    assert.strictEqual(doc.offsetAt(lens.range.start), expectedStart, 'CodeLens прив\'язаний до відкриваючої лапки');
    assert.strictEqual(doc.offsetAt(lens.range.end), expectedStart, 'range CodeLens — нульової довжини (тільки позиція)');

    assert.ok(lens.command, 'CodeLens має мати команду одразу (без resolveCodeLens)');
    assert.strictEqual(lens.command!.command, OPEN_FROM_RANGE_COMMAND);
    assert.ok(lens.command!.title.length > 0, 'title має бути непорожнім (іконка + напис)');
    const args = lens.command!.arguments as [{ uri: string; offset: number }];
    assert.strictEqual(args[0].uri, doc.uri.toString());
    assert.strictEqual(args[0].offset, expectedStart);
  });

  it('provideCodeLenses НЕ створює CodeLens для звичайного (не-запитового) рядкового літерала', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Сообщить("Просто текст, не запрос");\n',
    });
    const lenses = new QueryCodeLensProvider().provideCodeLenses(doc);
    assert.strictEqual(lenses.length, 0);
  });
});

describe('Extension Host: CodeLens через справжній маршрутизатор VS Code (vscode.executeCodeLensProvider)', () => {
  before(async () => {
    const ext = vscode.extensions.getExtension('SeredaLabs.query-console-1c');
    await ext?.activate();
  });

  it('знаходить CodeLens на .bsl-файлі через реальний селектор-роутинг', async function () {
    this.timeout(20000);

    const looseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens-bsl-'));
    const loosePath = path.join(looseDir, 'codelens.bsl');
    fs.writeFileSync(loosePath, 'Запрос.Текст = "ВЫБРАТЬ 1 КАК Число";\n', 'utf8');

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(loosePath));
    await vscode.window.showTextDocument(doc);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider', doc.uri, 100
    );
    assert.ok(lenses && lenses.length > 0, `vscode.executeCodeLensProvider не повернув жодного CodeLens для ${loosePath}`);
    assert.strictEqual(lenses![0].command?.command, OPEN_FROM_RANGE_COMMAND);
  });
});
