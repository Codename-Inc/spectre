---
name: "spectre-feature-root"
description: "Internal initializer for a missing Spectre feature root. Invoke only from a standalone workflow with no confirmed managed root. Do NOT invoke for existing roots, orchestrated calls missing a root, or direct user requests."
user-invocable: false
---

# feature-root

## Purpose

Establish one canonical feature root without a naming gate.

## Inputs

Work/name hint; optional repo-relative candidate; write authority.

## Working Set

Read exact candidates/ignore state only; never select existing work.

## Outputs + DONE

Return `FEATURE`, repo-relative `FEATURE_ROOT`, warnings. DONE: valid root, neutral marker, tenancy; no phase artifact.

## Method / guardrails

1. Use only a caller-selected candidate/descendant. Reject absolute, traversal, symlink-escaping, or unmanaged paths.
2. Otherwise derive a kebab name and choose the first free `.spectre/features/<name>[-N]/`; suffixes handle collisions, never selection.
3. Create `feature.json` with only `schema_version`, `created_at`, `feature`, and repo-relative `feature_root`; add no lifecycle, alias, branch, or absolute-path state.
4. Unless `.spectre/` is ignored, preserve `.spectre/.gitignore` and ensure these literal entries: `manifest.json`, `bin/`, `handoffs/`, `features/**/evidence/`, `features/**/checkpoints/`, `features/**/runs/`, `features/**/markers/`, `features/**/working_set.json`, `features/**/cleanup_summary.md`, `features/**/execution_state.md`, `features/**/reviews/task_review_attempt.json`, `features/**/reviews/task_review_safety.json`, `!features/`. Specs/research/decisions/reviews/proof stay trackable. Never edit root `.gitignore`; warn matches are local-only.
5. Write only root initialization.

## Handoff

Return values/warnings; caller owns routing.

## Escalate-If

Candidate ambiguity/escape, marker/root conflict, or insufficient write authority.
