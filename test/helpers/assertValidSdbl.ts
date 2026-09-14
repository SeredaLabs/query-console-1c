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

// Every `assertValidSdbl` call across the suite (~30+ call sites in
// sdblParser.fixtures.test.ts/sdblGenerator.test.ts) silently no-oped when the
// grammar wasn't vendored, with zero signal — CI showed all of them green
// without the independent grammar oracle ever actually running, a false sense
// of coverage. `tree-sitter-sdbl.wasm` is not committed to this repo and no
// CI workflow builds it (`tooling/scripts/build-wasm.sh` needs an
// emscripten + tree-sitter-cli toolchain not installed in CI) — making the
// oracle an actual required gate is tracked as separate follow-up work, not
// done here. This is only the honest signal: warn once so anyone reading
// test output can tell the oracle was skipped rather than assuming it ran.
if (!sdblGrammarAvailable) {
  console.warn(
    '[assertValidSdbl] tree-sitter-sdbl.wasm not vendored (see tooling/scripts/build-wasm.sh) — ' +
    'independent SDBL grammar oracle is SKIPPED for this entire test run; only the golden corpus is checked.'
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
