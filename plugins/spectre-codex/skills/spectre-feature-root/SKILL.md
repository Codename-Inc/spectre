---
name: "spectre-feature-root"
description: "Internal initializer for a missing Spectre feature root. Invoke only from a standalone workflow with no confirmed managed root. Do NOT invoke for existing roots, orchestrated calls missing a root, or direct user requests."
user-invocable: false
---

# feature-root

## Purpose

Create a canonical root with no naming/reuse gate.

## Inputs

Work/name hint; `KIND=feature|bug` (default `feature`); repo-relative candidate; write authority.

## Working Set

Read exact candidates/ignore state only; never select existing work.

## Outputs + DONE

Return `FEATURE`, repo-relative `FEATURE_ROOT`, warnings. DONE: valid root, neutral marker, tenancy, no phase artifact.

## Method / guardrails

1. Use an explicit caller candidate/descendant. Reject absolute, traversal, symlink-escaping, or unmanaged paths.
2. Otherwise derive a concise kebab name and choose the first free `.spectre/{features|bugs}/<name>[-N]/` per `KIND`. Never inspect or offer existing roots, ask whether to reuse one, present naming options, or wait for approval; suffixes resolve collisions.
3. Create `feature.json` containing only `schema_version`, `created_at`, `feature`, and repo-relative `feature_root`; no lifecycle, alias, branch, or absolute path.
4. Unless `.spectre/` is ignored, preserve `.spectre/.gitignore`; require literal `manifest.json`, `bin/`, `handoffs/`, `!features/`, `!bugs/`, plus `evidence/`, `checkpoints/`, `runs/`, `markers/`, `working_set.json`, `cleanup_summary.md`, `execution_state.md`, `reviews/task_review_attempt.json`, `reviews/task_review_safety.json` under both `features/**/` and `bugs/**/`. Specs/research/decisions/reviews/proof stay trackable. Never edit root `.gitignore`; warn on local-only matches.
5. Write only root initialization.

## Handoff

Return values/warnings; caller owns routing.

## Escalate-If

Unsafe candidate/escape, marker/root conflict, or insufficient write authority. Naming ambiguity or collision never escalates.
