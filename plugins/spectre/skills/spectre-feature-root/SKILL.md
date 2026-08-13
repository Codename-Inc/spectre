---
name: "spectre-feature-root"
description: "Internal initializer for a missing Spectre feature root. Invoke only from a standalone workflow with no confirmed managed root. Do NOT invoke for existing roots, orchestrated calls missing a root, or direct user requests."
user-invocable: false
---

# feature-root

## Purpose

Establish one canonical `.spectre/features/<feature>/` root without a naming gate.

## Inputs

Requested work or name hint; optional repo-relative candidate beneath `.spectre/features/`; caller confirmation that its write gate permits initialization.

## Working Set

Read exact candidate paths and ignore state only. Never select existing work by branch, recency, lifecycle, or scan.

## Outputs + DONE

Return `FEATURE`, repo-relative `FEATURE_ROOT`, and warnings. DONE: directory exists, neutral marker and tenancy are valid, and no phase artifact was written.

## Method / guardrails

1. Use an explicit canonical candidate in place only when the caller selected it or a descendant. Reject absolute, traversal, symlink-escaping, or unmanaged paths.
2. Otherwise derive a concise kebab name and choose the first free `.spectre/features/<name>[-N]/`; suffix checks handle collisions, never selection.
3. Create `feature.json` with only `schema_version`, `created_at`, `feature`, and repo-relative `feature_root`; add no lifecycle, alias, branch, or absolute-path state.
4. If `.spectre/.gitignore` is absent and `.spectre/` is not ignored, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Never edit root `.gitignore`; warn when records are local-only.
5. Write only root initialization.

## Handoff

Return values and warnings; the caller owns artifacts and routing.

## Escalate-If

Candidate ambiguity/escape, marker/root conflict, or insufficient write authority.
