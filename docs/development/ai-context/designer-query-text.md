# Designer and Query Text v2 route

| Scenario | Source route to verify |
|---|---|
| Host loads query | [useDesignerSession.ts](../../../src/webview/hooks/useDesignerSession.ts) → [openDesignerBatch.ts](../../../src/webview/openDesignerBatch.ts): `tryOpenDesignerBatch` → core `tryOpenBatch` → `LOAD_BATCH` |
| Query Text v2 analysis | [ConstructorView.tsx](../../../src/webview/components/ConstructorView.tsx) → [QueryTextDialog.tsx](../../../src/webview/components/QueryTextDialog.tsx) → [queryAnalysisService.ts](../../../src/core/query/queryAnalysisService.ts): `analyze` |
| Text edit accepted into Designer | `ConstructorView.handleApplyQueryEdit` → `tryOpenDesignerBatch` → shared state |
| Model applied to editor | [App.tsx](../../../src/webview/App.tsx) → [computeBatchText.ts](../../../src/webview/computeBatchText.ts) → [applyGate.ts](../../../src/webview/applyGate.ts): `decideApply` → host message |

State entry: [queryStore.ts](../../../src/webview/state/queryStore.ts); its
directory contains the reducer helpers. Query Text analysis and final Apply
are different boundaries. Follow the actual handlers rather than inferring a
runtime flow from an import edge. For host writes, load the
[extension route](extension-metadata.md) only when needed.

Tests: `test/unit/queryAnalysisService.test.ts`, `openDesignerBatch.test.ts`,
`computeBatchText.test.ts`, `applyGate.test.ts`; Classic text-dialog flows are in
[webview.spec.ts](../../../test/e2e/webview.spec.ts).
Use `rg -n 'queryTextEditorV2|Текст запроса' test/e2e/webview.spec.ts` to select cases.

Do not restate contracts here: [safety and preservation](../contracts/safety-and-preservation.md),
[WebView](../webview.md), [architecture](../architecture.md) own the rules.
Canvas shares state/gates; its scope lives in the
[capability matrix](../../design/new-builder/feature-baseline.md).
