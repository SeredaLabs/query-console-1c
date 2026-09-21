import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createPanel } from './panel';
import { createCanvasPanel } from './canvasPanel';
import { isCanvasPreviewEnabled } from './canvasPreview';
import { resolveCfPath } from './resolveCfPath';
import { registerParseCommand } from './parseCommand';
import { planQueryConstructor, type OpenPlan } from './queryConstructorPlan';
import { OPEN_FROM_RANGE_COMMAND } from './openFromRangeCommand';
import { QueryHoverProvider } from './queryHoverProvider';
import { QueryCompletionProvider } from './queryCompletionProvider';
import { registerQueryDiagnostics } from './queryDiagnosticsController';

let outputChannel: vscode.OutputChannel;

/** Резолвит путь к выгрузке конфигурации и логирует диагностику в канал вывода. */
function resolveCfPathWithLogging(): string {
  const config = vscode.workspace.getConfiguration('queryConsole');
  const setting = config.get<string>('metadataPath') ?? '';
  outputChannel.appendLine(vscode.l10n.t('[1C Query] metadataPath setting: "{path}"', { path: setting }));
  outputChannel.appendLine(vscode.l10n.t('[1C Query] Configured path exists on disk: {value}', {
    value: setting ? String(fs.existsSync(setting)) : 'n/a',
  }));
  const cfPath = resolveCfPath();
  outputChannel.appendLine(vscode.l10n.t('[1C Query] Resolved cfPath: "{path}"', { path: cfPath }));
  return cfPath;
}

/**
 * Открывает панель конструктора для уже найденного литерала запроса (`plan.kind
 * === 'open'`). Общая точка для команды палитры (курсор редактора) и клика по
 * command-ссылке в hover (курсор туда переставляется программно перед вызовом) —
 * обе точки входа должны создавать панель абсолютно одинаково, без двух копий
 * одного вызова.
 */
function openConstructorForPlan(
  context: vscode.ExtensionContext,
  cfPath: string,
  editor: vscode.TextEditor,
  plan: Extract<OpenPlan, { kind: 'open' }>
): void {
  createPanel(
    context,
    cfPath,
    outputChannel,
    {
      document: editor.document,
      selection: editor.selection,
      queryRange: plan.queryRange,
      documentVersion: editor.document.version,
      wrapAsBslString: true,
    },
    plan.queryText
  );
}

/**
 * Общая логика команд конструктора. `resultProcessing` определяет, что вставится
 * по «ОК» ТОЛЬКО для нового запроса (диалог «Создать новый?») — при открытии уже
 * существующего запроса (`plan.kind === 'open'`) обвязку Запрос/Выборка/Цикл никогда
 * не добавляем, каким бы пунктом меню команду ни вызвали: иначе повторное открытие
 * уже обработанного запроса задвоило бы код вокруг того, что пользователь дописал
 * внутри цикла.
 */
async function runQueryConstructorCommand(context: vscode.ExtensionContext, resultProcessing: boolean): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(vscode.l10n.t('Open a .bsl file.'));
    return;
  }
  const doc = editor.document;
  const offset = doc.offsetAt(editor.selection.active);
  const source = doc.getText();
  const plan = planQueryConstructor(source, offset);

  const cfPath = resolveCfPathWithLogging();

  if (plan.kind === 'open') {
    openConstructorForPlan(context, cfPath, editor, plan);
    return;
  }

  const answer = await vscode.window.showWarningMessage(
    vscode.l10n.t('No query text was found. Create a new query?'),
    { modal: true },
    vscode.l10n.t('Yes'),
    vscode.l10n.t('No')
  );
  if (answer !== vscode.l10n.t('Yes')) return;
  createPanel(context, cfPath, outputChannel, {
    document: doc,
    selection: editor.selection,
    queryRange: { start: offset, end: offset },
    documentVersion: doc.version,
    wrapAsBslString: true,
    resultProcessing,
  });
}

/**
 * Команда «New Builder (Preview)» (.claude/new_builder_roadmap.md). Save
 * support (2026-09-21): тепер, як і Classic-команда, шукає запит під курсором
 * і передає `SavedEditorState`/`initialQueryText` у панель — без цього
 * `insertText` не мав би куди й на підставі якої версії документа писати
 * назад. На відміну від `runQueryConstructorCommand`, НЕ показує модальний
 * діалог «Створити новий запит?» при відсутності запиту під курсором —
 * Canvas свідомо лишається "завжди відкривається" незалежно від контексту
 * (Phase 1 рішення), просто ТЕПЕР, якщо редактор є, все одно захоплює
 * курсорну позицію як порожній insertion range, щоб «Зберегти» працювало і
 * для щойно створеного запиту (не лише для вже існуючого під курсором).
 * Якщо активного редактора взагалі немає — панель відкривається без
 * `savedEditor`, точно як і раніше (Save тоді впаде на clipboard-fallback
 * `insertResult()` вже реалізує сам).
 */
function runQueryConstructorCanvasCommand(context: vscode.ExtensionContext): void {
  const cfPath = resolveCfPathWithLogging();
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    createCanvasPanel(context, cfPath, outputChannel);
    return;
  }
  const doc = editor.document;
  const offset = doc.offsetAt(editor.selection.active);
  const plan = planQueryConstructor(doc.getText(), offset);
  const savedEditor = {
    document: doc,
    selection: editor.selection,
    queryRange: plan.kind === 'open' ? plan.queryRange : { start: offset, end: offset },
    documentVersion: doc.version,
    wrapAsBslString: true,
  };
  createCanvasPanel(context, cfPath, outputChannel, savedEditor, plan.kind === 'open' ? plan.queryText : undefined);
}

/**
 * Обработчик command-ссылки из hover (`queryHoverProvider.ts`'s `genericHint`) —
 * офсет всегда указывает на уже найденный `findQueryAt`-хит, поэтому `plan.kind`
 * здесь всегда должен быть `'open'`; ветка `'prompt'` — защитный no-op на случай
 * гонки (документ изменился между построением hover и кликом), а не диалог
 * «создать новый запрос?» — здесь он неуместен.
 */
async function openConstructorFromRange(
  context: vscode.ExtensionContext,
  arg: { uri: string; offset: number }
): Promise<void> {
  const uri = vscode.Uri.parse(arg.uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const plan = planQueryConstructor(doc.getText(), arg.offset);
  if (plan.kind !== 'open') return;

  const cfPath = resolveCfPathWithLogging();
  openConstructorForPlan(context, cfPath, editor, plan);
}

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('1C Query Constructor');

  const cmdCanvas = vscode.commands.registerCommand('1c.queryConstructorCanvas', () =>
    runQueryConstructorCanvasCommand(context)
  );

  const cmd = vscode.commands.registerCommand('1c.queryConstructor', () =>
    runQueryConstructorCommand(context, false)
  );
  const cmdWithResult = vscode.commands.registerCommand('1c.queryConstructorWithResult', () =>
    runQueryConstructorCommand(context, true)
  );
  const cmdOpenFromRange = vscode.commands.registerCommand(OPEN_FROM_RANGE_COMMAND, (arg: { uri: string; offset: number }) =>
    openConstructorFromRange(context, arg)
  );
  const hoverProvider = vscode.languages.registerHoverProvider(
    { pattern: '**/*.bsl' },
    new QueryHoverProvider(context, outputChannel, resolveCfPath)
  );
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { pattern: '**/*.bsl' },
    new QueryCompletionProvider(context, outputChannel, resolveCfPath),
    '.',
    '&'
  );

  context.subscriptions.push(
    cmd,
    cmdWithResult,
    cmdOpenFromRange,
    cmdCanvas,
    hoverProvider,
    completionProvider,
    registerParseCommand(context, outputChannel),
    registerQueryDiagnostics(),
    outputChannel
  );

  // This only affects the Extension Development Host; release builds expose
  // Canvas through the explicit experimental setting in package.json.
  if (isCanvasPreviewEnabled(context.extensionMode === vscode.ExtensionMode.Development)) {
    void vscode.commands.executeCommand('1c.queryConstructorCanvas');
  }
}

export function deactivate(): void {}
