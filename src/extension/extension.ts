import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createPanel } from './panel';
import { resolveCfPath } from './resolveCfPath';
import { registerParseCommand } from './parseCommand';
import { planQueryConstructor, type OpenPlan } from './queryConstructorPlan';
import { OPEN_FROM_RANGE_COMMAND } from './openFromRangeCommand';
import { QueryHoverProvider } from './queryHoverProvider';
import { QueryCompletionProvider } from './queryCompletionProvider';

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
    '.'
  );

  context.subscriptions.push(
    cmd,
    cmdWithResult,
    cmdOpenFromRange,
    hoverProvider,
    completionProvider,
    registerParseCommand(context, outputChannel),
    outputChannel
  );
}

export function deactivate(): void {}
