# AGENTS.md

## Purpose

Persistent rules for coding agents working in this repository.

These rules are universal. Project-specific architecture, migration plans, feature requirements, and PR scopes belong in separate spec/task files.

## 1. Understand Before Changing

Before changing code, understand the current implementation first.

The current repository is the primary source of truth for current behavior. If repository behavior, tests, task text, or architecture docs contradict each other, identify the contradiction explicitly before making a risky change.

Do not silently guess.

## 2. Implement Only the Requested Task

Do not automatically continue into:
- the next roadmap item;
- adjacent refactors;
- cleanup;
- optimizations;
- dependency upgrades;
- architecture improvements;
- unrelated bugs.

If the task appears to require broader scope, identify the dependency and stop at the safest practical boundary instead of silently expanding scope.

## 3. Prefer the Smallest Safe Change

Avoid speculative abstractions, premature generalization, broad rewrites, unnecessary interfaces, unrelated renaming, and formatting noise.

A reviewer should be able to answer: what changed, and why?

## 4. Preserve Existing Working Behavior

Existing behavior stays unchanged unless the task explicitly requires changing it.

Before modifying behavior:
1. identify the current implementation;
2. identify tests protecting it;
3. capture the relevant baseline;
4. identify what must remain unchanged.

Do not remove compatibility, fallback, migration, or legacy behavior unless removal is explicitly in scope.

## 5. Read Before Edit

Before editing a subsystem, inspect:
- implementation;
- direct callers;
- direct dependencies;
- tests;
- fixtures;
- scripts;
- nearby documentation.

Do not change a function based only on its name or signature.

## 6. Plan Before Implementing

For non-trivial work, first provide a concise plan containing:
1. current behavior;
2. files/functions involved;
3. current tests;
4. smallest intended change;
5. behavior that must remain unchanged;
6. expected tests;
7. risks/uncertainties.

Do not turn the plan into an architecture redesign.

## 7. Tests Belong in the Same Task

Do not implement first and promise tests later.

Prefer:

```text
understand
→ baseline
→ identify/add regression test
→ implement
→ run tests
```

If fixing a bug, add a regression test whenever practical.

## 8. Run Existing Relevant Tests First

Before risky changes, run the most relevant existing tests when practical to separate pre-existing failures from regressions introduced by the task.

Do not ignore new failures.

## 9. Regression Gate

Typical order:

```text
typecheck / compile
↓
targeted unit tests
↓
affected regression tests
↓
broader relevant suite
↓
corpus / fixtures if applicable
↓
E2E if user-visible behavior changed
```

Run the strongest relevant gate for the changed subsystem.

## 10. Never Hide Regressions

Never make tests green by blindly updating:
- snapshots;
- golden files;
- generated fixtures;
- corpus baselines;
- classification files;
- expected serialized output.

If expected output changes, explain what changed, why, why the new result is correct, and how many cases are affected.

## 11. Large Baseline Changes Need a Summary

When many outputs change, provide a summary with:
- number of changed cases;
- affected categories;
- representative before/after examples;
- classification/status transitions;
- expected reason.

“Tests pass” is not enough when hundreds of expected outputs changed.

## 12. Failure Handling

Unexpected failure must leave the system in the safest practical state.

For persistent state, generated artifacts, caches, migrations, files, or user content:
- avoid partial destructive updates;
- preserve recoverable prior state where required;
- surface controlled errors;
- do not silently continue after integrity-critical failures.

## 13. Destructive Operations Are High Risk

Before deleting or recursively replacing data:
1. verify the target;
2. verify ownership when relevant;
3. verify the task requires it;
4. preserve rollback/recovery requirements.

Never infer ownership from a familiar name alone.

## 14. Migration Safety

Prefer:

```text
introduce boundary
→ add new implementation
→ validate
→ switch
→ remove old implementation
→ cleanup separately
```

Do not combine new implementation + production switch + old removal + cleanup unless explicitly required.

## 15. Cleanup Is Separate

Do not mix cleanup into feature/migration work unless necessary.

Cleanup includes dead helpers, obsolete adapters, temporary flags, broad renaming, file reorganization, and style-only refactors.

## 16. Dependency Discipline

Do not add a dependency unless materially required.

Do not replace a library or framework because another option is newer or cleaner.

If adding a dependency, justify why the existing stack is insufficient.

## 17. Architecture Restraint

Do not replace core technologies without explicit scope or strong evidence.

Examples:
- UI framework;
- state management;
- parser framework;
- storage engine;
- worker/process architecture;
- programming language;
- database.

Preference alone is not evidence.

## 18. Measure Before Optimizing

For performance work:
1. identify the user-visible/resource problem;
2. capture baseline;
3. define workload;
4. make the smallest relevant change;
5. measure again.

Avoid arbitrary thresholds unless supported by requirements or measurements.

## 19. Do Not Invent Requirements

Do not invent:
- arbitrary limits;
- release-count gates;
- time delays;
- compatibility promises;
- APIs no current consumer needs.

If a spec leaves an implementation detail open, choose the simplest passing solution.

## 20. Reuse Existing Abstractions First

Before creating a new abstraction:
1. search for an existing one;
2. inspect consumers;
3. reuse/extend when appropriate.

Do not create parallel abstractions with overlapping responsibilities without a concrete need.

## 21. Avoid Premature Generalization

Prefer a small interface serving current consumers over a large generic API for hypothetical future consumers.

## 22. Preserve Layer Boundaries

Respect existing architecture unless the task intentionally changes it.

Avoid introducing UI/editor/filesystem dependencies into lower-level core code without explicit intent.

## 23. Keep Diffs Focused

Do not reformat or reorder unrelated code.

Functional changes should be easy to review.

## 24. Treat Public/Persisted Contracts Carefully

For exported APIs, messages, persisted formats, cache formats, settings, CLI behavior, or protocols:
- identify compatibility impact;
- version/migrate if needed;
- add tests;
- document intentional breaking changes.

## 25. User Data Safety

Never knowingly overwrite, discard, or normalize away user-authored content when preservation is uncertain.

When preservation cannot be guaranteed, fail safely.

## 26. Error Handling

Expected failures should produce controlled behavior.

Unexpected exceptions should not leave partial user-facing state where avoidable and should preserve recoverability.

Important failure paths should have regression tests.

## 27. Documentation and Comments

Comments should explain non-obvious invariants, safety constraints, migration behavior, or intentional technical debt.

Do not add comments that merely restate code.

Update docs when behavior or developer workflow materially changes.

## 28. Temporary Code

Temporary flags, comparison paths, instrumentation, and adapters must be identifiable as temporary.

Do not let temporary infrastructure become permanent by accident.

## 29. Stop Conditions

Stop and report instead of guessing when:
- repository materially contradicts the task;
- required behavior cannot be determined safely;
- the task would violate an invariant;
- scope expands into another subsystem/task;
- migration cannot remain rollback-safe;
- tests expose an unexplained regression;
- user data would be silently discarded;
- the change requires an unapproved architecture replacement.

## 30. End in a Working State

At task completion the repository should remain:
- buildable;
- testable;
- internally consistent;
- reviewable;
- recoverable.

Do not leave a deliberately broken intermediate state for a later task.

## 31. Completion Report

Report:
1. summary;
2. important files changed;
3. behavior changes;
4. tests added/updated;
5. exact test commands executed;
6. results;
7. baseline/snapshot/corpus changes;
8. risks/limitations;
9. out-of-scope items;
10. genuine follow-up tasks, if any.

Never claim a test was run if it was not.

## 32. Default Workflow

```text
READ TASK
↓
READ RELEVANT SPEC
↓
INSPECT CURRENT CODE
↓
INSPECT CURRENT TESTS
↓
CAPTURE RELEVANT BASELINE
↓
PROPOSE SMALLEST SAFE PLAN
↓
IMPLEMENT ONLY CURRENT TASK
↓
RUN TARGETED TESTS
↓
RUN RELEVANT REGRESSION GATE
↓
REVIEW DIFF FOR SCOPE CREEP
↓
REPORT
↓
STOP
```

## 33. Priority Order

1. user data safety;
2. correctness;
3. preservation of working behavior;
4. testability;
5. rollbackability;
6. small reviewable changes;
7. maintainability;
8. evidence-based performance;
9. architectural elegance.

## 34. Final Rule

> Do not make the codebase “better in general.” Make the requested change correct, safe, tested, and easy to review.

Future improvements belong in future tasks.
