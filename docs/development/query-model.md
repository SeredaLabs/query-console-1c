# Query model and SDBL

`src/core/query/queryModel.ts` is the shared representation edited by Classic
and Canvas and consumed by `sdblGenerator`. `BatchDocument` orders statements;
`QueryDocument` holds UNION members. The shared store converts to/from flat active
state and optional saved snapshots. Parsing is intentionally tolerant: unsupported
expressions can remain opaque strings. There is no shared arbitrary-expression AST.

## Representation boundaries

Scalar fields, tabular projections and trailing fields are distinct ordered select
elements. `deriveProjectionFacts` combines their print order with C30 output names;
`selectElementNames` adapts these facts for existing consumers. A named projection
is not proof of schema completeness; unknown stars have no output name.
Temp producer columns use `deriveProducerColumns` over these facts. Its named
policies include all ordered scalar columns when there is no outer tabular
projection, including scalar trailing fields created by wildcard expansion.
Registry/Designer retain the scalar-head recovery boundary for nested output;
semantics retains the full projection. Unnamed stars are not Designer columns.
Duplicate explicit names are platform-invalid ([platform fixture](../../test/fixtures/platform/a2-duplicate-temp-columns.json)), so their recovery is one rule for every consumer: a case-insensitive suffix (`Код, код` → `Код, код1`).
Scalar UNION mapping remains separate.
Parser, Designer and semantics share create/append/drop transitions through
`tempTableLifetimes.ts`; Designer and semantics also share its lifecycle positions.
The newest preceding create shadows older lifetimes even after its drop; invalid
repeated creation must not revive an older schema in hover, table lists or package links.
Parser registry entries distinguish a defined name with unknown columns from an
absent definition; an unknown new schema shadows older/external/inferred metadata
without claiming an empty table or reusing old literal type markers.
A2 is closed (2026-10-14): the remaining differences are documented policies for
platform-invalid input or an unknown source shape.
The [policy audit](audits/a2-producer-policy-audit-2026-10-14.md) records the original
scalar-tail loss and fake Designer column, now covered by regression tests.
Trailing fields do not imply a nested projection. Duplicate explicit names never
reach a valid producer schema: the platform rejects them in every member.
Opaque HAVING, characteristics, grouping/report blocks and optional flags must
survive unrelated edits; preservation and unsafe-input rules are specified in the
[safety contract](contracts/safety-and-preservation.md).

The parser records `unsafeExtraArgs` when supported positional data cannot be
reconstructed. The semantic validator separately checks malformed expression
slots. Markers are not platform-validity verdicts and must survive transformations.
Strict opening uses `tryOpenBatch`; production designer loading adds the shared
comment-loss check in `tryOpenDesignerBatch`. Apply uses the shared gate, including
generated-output revalidation. Advisory snapshots have a distinct recovery mode.

## Section order

The generator emits:
`ВЫБРАТЬ` → (`ПОМЕСТИТЬ`/`ДОБАВИТЬ <ВТ>`) → `ИЗ` → `ГДЕ` → `СГРУППИРОВАТЬ ПО` →
`ИМЕЮЩИЕ` → `ОБЪЕДИНИТЬ [ВСЕ]` → `УПОРЯДОЧИТЬ ПО`/`АВТОУПОРЯДОЧИВАНИЕ` → `ИТОГИ` →
`ИНДЕКСИРОВАТЬ ПО` → `ДЛЯ ИЗМЕНЕНИЯ`.
The parser's SECTION_AFTER_FIELDS set terminates sections at depth zero without
requiring a complete grammar for every opaque expression. UNION compound sections
use the first member's column names and the last member's ORDER/TOTALS/INDEX slot.

## Required test directions

For a supported syntax change cover text → model, model → text, round-trip,
relevant comments/batches and user-visible WebView behavior. The
[canonical-output ADR](decisions/0004-querymodel-round-trip-contract.md) and
[corpus policy](corpus-testing.md) govern expected-output changes.

Parsing success is not 1C compiler certification or semantic equivalence.
[Testing/release](testing-and-release.md) describes the independent grammar
oracle's availability and the real gates. [Lexical facts](expression-lexical-contract.md)
require explicit unknowns and verbatim incomplete expressions rather than guessed
rewrites. [User limitations](../en/limitations.md) describe the supported surface.
