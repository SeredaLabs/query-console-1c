import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createPanel } from './panel';
import { resolveCfPath } from './resolveCfPath';
import { registerParseCommand } from './parseCommand';
import { planQueryConstructor } from './queryConstructorPlan';

let outputChannel: vscode.OutputChannel;

/** Резолвит путь к выгрузке конфигурации и логирует диагностику в канал вывода. */
function resolveCfPathWithLogging(): string {
  const config = vscode.workspace.getConfiguration('queryConsole');
  const setting = config.get<string>('metadataPath') ?? '';
  outputChannel.appendLine(`[1C Query] metadataPath setting: "${setting}"`);
  outputChannel.appendLine(`[1C Query] setting exists on disk: ${setting ? fs.existsSync(setting) : 'n/a'}`);
  const cfPath = resolveCfPath();
  outputChannel.appendLine(`[1C Query] resolved cfPath: "${cfPath}"`);
  return cfPath;
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
    vscode.window.showWarningMessage('Откройте .bsl файл');
    return;
  }
  const doc = editor.document;
  const offset = doc.offsetAt(editor.selection.active);
  const source = doc.getText();
  const plan = planQueryConstructor(source, offset);

  const cfPath = resolveCfPathWithLogging();

  if (plan.kind === 'open') {
    createPanel(
      context,
      cfPath,
      outputChannel,
      {
        document: doc,
        selection: editor.selection,
        queryRange: plan.queryRange,
        documentVersion: doc.version,
        wrapAsBslString: true,
      },
      plan.queryText
    );
    return;
  }

  const answer = await vscode.window.showWarningMessage(
    'Не найден текст запроса. Создать новый запрос?',
    { modal: true },
    'Да',
    'Нет'
  );
  if (answer !== 'Да') return;
  createPanel(context, cfPath, outputChannel, {
    document: doc,
    selection: editor.selection,
    queryRange: { start: offset, end: offset },
    documentVersion: doc.version,
    wrapAsBslString: true,
    resultProcessing,
  });
}

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('1C Query Constructor');

  const cmd = vscode.commands.registerCommand('1c.queryConstructor', () =>
    runQueryConstructorCommand(context, false)
  );
  const cmdWithResult = vscode.commands.registerCommand('1c.queryConstructorWithResult', () =>
    runQueryConstructorCommand(context, true)
  );

  context.subscriptions.push(cmd, cmdWithResult, registerParseCommand(outputChannel), outputChannel);
}

export function deactivate(): void {}
