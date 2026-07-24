---
name: "spectre-prune"
description: "Find and remove confirmed-safe dead code and artifacts from a scoped working set — orphaned imports/exports, unused code, commented-out blocks, debug/temp logging, duplication, AI slop — while surfacing uncertain items for manual review. Use for dead-code/artifact cleanup only, standalone or as the prune phase inside spectre-clean. Do NOT trigger for adding tests (spectre-test), final commit hygiene (spectre-sweep), bug fixes (spectre-fix), or broad behavior-changing refactors."
user-invocable: true
---

# prune

Find and remove dead code/artifacts from recent work. Conservative by default: investigate and validate before deleting; uncertain items stay in place and are reported for manual review. Findings flow in-thread; only canonical summary artifacts persist.

## Inputs

- `$ARGUMENTS` — optional scope. A `commit_id`/SHA, `unstaged`/`staged`, `context`/session, a scoped file list, or `--orchestrated` when a parent workflow owns the next step. If ambiguous -> ask which scope mode. If a provided `commit_id` is invalid or not in history -> stop and ask for a valid ref.
- `FEATURE_ROOT` — explicit feature name/root or one descendant feature artifact.

## Working Set

- Resolve `FEATURE_ROOT` in this order: an explicit feature directory or feature name; a supplied artifact beneath the feature root; one unambiguous feature artifact in the current conversation. Never infer it from the branch, recency, or lifecycle state.
- An explicit legacy `docs/tasks/**` artifact remains a compatibility input, but a new cleanup summary requires a confirmed `.spectre/features/<feature-name>/` root and records the legacy source.
- Set `OUT_DIR = FEATURE_ROOT`.
- Resolve scope late at runtime:
  - **commit_range**: union of committed files from `{commit_id}^..HEAD` (including the commit), staged, unstaged, and untracked. If `commit_id == HEAD`, use staged + unstaged + untracked.
  - **unstaged/staged**: union of staged + unstaged + untracked.
  - **context**: ask for the session files and wait.
- Respect `.gitignore`, package/tsconfig context, generated-file boundaries, and repo-local conventions. Paths are repo-root relative in reports.

## Outputs + DONE

- Confirmed-safe cleanup edits only.
- `{OUT_DIR}/cleanup_summary.md` with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>` immediately below its title, then: Executive Summary, Safe Removals (`file:line`, what, why safe), Manual Review Required, Excluded Items, Estimated Impact, ESLint-debt notes.
- **DONE when:** every removed item was validated `CONFIRMED_SAFE`; every `UNCERTAIN`/`UNSAFE` item remains untouched and appears in Manual Review; affected lint/tests pass or the failed cleanup edit is rolled back; no `--no-verify`, `eslint-disable`, `@ts-ignore`, or `@ts-expect-error` was introduced; summary was written.

## Method / guardrails

- Detect -> investigate -> validate -> remove. Production code is deleted only with concrete evidence.
- Signals: orphaned imports/exports, unused functions/vars, large commented-out blocks, debug artifacts, temp/dev logging, dead branches, duplicate abandoned implementations, test artifacts (`.only`, skipped tests), AI slop (`any` casts to dodge types, defensive noise, over-commenting).
- Duplication: flag copy-pasted logic (>5 lines, 2+ instances), near-identical functions, repeated validate/transform/fetch patterns. Ignore fixtures/generated code. Consolidate only when low-risk and confirmed safe; otherwise report.
- For non-trivial sets, dispatch up to 4 read-only `@spectre:analyst` agents over file/module chunks. Return compressed in-thread verdicts only: `SAFE_TO_REMOVE`, `NEEDS_VALIDATION`, or `KEEP`, with evidence.
- Every function/file/export deletion gets a second usage search for dynamic imports, string refs, reflection, tests, and external entrypoints. Remove only `CONFIRMED_SAFE`; downgrade uncertainty to manual review.
- Run affected lint/tests after removals. If a cleanup edit causes failure, roll it back and document the reason.
- No commits. `/spectre:sweep` owns final hygiene and commit grouping.
- ESLint-debt scan is diagnostic only: group bypasses in the working set and report a future refactor plan; do not refactor debt during prune.

## Handoff

Report counts analyzed/removed/excluded, lint/test status, the manual-review list, and the summary path.

- `--orchestrated` → return results to the caller without user-facing Next Steps.
- Standalone + concrete coverage risk exposed by cleanup → `/spectre:test`.
- Otherwise → `/spectre:sweep`.

Emit one primary recommendation tied to the cleanup result, not an equal-weight menu.

## Escalate-If

- Scope or commit ref is ambiguous/invalid.
- A removal touches behavior, public API, persistence, auth/security/payment/PII, or generated code without a clean signal.
- Lint/tests fail and rollback is not straightforward.
