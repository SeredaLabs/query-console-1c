# Query core route

Load for syntax, generation, schema or IDE questions. Start at the paths below;
use `rg` to locate callers and tests, then inspect the actual implementation.

| Responsibility | Entry / next source | Existing authority |
|---|---|---|
| SDBL tokens → query/batch model | [sdblLexer.ts](../../../src/core/query/sdblLexer.ts), [sdblParser.ts](../../../src/core/query/sdblParser.ts): `parseBatch` | [Grammar parity](../grammar-parity.md), [query model](../query-model.md) |
| Strict open / validation | [validateBatch.ts](../../../src/core/query/validateBatch.ts): `tryOpenBatch` | [Safety contract](../contracts/safety-and-preservation.md) |
| Model → text | [sdblGenerator.ts](../../../src/core/query/sdblGenerator.ts): `generateBatch` | [Round-trip ADR](../decisions/0004-querymodel-round-trip-contract.md) |
| Producer columns | [producerColumns.ts](../../../src/core/query/producerColumns.ts): `deriveProducerColumns` | [Query model](../query-model.md) |
| Temp-table visibility | [tempTableLifetimes.ts](../../../src/core/query/tempTableLifetimes.ts), [tempTableSemantics.ts](../../../src/core/query/tempTableSemantics.ts) | [Architecture](../architecture.md) |
| Tolerant IDE analysis | [buildSemanticSnapshot.ts](../../../src/core/semantic/buildSemanticSnapshot.ts) | [Architecture](../architecture.md) |

Temp-table route: parser registry, semantic adapter and Designer
[snapshots.ts](../../../src/webview/state/queryStore/snapshots.ts) consume the
shared helpers; inspect their policy arguments, not just the shared function.
Start tests at `test/unit/producerColumns.a2.test.ts`,
`producerColumnsScope.a2.test.ts`, `tempTableLifetimes.a2.test.ts`,
`buildSemanticSnapshot.test.ts`.

For a parser change, follow strict validation and tolerant IDE callers
separately. Core must not acquire VS Code/WebView dependencies; the
[architecture](../architecture.md) owns exceptions and module initialization
constraints. The [lexical contract](../expression-lexical-contract.md) owns
expression rules. Search results do not prove preservation or grammar parity.
