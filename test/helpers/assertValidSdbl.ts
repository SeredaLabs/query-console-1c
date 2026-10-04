import * as ParserModule from 'web-tree-sitter';
import * as fs from 'fs';
import * as path from 'path';

// web-tree-sitter (0.22) экспортируется как CommonJS-функция с .init/.Language.
// Под vitest (ESM-interop) `import Parser from ...` даёт undefined, поэтому
// берём сам модуль как конструктор Parser.
const Parser = (ParserModule as any).default ?? (ParserModule as any);

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const SDBL_WASM = path.join(FIXTURES, 'tree-sitter-sdbl.wasm');

/**
 * Грамматика SDBL вендорится отдельно (tooling/scripts/build-wasm.sh) и не коммитится.
 * В окружениях без неё валидацию пропускаем, чтобы тесты текста запроса не
 * падали из-за отсутствия артефакта сборки.
 */
export const sdblGrammarAvailable = fs.existsSync(SDBL_WASM);

// Optional external grammar oracle (V2, dev tooling): a development-only
// differential signal, never a verdict and never required by normal CI. When
// it is absent, assertValidSdbl is a no-op, so tests whose only assertion is
// this oracle must use `it.skipIf(!sdblGrammarAvailable)` to report *skipped*.
// Warn once per module load.
if (!sdblGrammarAvailable) {
  console.warn(
    '[assertValidSdbl] tree-sitter-sdbl.wasm not vendored (see tooling/scripts/build-wasm.sh) — ' +
    'external SDBL grammar oracle is unavailable; differential grammar checks are skipped. ' +
    "Query Console's own test, corpus, fuzz and validation gates are unaffected."
  );
}

let _parser: Parser | null = null;

async function getParser(): Promise<Parser> {
  if (_parser) return _parser;
  await Parser.init({
    locateFile: (file: string) => path.join(FIXTURES, file),
  });
  const Lang = await Parser.Language.load(
    path.join(FIXTURES, 'tree-sitter-sdbl.wasm')
  );
  _parser = new Parser();
  _parser.setLanguage(Lang);
  return _parser;
}

export async function assertValidSdbl(text: string): Promise<void> {
  if (!sdblGrammarAvailable) return; // грамматика не вендорена — пропускаем
  const parser = await getParser();
  const tree = parser.parse(text);
  if (tree.rootNode.hasError()) {
    throw new Error(
      `SDBL parse error in:\n${text}\n\nAST:\n${tree.rootNode.toString()}`
    );
  }
}
