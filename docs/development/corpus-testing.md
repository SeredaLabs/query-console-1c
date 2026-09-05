# Corpus testing

The committed regression corpus exercises parse/generate behavior in unit tests.
Use `npm run corpus:test` for corpus processing and `npm run corpus:verify` for the
visual verification tooling when its local prerequisites are available.

## Changing expected output

Classify every change before updating a baseline. Report the number of affected
queries, categories, representative before/after SDBL, and why the new output is
correct. Preserve original input and never use snapshot refresh as a repair for
an unexplained regression.

Some oracle workflows require a private 1C environment, XML export, or locally
built parser artifact and therefore are not CI requirements. Keep proprietary
queries out of the repository and reduce defects to safe fixtures.

The older detailed operator runbook is archived at
[`docs/history/pre-consolidation/corpus-testing.md`](../history/pre-consolidation/corpus-testing.md).
