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

Do not treat a successful parse as certification by the 1C platform. The
tree-sitter oracle strengthens local validation when its WASM fixture is
present, but `test/fixtures/tree-sitter-sdbl.wasm` is not committed and the
normal CI workflow does not build it. In an ordinary checkout the helper emits
an explicit skip warning and only the repository parser/structural checks and
regression corpus run. Making the independent grammar oracle reproducible in
CI is still verification work, not an already active gate.

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

Virtual-table parsing records `unsafeExtraArgs` in the generic fallback and
modeled calculation-register overflow paths; Apply blocks marked models.
Nonempty extra `Обороты`/`ОстаткиИОбороты` arguments (platform-invalid RP04/RP05)
are marked too; trailing empty slots are accepted. See the [debt ledger](technical-debt.md).
Preserve existing markers through transformations and tests.

A structurally malformed custom/raw expression (unbalanced parens, a dangling
operator, an unclosed `ВЫБОР…КОНЕЦ`, and similar) is a separate, narrower check
— `findMalformedCustomExpressions` (`semanticValidator.ts`) — that also blocks
Apply; see [known issues](known-issues.md) for its exact scope and deliberate
non-goals.

Current user-facing boundaries are in the [limitations guide](../en/limitations.md).

## Apply and expression boundaries

Classic and Canvas share `findStaticApplyBlocker`/`decideApply` in
`src/webview/applyGate.ts`: original model unsafe/malformed checks, then generated
text parsed and checked for selected table/field, alias and UNION constraints.
`validateBatchText` and `tryOpenBatch` reuse `tryParseBatch` and semantic validation.
This certifies acceptance by the supported local checks, not full platform syntax
or input/output semantic equivalence. No original-query comparison is performed.
The structural expression acceptor deliberately ignores operator precedence and
leaves template markers unjudgeable; boolean preservation is currently verified
by targeted regression truth tables and recorded canonical examples.

Opaque text is intentional, but repeatedly reinterpreting its lexical structure
is architecture debt (A1). CanonicalToken/ExpressionTokens is a proposed shared
boundary, not implemented, and does not require replacing the runtime parser.
