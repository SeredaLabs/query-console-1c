import { parseBatch } from '../../src/core/query/sdblParser';
import { tryParseBatch } from '../../src/core/query/validateBatch';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';

const [mode, text] = process.argv.slice(2);
let result: unknown;
if (mode === 'parse') {
  let error: string | undefined;
  try { parseBatch(text); } catch (e) { error = (e as Error).message; }
  result = { error, attempt: tryParseBatch(text) };
} else if (mode === 'diagnostics') {
  result = computeQueryParseProblems('Запрос.Текст = "' + text.replace(/\n/g, '\n|') + '";');
} else if (mode === 'snapshot') {
  result = { completeness: buildSemanticSnapshotFromText(1, text).completeness };
} else {
  throw new Error(`Unknown worker mode: ${mode}`);
}
process.stdout.write(JSON.stringify(result));
