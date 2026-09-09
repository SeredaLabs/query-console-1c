# Query model and SDBL

`src/core/query/queryModel.ts` is the shared representation edited by the UI and
consumed by the generator. `sdblParser.ts` is intentionally tolerant: unsupported
expressions can remain opaque so the visual editor does not need to implement the
entire platform grammar.

## Required test directions

For a supported syntax change, cover:

1. text to model;
2. model to text;
3. parse/generate round-trip;
4. relevant comments and batches;
5. WebView behavior when user-visible.

Do not treat a successful parse as certification by the 1C platform. The optional
tree-sitter oracle strengthens local validation when its WASM fixture is present,
but the repository parser and regression corpus remain separate evidence.

## Section order

The generator (`sdblGenerator.ts`) emits sections in a fixed order:
`ВЫБРАТЬ` → (`ПОМЕСТИТЬ`/`ДОБАВИТЬ <ВТ>`) → `ИЗ` → `ГДЕ` → `СГРУППИРОВАТЬ ПО` →
`ИМЕЮЩИЕ` → `ОБЪЕДИНИТЬ [ВСЕ]` → `УПОРЯДОЧИТЬ ПО`/`АВТОУПОРЯДОЧИВАНИЕ` → `ИТОГИ` →
`ИНДЕКСИРОВАТЬ ПО` → `ДЛЯ ИЗМЕНЕНИЯ`. The parser's `SECTION_AFTER_FIELDS` keyword
set (`sdblParser.ts`) mirrors this: any of these keywords found at paren/brace
depth 0 terminates whatever section came before it, which is what lets the
parser recover a section boundary without a full grammar for every possible
expression inside it.

## Comment preservation

Query text comments round-trip through a dedicated `QueryComments` shape on
`QueryModel` (`beforeSelect`, `afterFrom`, and per-field
leading/trailing comment arrays), populated by `commentBinder.ts` during parse
and re-emitted by the generator at the same positions. This is opt-out at the
UI level ("Сохранять комментарии", on by default), not opt-in — cover any
change here with both parse and round-trip tests (`test/unit/comment*.test.ts`).

## Safety markers

Virtual-table parsing records `unsafeExtraArgs` where positional arguments cannot
be represented losslessly. The UI blocks apply for marked models. Preserve the
marker through transformations and tests.

A structurally malformed custom/raw expression (unbalanced parens, a dangling
operator, an unclosed `ВЫБОР…КОНЕЦ`, and similar) is a separate, narrower check
— `findMalformedCustomExpressions` (`semanticValidator.ts`) — that also blocks
Apply; see [known issues](known-issues.md) for its exact scope and deliberate
non-goals.

Current user-facing boundaries are in the [limitations guide](../en/limitations.md).
