# Safety and preservation contract

Current invariants enforced by the shared parser/validator, designer session,
store, generator and Apply gate. [Lexical facts](../expression-lexical-contract.md)
have their own contract; [model shape](../query-model.md),
[current debt](../technical-debt.md) and [verification gates](../testing-and-release.md)
have separate owners. These checks are bounded local acceptance, not a complete
1C compiler or an input/output semantic-equivalence proof.

## Original text and designer loading

Classic and Canvas use `tryOpenDesignerBatch` through `useDesignerSession`.
`loadModel` is a host message containing **text**, not a prevalidated model.
Strict parsing/selected semantic checks run before LOAD_BATCH. A failed load
leaves the prior editable model and original BSL editor text intact.

With `preserveComments`, the wrapper compares **only exact comment text and
occurrence counts** in the input and initial generated model. Repeated identical
comments count separately; slash-only package separators are excluded. It does
not compare source positions, section anchors or relative placement. A comment
relocated by the binder counts as preserved if its text occurrence survives.
Before the bounded C17 condition change, a standalone `// WHERE note` between
`ГДЕ` and its condition was bound to `comments.afterFrom` and generated after
`ИЗ`. It now belongs to the condition. The warning check itself remains text/count
only; retention does not prove the original location or contextual meaning.

Missing occurrences produce a warning and a validated candidate requiring
explicit confirmation. `lost` lists all missing occurrences in input order;
identical missing comments remain repeated. Both UIs and Classic text editors
show the first five verbatim as monospace text, plus a localized remaining count.
The same modal's Cancel button receives initial focus, Escape cancels, focus stays
inside, and background editing/Save is blocked. Only confirmation authorizes
LOAD_BATCH; a newer host load supersedes the pending candidate. Cancel closes the
designer without insertion. Loading itself never changes the original editor text;
Save/OK remains a separate checked action.

Classic manual-text Apply uses the same detection/dialog before replacing its
model. Cancel/Escape leaves both prior model and draft text intact; confirmation
loads the candidate but does not write the BSL editor. Generation/lexing failures
and parse/semantic errors remain errors with no confirmation override. The check
detects loss; it does not prove placement, equivalence or universal preservation.

Regressions: [session confirmation/supersession](../../../test/unit/designerSession.commentLoss.test.ts),
[openDesignerBatch](../../../test/unit/openDesignerBatch.test.ts),
[invalidInputPreservation](../../../test/unit/invalidInputPreservation.test.ts),
Classic/Canvas load-failure and text-edit browser cases.

## Shared state and preserve-only capabilities

Both UIs edit the same QueryState/actions, convert to QueryModel through the
same store/snapshot helpers and use `assembleBatch`/`generateBatch`. Canvas UI
selection, coordinates, collapse and local drafts do not create another domain
model or host session. Canvas imports shared Classic components/helpers one-way.

PRESERVE-ONLY means a successfully loaded supported representation survives an
**unrelated edit → Save → reopen**, including through snapshots. It does not
promise a dedicated editor, arbitrary raw-text equality, support for every
platform syntax, or successful loading of known unsafe input. Explicit user
changes may intentionally remove content. Unsafe/malformed inputs remain subject
to refusal. HAVING, trailing fields and characteristics must not disappear during
flat conversion or restoring older snapshots; absent optional properties reset
instead of leaking from the prior query.

The [Canvas capability matrix](../../design/new-builder/feature-baseline.md)
lists the actual families. Advanced tabular/trailing UNION projections suppress
scalar-only mapping edits and display a preserve-only notice. First-member
projection names and last-member ORDER/TOTALS/INDEX controls share the existing
compound selector/actions; active member/focus stays intact.

Recursive source editing uses an isolated reducer draft. Cancel leaves the
parent unchanged; Back validates before UPDATE_SUBQUERY_TABLE. The mounted
parent retains context and cannot Save while a draft is open. Referenced scalar
exports cannot be implicitly pruned; navigation paths survive when their head
export remains. Package-derived temp schemas belong to their producers; manual
external-temp editing must not overwrite them.

Regressions: [store corpus parity](../../../test/unit/queryStore.corpusParity.test.ts),
[source drafts](../../../test/unit/sourceQueryDraft.test.ts),
[compound sections](../../../test/unit/compoundSections.test.ts), Canvas browser
preservation/cancel/nested Save and real-host insertion cases.

## Comment boundaries

Bound SELECT/FROM/field comments use QueryComments and the comment binder.
Comment-aware argument rendering covers VT, accounting-register, selection-
criterion and ПЕРИОДАМИ slots: on the argument/comma line comments trail that
argument; standalone comments lead the next argument, or trail the final one.
The comma is emitted before a trailing comment and closing delimiters follow
on a safe line. Raw continuation indentation is retained; omitted argument
content does not manufacture comment slots. Reopening is stable.

WHERE/HAVING edge comments are stored on their condition as optional
`commentLeading` / `commentTrailing` arrays and emitted on separate lines.
Comments inside an expression stay in its raw text; formatting is bypassed and
Boolean conjunct boundaries are wrapped without rewriting code or comments.
HAVING's generated `И` follows a commented conjunct on its own line, so `//`
cannot swallow it. Parameter conditions with edge comments and structured IN
subqueries retain their existing model; internal comments in an ordinary
non-subquery condition use the custom-expression representation. Source and
condition subqueries inherit the parsing mode, and parser-owned source positions
keep the binder from duplicating these comments. Comment text/counts are retained;
original placement and layout are not promised. Save/reopen is stable in the
covered cases. The explicit strip-comments view removes these condition anchors
and raw-text comments recursively without mutating the preserving model.

JOIN, field, grouping and TOTALS raw slices can still lose comments in core
parsing/generation (C17); the designer warns before loading and asks for explicit consent. Saving
a confirmed candidate can remove those comments. **Consent to comment loss is not
PRESERVE-ONLY support.** Classic's preserve-comments toggle deliberately changes
the user's output policy; Canvas keeps preservation enabled. Parsing without
`preserveComments` is a separate core API mode, not evidence that user comments
are safe to discard in production loading. Comments inside strings are strings.

Regressions: [comment round-trip](../../../test/unit/commentsRoundTrip.test.ts),
[condition comments](../../../test/unit/conditionComments.c17.test.ts),
[raw argument comments and known-loss cells](../../../test/unit/rawSliceComments.c16.test.ts),
[store comment toggle](../../../test/unit/queryStore.stripComments.test.ts).

## Apply refusal

`findStaticApplyBlocker` checks the assembled input model continuously; Save/OK
refuses unsafe VT arguments or structurally malformed custom/raw expressions.
`decideApply` refuses empty output, generation errors and existing blockers,
then validates generated text and applies the malformed-expression check again
to its reparsed model. This last check prevents a generated wrapper/comment
from swallowing later sections despite tolerant parser acceptance.

Only accepted generated text reaches `insertText`. The shared host bridge then
performs its existing editor/session/stale-range checks before insertion. No
recovery text is an Apply source. Invalid input may be rejected on open or
opened for inspection with Apply blocked; it must not be silently rewritten
by an unchecked Save.

The malformed walker covers custom fields/JOIN/conditions, VT expression slots,
ПЕРИОДАМИ date operands, tabular castPrefix and non-custom comparison operands.
It deliberately excludes DCS wrappers/aliases, VT order/limit/lists/periodicity/
fill method, BETWEEN RHS and characteristics. Lexically unjudgeable template
markers and function arity are not a complete grammar verdict. Selected semantic
validation checks table/field/alias/UNION constraints where schema is known;
opaque expressions, condition-subquery fields and incomplete temp schemas remain
fail-open. Exclusions are bounded behavior, not platform certification.

Regressions: [generated output](../../../test/unit/applyGeneratedOutput.test.ts),
[unsafe input](../../../test/unit/invalidInputPreservation.test.ts),
[known alias-negation blocker](../../../test/unit/canvasPreserveBoundaries.test.ts),
[C11 slot evidence](../audits/c11-malformed-slots-2026-09-29.md) and real-host
insertion/stale-session tests.

## Advisory semantic recovery

Strict parse/generation/Apply and IDE assistance have different consumers.
`buildSemanticSnapshotFromText` may repair lexical spans or parentheses and
blank broken sections to retain advisory aliases/parameters. Repairs preserve
original offsets or map inserted positions back; snapshot completeness is
`complete`, `recovered` or `unavailable`. The only materialized index is
`symbolsById`; scopes are resolved on demand with source-map depth/ranges.

`complete` means parsing did not throw, not that every opaque nested condition
was indexed. Unterminated strings can consume following statements. Recovery
must neither replace user-authored text nor authorize a generation rewrite,
LOAD_BATCH or Apply. Unknown metadata/schema must stay unknown instead of
manufacturing negative field diagnoses.

Regressions: [recoveryS2](../../../test/unit/recoveryS2.test.ts),
[offset invariants](../../../test/unit/recoveryOffsetInvariant.test.ts),
[semantic snapshots](../../../test/unit/semanticSnapshot.test.ts).
