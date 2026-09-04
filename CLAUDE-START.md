# CLAUDE-START.md

## Purpose

Operator workflow for using Claude Code safely with this repository.

Do not ask Claude to implement the whole roadmap in one run.

## Files Claude Should Read

Always:

```text
/AGENTS.md
```

For the current architecture program:

```text
/docs/TZ-v2.1.md
```

For the current task:

```text
/docs/tasks/PR-01-corpus-baseline.md
```

---

## Stage 1 — Analysis and Plan Only

Run Claude Code in the repository root and send:

```text
Read these files first:

- AGENTS.md
- docs/TZ-v2.1.md
- docs/tasks/PR-01-corpus-baseline.md

You are working on PR-01 only.

Do not implement PR-02 or any later roadmap item.

For this first step, DO NOT modify any files.

First:

1. inspect the current corpus infrastructure;
2. inspect the relevant parser/generator tests;
3. inspect the current corpus snapshot/update scripts;
4. run the relevant current baseline tests where practical;
5. report the current baseline;
6. identify the exact files/functions involved;
7. propose the smallest implementation plan;
8. state explicitly what will remain unchanged;
9. identify any contradiction between the repository and the task specification.

Do not edit code yet.

If the repository contradicts the task specification in a way that affects correctness or scope, stop and report the contradiction instead of guessing.
```

Review the plan before implementation.

---

## Stage 2 — Implement Current PR Only

After the plan is reviewed and accepted:

```text
Proceed with PR-01 according to the approved plan.

Read and follow:

- AGENTS.md
- docs/TZ-v2.1.md
- docs/tasks/PR-01-corpus-baseline.md

Implement PR-01 only.

Do not start PR-02 or any later roadmap work.

Do not refactor unrelated code.

Run every relevant Definition of Done check from the task brief.

If a new contradiction, unexplained regression, or scope expansion appears, stop and report it instead of redesigning the project.

When finished, provide the complete final report required by the task brief and STOP.
```

---

## After Claude Finishes

Do not immediately continue to the next PR.

Use:

```text
Claude finishes current PR
↓
review git diff
↓
verify test results
↓
request fixes if needed
↓
commit / merge
↓
update main
↓
prepare the next task brief from the new current repository state
↓
only then start the next PR
```

## Important

Do not pre-authorize future PRs.

The master specification is long-lived.

Task briefs are intentionally short-lived and should reflect the current `main` branch.
