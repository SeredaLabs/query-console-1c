# PR-01 — Corpus Baseline & Classification

## Type

Investigation / Baseline / Regression Infrastructure

## Goal

Create a deterministic baseline classification for the existing SDBL corpus and establish a regression gate that protects supported query behavior without changing parser or generator production behavior.

## Read First

Before changing anything, read:

1. `/AGENTS.md`
2. `/docs/TZ-v2.1.md`
3. this file
4. current corpus regression tests
5. current corpus fixtures/scripts
6. parser/generator code only as needed to understand classification behavior

The current repository is the source of truth for implementation details.

## In Scope

This PR may:
- inspect current corpus infrastructure;
- document the current baseline;
- define deterministic classification rules;
- classify the existing corpus;
- add a machine-readable classification artifact;
- add a regression gate for SUPPORTED entries;
- add/improve corpus diff/report tooling;
- add tests for classification/regression infrastructure;
- document the baseline update workflow.

## Out of Scope

DO NOT:
- change parser production behavior;
- change generator production behavior;
- change QueryDocument structure;
- change metadata architecture;
- change metadata loading/building;
- change WebView behavior;
- change Apply behavior;
- change extension runtime architecture;
- introduce a new parser framework;
- introduce a new storage system;
- begin PR-02 or any later roadmap item;
- perform unrelated cleanup/refactoring.

If classification appears to require a production parser/generator change, stop and report it.

## Critical Rule

Do not classify blindly from only:

```text
valid=true/false
custom=true/false
```

`custom=true` may still represent safely preserved input.

Classification rules must reflect actual repository behavior and preservation guarantees.

## Target Vocabulary

```text
SUPPORTED
RECOVERED
UNSUPPORTED
INVALID
```

Only use distinctions that can be defined deterministically from current evidence.

If a boundary is ambiguous, document it instead of inventing a stronger rule.

## Required Investigation Before Coding

Before modifying files, inspect and report:

1. current corpus size;
2. corpus file format;
3. golden/snapshot format;
4. current regression test behavior;
5. current update scripts;
6. whether current tests require byte identity, structural equality, or another invariant;
7. how recovery/custom/raw nodes appear;
8. what `valid` currently means;
9. whether fixtures already encode support/capability expectations.

Also list:
- files you propose to modify;
- tests you expect to add/change;
- unresolved ambiguity.

Do not edit production code during this first investigation step.

## Classification Requirements

Classification must be:
- deterministic;
- reproducible;
- machine-readable;
- reviewable;
- documented;
- grounded in current behavior.

Automate reliable cases.

Ambiguous cases must remain visible and must not be silently promoted to a stronger class.

## SUPPORTED Regression Invariant

```text
SUPPORTED source
↓
parse
↓
generate
↓
parse
↓
must remain SUPPORTED
```

A previously SUPPORTED entry must not silently downgrade.

Intentional downgrade requires an explicit baseline change and explanation.

## Baseline Artifact

Prefer a separate machine-readable artifact alongside the existing corpus instead of rewriting the original corpus format unless repository conventions strongly favor another approach.

Example only:

```text
test/fixtures/corpus/corpus-classes.json
```

Do not treat the example path/format as mandatory.

## Baseline Update Safety

Corpus/golden updates must produce a reviewable summary where practical:
- total changed entries;
- affected categories;
- classification transitions;
- representative before/after differences;
- unexpected regressions.

Use the simplest repository-appropriate mechanism.

Do not build a large reporting framework.

## No Silent Snapshot Updates

If a snapshot regeneration command exists, keep it usable but ensure regressions are visible.

Do not regenerate expected output simply to make tests green.

## Production Behavior Constraint

This PR should not intentionally change parser or generator production behavior.

If production behavior changes unexpectedly:
1. stop scope expansion;
2. identify the cause;
3. report the regression;
4. restore current behavior unless a separate approved task is required.

## Tests

Run the relevant current gates discovered in the repository.

Expected categories:

```text
typecheck
targeted corpus/classification tests
existing corpus regression tests
relevant parser/generator tests if shared test infrastructure is touched
```

Run broader tests if shared infrastructure is modified.

## Definition of Done

PR-01 is complete when:
- current corpus baseline is documented;
- classification rules are documented;
- corpus classification is reproducible;
- ambiguous cases remain visible;
- machine-readable classification exists;
- SUPPORTED regression protection exists;
- baseline changes produce a useful reviewable diff/report;
- parser production behavior was not intentionally changed;
- generator production behavior was not intentionally changed;
- relevant tests pass;
- repository remains working.

## Stop Conditions

Stop and report if:
- classification cannot be defined safely from current behavior;
- corpus data contradicts the class model;
- parser/generator production behavior would need modification;
- a large unrelated test rewrite appears necessary;
- an unexplained regression is discovered;
- implementing the gate requires starting a later architecture PR.

## Final Agent Report

Report:
1. current corpus size;
2. files changed;
3. final classification rules;
4. entries per class;
5. ambiguous/unclassified cases;
6. regression gate added;
7. diff/report mechanism;
8. tests added/updated;
9. exact test commands;
10. results;
11. baseline/golden files changed;
12. limitations;
13. confirmation parser production behavior was not intentionally changed;
14. confirmation generator production behavior was not intentionally changed;
15. confirmation no later PR work was started.

Then STOP.
