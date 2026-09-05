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

## Safety markers

Virtual-table parsing records `unsafeExtraArgs` where positional arguments cannot
be represented losslessly. The UI blocks apply for marked models. Preserve the
marker through transformations and tests.

Current user-facing boundaries are in the [limitations guide](../en/limitations.md).
