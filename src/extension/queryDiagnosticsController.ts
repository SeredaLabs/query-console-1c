/**
 * Адаптер и жизненный цикл диагностики «запрос не откроется в конструкторе» —
 * ядро проверки чистое (`queryDiagnostics.ts`), здесь только `vscode.Diagnostic` и
 * подписки на события документа.
 *
 * Важные решения (см. `.claude/scratch_diagnostics_prompt.md` и обзор второй
 * моделью в этой же сессии):
 * - Severity: Warning, не Error — `parseBatch` успешный НЕ гарантирует, что запрос
 *   откроется (реальное открытие ещё проверяет семантику через `tryOpenBatch`), и
 *   неуспешный не гарантирует ошибку на настоящей платформе 1С (наш парсер — не
 *   полная авторитетная грамматика). Формулировка сообщения обходится без
 *   категоричного "syntax error".
 * - Известный, осознанный false-positive: запрос, собранный конкатенацией строк
 *   (`Текст = "ВЫБРАТЬ …"; Текст = Текст + "ИЗ …";`) — первый фрагмент сам по себе
 *   не разбирается и получит предупреждение, хотя это обычный корректный BSL. Без
 *   полноценного AST BSL это неустранимо; митигируется severity=Warning,
 *   формулировкой и настройкой `queryConsole.queryDiagnosticsEnabled`.
 * - Дебаунс ~400ms на документ + проверка «не устарел ли результат» (версия
 *   документа и номер поколения запроса) перед публикацией — тот же класс гонки,
 *   что уже стерегут в `insertResult.ts` через `documentVersion`.
 */

import * as vscode from 'vscode';
import { computeQueryParseProblems, type QueryParseProblem } from './queryDiagnostics';

const DIAGNOSTIC_SOURCE = 'queryConsole1c';
const DIAGNOSTIC_CODE = 'designer-parse';
const DEBOUNCE_MS = 400;

function isQueryDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'bsl' || document.uri.path.toLowerCase().endsWith('.bsl');
}

function isEnabled(): boolean {
  return vscode.workspace.getConfiguration('queryConsole').get<boolean>('queryDiagnosticsEnabled', true);
}

function toDiagnostic(document: vscode.TextDocument, problem: QueryParseProblem): vscode.Diagnostic {
  const range = new vscode.Range(document.positionAt(problem.start), document.positionAt(problem.end));
  const diagnostic = new vscode.Diagnostic(
    range,
    vscode.l10n.t('Query Designer cannot parse this query: {error}', { error: problem.message }),
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = DIAGNOSTIC_CODE;
  return diagnostic;
}

interface DocState {
  timer: ReturnType<typeof setTimeout>;
  generation: number;
}

/**
 * Регистрирует диагностику и возвращает `vscode.Disposable` для
 * `context.subscriptions` (закрывает коллекцию и снимает подписки при деактивации).
 */
export function registerQueryDiagnostics(): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const states = new Map<string, DocState>();

  function clearState(key: string): void {
    const state = states.get(key);
    if (state) clearTimeout(state.timer);
    states.delete(key);
  }

  function runCheck(document: vscode.TextDocument, versionAtSchedule: number, generation: number): void {
    const key = document.uri.toString();
    const state = states.get(key);
    if (!state || state.generation !== generation) return; // вытеснено более новым изменением
    if (document.isClosed || document.version !== versionAtSchedule) return; // устарело
    const problems = computeQueryParseProblems(document.getText());
    collection.set(document.uri, problems.map((p) => toDiagnostic(document, p)));
  }

  function schedule(document: vscode.TextDocument, delayMs: number): void {
    if (!isQueryDocument(document)) return;
    if (!isEnabled()) return;
    const key = document.uri.toString();
    const prevGeneration = states.get(key)?.generation ?? 0;
    clearState(key);
    const generation = prevGeneration + 1;
    const versionAtSchedule = document.version;
    const timer = setTimeout(() => runCheck(document, versionAtSchedule, generation), delayMs);
    states.set(key, { timer, generation });
  }

  function forget(document: vscode.TextDocument): void {
    clearState(document.uri.toString());
    collection.delete(document.uri);
  }

  function recheckAllOpen(): void {
    for (const document of vscode.workspace.textDocuments) {
      if (isQueryDocument(document)) schedule(document, 0);
    }
  }

  const subscriptions: vscode.Disposable[] = [
    collection,
    vscode.workspace.onDidOpenTextDocument((document) => schedule(document, 0)),
    vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document, DEBOUNCE_MS)),
    vscode.workspace.onDidCloseTextDocument((document) => forget(document)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('queryConsole.queryDiagnosticsEnabled')) return;
      if (isEnabled()) {
        recheckAllOpen();
      } else {
        for (const key of states.keys()) clearState(key);
        collection.clear();
      }
    }),
  ];

  recheckAllOpen();

  return vscode.Disposable.from(...subscriptions);
}
