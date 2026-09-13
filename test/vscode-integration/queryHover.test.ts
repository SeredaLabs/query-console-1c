/**
 * Extension Host integration (hover по полю запиту): перевіряє, що
 * `QueryHoverProvider` реально резолвить `Псевдонім.Поле` через справжні метадані,
 * зібрані з реального XML fixture (`test/fixtures/cf`) — той самий шлях, яким уже
 * користується metadataPipeline.test.ts, — і що `vscode.executeHoverProvider`
 * (справжній селектор-роутинг VS Code) реально його викликає для `.bsl`-документа.
 *
 * ПРИМІТКА: `test/fixtures/cf` містить лише один каталог — `Справочник.Тест`
 * (поля `Активен` (булево) і `Валюта` (посилання на `Справочник.Валюты`, якого
 * САМОГО в цій fixture НЕМАЄ — навмисний "reference без метаданих цілі" кейс)).
 * `sample.bsl` (`Справочник.Валюты КАК Валюты`, `Валюты.Код`) тут НЕ підходить —
 * той каталог у fixture не описаний взагалі (сам sample.bsl потрібен лише
 * queryConstructorPlan.test.ts/metadataPipeline.test.ts, яким досить, що
 * панель відкривається — не що поле реально резолвиться в метаданих).
 *
 * Урок з Ctrl/Cmd+Click-розслідування («тестувався прямим викликом, але реальний
 * VS Code selector routing залишався неперевіреним») — тому тут ОБОВ'ЯЗКОВО є блок
 * через `vscode.executeHoverProvider`, а не лише прямий виклик класу. Той блок
 * (на відміну від прямого виклику класу) вимагає, щоб розширення було РЕАЛЬНО
 * активоване (`ext.activate()`) — інакше `activate()` (де реєструється
 * `QueryHoverProvider`) ще жодного разу не виконувався, і жоден провайдер
 * узагалі не зареєстрований (див. commands.test.ts — той самий патерн).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { QueryHoverProvider } from '../../src/extension/queryHoverProvider';
import { FIXTURE_CF } from './testUtil';
import { setMetadataResolver } from '../../src/extension/metadataResolverCache';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';

const QUERY_TEXT = 'ВЫБРАТЬ Т.Активен ИЗ Справочник.Тест КАК Т';
const QUERY_LITERAL = `Запрос.Текст = "${QUERY_TEXT}";\n`;

describe('Extension Host: hover на цепочці поля запиту', () => {
  let outputChannel: vscode.OutputChannel;

  before(async () => {
    outputChannel = vscode.window.createOutputChannel('1C Query Constructor Test: hover');
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', FIXTURE_CF, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', undefined, vscode.ConfigurationTarget.Global);
    outputChannel.dispose();
  });

  function makeProvider(): QueryHoverProvider {
    return new QueryHoverProvider(
      { globalStorageUri: vscode.Uri.file(os.tmpdir()) } as unknown as vscode.ExtensionContext,
      outputChannel,
      () => FIXTURE_CF
    );
  }

  it('provideHover резолвить псевдонім джерела (голова ланцюжка) на "Справочник.Тест"', async function () {
    this.timeout(20000);

    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: QUERY_LITERAL });
    const offset = doc.getText().indexOf('Т.Активен'); // курсор на "Т" (голова ланцюжка)

    const hover = await makeProvider().provideHover(doc, doc.positionAt(offset));
    assert.ok(hover, 'очікувався hover для псевдоніма "Т"');
    const value = (hover!.contents[0] as vscode.MarkdownString).value;
    assert.ok(value.includes('Справочник.Тест'), `hover мав містити повне ім'я таблиці, отримано: ${value}`);
  });

  it('provideHover резолвить конкретне поле ("Активен") через справжні метадані', async function () {
    this.timeout(20000);

    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: QUERY_LITERAL });
    const offset = doc.getText().indexOf('Активен');

    const hover = await makeProvider().provideHover(doc, doc.positionAt(offset));
    assert.ok(hover, 'очікувався hover для поля "Активен"');
    const value = (hover!.contents[0] as vscode.MarkdownString).value;
    assert.ok(value.includes('Активен'), `hover мав згадувати назву поля, отримано: ${value}`);
  });

  it('provideHover повертає undefined поза межами будь-якого літерала запиту', async function () {
    this.timeout(20000);

    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'Сообщить("Просто текст, не запрос");\n',
    });
    const offset = doc.getText().indexOf('текст');
    const hover = await makeProvider().provideHover(doc, doc.positionAt(offset));
    assert.strictEqual(hover, undefined);
  });

  it('provideHover показує загальну підказку з клікабельним посиланням на ключовому слові всередині запиту (де конкретне поле не резолвиться)', async function () {
    this.timeout(20000);

    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: QUERY_LITERAL });
    const offset = doc.getText().indexOf('ВЫБРАТЬ') + 2; // курсор всередині ключового слова, не на псевдонімі/полі

    const hover = await makeProvider().provideHover(doc, doc.positionAt(offset));
    assert.ok(hover, 'очікувався фолбек-hover навіть без резолвного ланцюжка поля');
    const md = hover!.contents[0] as vscode.MarkdownString;
    assert.ok(md.value.includes('Query Designer'), `hover мав пояснювати можливість відкрити конструктор, отримано: ${md.value}`);
    assert.ok(md.value.includes('command:queryConsole1c.openFromRange'), 'hover мав містити клікабельне command-посилання');
    assert.strictEqual(md.isTrusted, true, 'markdown з command-посиланням має бути isTrusted, інакше VS Code його не виконає');
  });

  it('provideHover (Phase 2x-2) описує позиційний аргумент віртуальної таблиці незалежно від метаданих регістру', async function () {
    this.timeout(20000);

    const vtQueryText = 'ВЫБРАТЬ Т.Период ИЗ РегистрНакопления.Продажи.Остатки(&Дата, ИСТИНА) КАК Т';
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: `Запрос.Текст = "${vtQueryText}";\n`,
    });
    const offset = doc.getText().indexOf('&Дата') + 1; // курсор всередині першого аргументу ВТ

    const hover = await makeProvider().provideHover(doc, doc.positionAt(offset));
    assert.ok(hover, 'очікувався hover для аргументу віртуальної таблиці');
    const value = (hover!.contents[0] as vscode.MarkdownString).value;
    assert.ok(value.includes('Период'), `hover мав назвати роль параметра ("Период"), отримано: ${value}`);
    assert.ok(value.includes('РегистрНакопления.Продажи.Остатки'), `hover мав назвати повне ім'я ВТ, отримано: ${value}`);
  });
});

/**
 * Phase 2x-2, increment 2: bare-field resolution inside a virtual-table
 * `Условие` argument, against the register's own REAL metadata (dimensions/
 * resources), seeded directly via `setMetadataResolver` (post-release audit
 * P1 №3's mechanism) rather than through the XML fixture — `test/fixtures/cf`
 * has no register at all, and building one out just for this would be a much
 * bigger fixture change than the feature itself needs.
 */
describe('Extension Host: hover на полі всередині Условие віртуальної таблиці (Phase 2x-2, increment 2)', () => {
  const cfPath = '/nonexistent/path/for/vt-condition-field-hover-test';

  before(() => {
    const nomenklatura: MetaTable = {
      kind: 'Справочник', name: 'Номенклатура', fullName: 'Справочник.Номенклатура',
      fields: [{ name: 'Наименование', kind: 'standard', types: [{ primitive: 'Строка' }] }],
    };
    const prodazhi: MetaTable = {
      kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи',
      fields: [
        { name: 'Товар', kind: 'dimension', types: [{ ref: { kind: 'Справочник', name: 'Номенклатура' } }] },
        { name: 'Количество', kind: 'resource', types: [{ primitive: 'Число' }] },
      ],
    };
    const prodazhiOstatki: MetaTable = {
      kind: 'РегистрНакопления', name: 'Продажи.Остатки', fullName: 'РегистрНакопления.Продажи.Остатки',
      fields: [
        { name: 'Товар', kind: 'dimension', types: prodazhi.fields[0].types },
        { name: 'КоличествоОстаток', kind: 'resource', types: [{ primitive: 'Число' }] },
      ],
      virtual: { slice: 'Остатки', baseFullName: 'РегистрНакопления.Продажи' },
    };
    setMetadataResolver(cfPath, buildResolverFromTables([prodazhi, prodazhiOstatki, nomenklatura]));
  });

  function makeProvider(): QueryHoverProvider {
    const outputChannel = { appendLine: () => {} } as unknown as vscode.OutputChannel;
    return new QueryHoverProvider(
      { globalStorageUri: vscode.Uri.file(os.tmpdir()) } as unknown as vscode.ExtensionContext,
      outputChannel,
      () => cfPath
    );
  }

  it('resolves a bare dimension field ("Товар") inside Условие against the register, not an alias', async function () {
    this.timeout(20000);

    const vtQueryText = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, Товар = &Товар) КАК Т';
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: `Запрос.Текст = "${vtQueryText}";\n` });
    const offset = doc.getText().indexOf('Товар = &Товар');

    const hover = await makeProvider().provideHover(doc, doc.positionAt(offset));
    assert.ok(hover, 'очікувався hover для поля "Товар" усередині Условие');
    const value = (hover!.contents[0] as vscode.MarkdownString).value;
    assert.ok(value.includes('Товар'), `hover мав згадувати назву поля "Товар", отримано: ${value}`);
    assert.ok(value.includes('Справочник.Номенклатура'), `hover мав показати ціль посилання, отримано: ${value}`);
  });

  it('reports "field not found" for an unknown identifier inside Условие (proven, not a metadata gap)', async function () {
    this.timeout(20000);

    const vtQueryText = 'ВЫБРАТЬ Т.Количество ИЗ РегистрНакопления.Продажи.Остатки(&Дата, НетТакогоПоля = 1) КАК Т';
    const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: `Запрос.Текст = "${vtQueryText}";\n` });
    const offset = doc.getText().indexOf('НетТакогоПоля');

    const hover = await makeProvider().provideHover(doc, doc.positionAt(offset));
    assert.ok(hover, 'очікувався hover, що повідомляє "поле не знайдено"');
    const value = (hover!.contents[0] as vscode.MarkdownString).value;
    assert.ok(value.includes('НетТакогоПоля'), `hover мав назвати саме це поле, отримано: ${value}`);
    assert.ok(value.includes('РегистрНакопления.Продажи'), `hover мав назвати БАЗОВИЙ регістр (не слайс), отримано: ${value}`);
  });
});

/**
 * На відміну від тестів вище (прямий виклик класу), цей блок йде через
 * `vscode.executeHoverProvider` — вбудовану команду, яка реально проганяє документ
 * через селектор-роутинг VS Code так само, як інтерактивний ховер миші. Файл
 * пишеться на диск (поза відкритою робочою областю — той самий "loose file"
 * підхід, що вже довів селектор-роутинг у queryDocumentLink.test.ts), бо
 * `vscode.executeHoverProvider` реально матчить документ проти `{pattern: '**\/*.bsl'}`.
 */
describe('Extension Host: hover через справжній маршрутизатор VS Code (vscode.executeHoverProvider)', () => {
  before(async () => {
    // Без явної активації `activate()` (де реєструється НАШ QueryHoverProvider)
    // міг ще жодного разу не виконатись — activationEvents тут лише `onCommand:*`,
    // без onStartupFinished/onLanguage. Див. commands.test.ts.
    const ext = vscode.extensions.getExtension('SeredaLabs.query-console-1c');
    await ext?.activate();

    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', FIXTURE_CF, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('queryConsole');
    await config.update('metadataPath', undefined, vscode.ConfigurationTarget.Global);
  });

  it('знаходить hover на .bsl-файлі через реальний селектор-роутинг', async function () {
    this.timeout(20000);

    const looseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-bsl-'));
    const loosePath = path.join(looseDir, 'hover.bsl');
    fs.writeFileSync(loosePath, QUERY_LITERAL, 'utf8');

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(loosePath));
    await vscode.window.showTextDocument(doc);
    const offset = doc.getText().indexOf('Активен');
    const pos = doc.positionAt(offset);

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider', doc.uri, pos
    );
    assert.ok(hovers && hovers.length > 0, `vscode.executeHoverProvider не повернув жодного hover для ${loosePath}`);
    const value = (hovers![0].contents[0] as vscode.MarkdownString).value;
    assert.ok(value.includes('Активен'), `hover мав згадувати назву поля, отримано: ${value}`);
  });
});
