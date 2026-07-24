---
name: "spectre-proof"
description: "Prove a completed feature works from the user's point of view by exercising real product workflows, capturing and reviewing screenshots/video and supporting diagnostics, comparing observed behavior with approved scope/UX artifacts, repairing scoped defects through bounded dev loops, and rerunning proof until stable. Use after spectre-execute or when the user asks to prove it works, provide acceptance evidence, inspect screenshots/video/logs, or create an HTML proof artifact. Do NOT use for implementation-time code validation, unit-test work, planning, or code review."
user-invocable: true
---

# proof

Independently prove the completed experience against its approved contract. Treat implementation reports, tests, DOM/state assertions, and developer claims as leads, not proof. Observable behavior and reviewed evidence decide the result.

## Inputs

- `$ARGUMENTS` - optional explicit feature name/root or descendant artifact, explicitly passed source-plan path, scope/UX/prototype/test-guide paths, journey hints, a prior proof run to resume, an authorized scope hash, an immutable `BASE_SHA`/`HEAD_SHA`/`DIFF_SHA256` candidate tuple, explicit `EVIDENCE_DIRS`, and `--orchestrated` when a parent goal owns the final handoff.
- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child; a child never rederives it. Passing any produced artifact identifies the feature name and root without branch inference.
- An explicit legacy `docs/tasks/**` artifact remains a readable acceptance input, but do not move or bulk-rewrite it. Write new proof artifacts only beneath the confirmed canonical `FEATURE_ROOT` and record the legacy source in the acceptance-source manifest.
- Resolve acceptance truth in this order: current explicit user instruction; an explicitly passed source plan as an acceptance source; approved scope and UX/prototype; task acceptance criteria; test guide. Derivative execution evidence such as `execution_state.md` may focus proof but is not acceptance truth. Surface contradictions before proving against an invented interpretation.

This skill must work in a fresh session. Read canonical artifacts and live repository state instead of relying on prior conversation.

When any candidate field is supplied, require all three. `git-diff-v1` means SHA-256 over the raw stdout bytes of `git diff --binary --full-index --no-ext-diff --no-color --no-renames {BASE_SHA}...{HEAD_SHA}`. Recompute head and hash before proof and handoff; reject an initial mismatch as `PR_CANDIDATE_STALE`. Files inside explicit `EVIDENCE_DIRS` are separate; any other tracked or untracked worktree change, commit, or diff change returns `CANDIDATE_CHANGED` so the parent can clean, rebase, review, validate, and reprove. Never attach `PASS` to the old tuple.

## Proof Surface

- Inventory available skills, repository scripts, automation, runnable applications, public interfaces, and existing scenarios before choosing tools. Prefer the project's established proof stack and reusable scenarios.
- Match the mechanism to the actual surface: visible app, browser, desktop/mobile runtime, CLI/TUI, API/service, library, or background workflow. Exercise the same public controls and interfaces a user would use.
- When no adequate proof tool exists, read `references/proof-tools.md`; use `@spectre:web-research` when available to verify current options against primary sources; then offer the user 2-4 suitable choices with a recommendation, trade-offs, installation impact, and evidence capabilities. Hold for selection before adding a dependency or committing to a materially weaker proof method.
- Proof-infrastructure changes are allowed only when necessary to make an in-scope journey repeatable. Label them separately from product repairs and prefer reusable named scenarios over one-off scripts.

## Proof Contract

Build a proof matrix before running anything. Each row contains:

- requirement and source;
- realistic start state, user action, and observable result;
- proof mechanism and primary evidence;
- supporting diagnostics;
- status and limitations.

Use `PASS`, `PARTIAL`, `DIAGNOSTIC_ONLY`, or `FAIL` per row:

- `PASS` - the public workflow and promised result were exercised end to end; required evidence was inspected and matched the contract.
- `PARTIAL` - some journey was skipped, fixture-backed, programmatic, or otherwise not proven as the user experiences it.
- `DIAGNOSTIC_ONLY` - code paths, state, logs, or tests were proven without proving the public workflow.
- `FAIL` - observed behavior, pixels, output, persistence, or errors contradict the contract.

For visible work, proof requires screenshots of the meaningful start, action, and result states. Capture video when timing, motion, transition, or the path taken matters. Open the actual screenshots and representative video frames with image-reading tools, describe what is visibly present, and compare it with the approved UX/prototype. Captured-but-unreviewed media does not count. When assertions and pixels disagree, pixels win.

For non-visual work, use the real public interface and preserve observable output, state/persistence evidence, and relevant logs. Do not manufacture visual evidence where it adds no information. Tests, stores, internal APIs, fixtures, filesystem markers, and logs may support proof but cannot replace the user-facing outcome they are meant to corroborate.

## Proof-Repair Loop

1. Run the smallest complete set of journeys that covers every in-scope matrix row. Preserve commands, environment, timestamps, evidence paths, and limitations.
2. Inspect primary evidence before reading diagnostic summaries. Then review logs/errors and durable state for silent failures.
3. Classify each finding as product behavior, UX/cosmetic, proof infrastructure, specification ambiguity, or environment blocker. Fix only scoped product/UX defects and required proof infrastructure; no nice-to-haves or silent scope expansion.
4. Dispatch `@spectre:dev` with the exact failed claim, reproduction, inspected evidence, repair boundary, and required reproof. Use `Skill(spectre-tdd)` for behavior that can be tested; visual-only repairs still require focused deterministic checks where useful.
5. Disregard the implementer's pass claim. Rerun the affected journey from a realistic start state, inspect fresh evidence, then rerun any primary journey the repair could affect.
6. Allow at most three repair attempts for the same stable finding fingerprint. A recurring fingerprint or growing repair scope is an escalation, not another loop.

## Outputs + DONE

Write:

- `{FEATURE_ROOT}/proof/proof.json` - machine-readable proof state whose owning metadata object includes `feature` and `feature_root`; preserve the existing acceptance-source, authorized-scope-hash, candidate `{base_sha, head_sha, diff_sha256, algorithm: "git-diff-v1"}`, tool/scenario, matrix, run-history, evidence, finding/fingerprint, repair, limitation, and aggregate-status schemas unchanged.
- `{FEATURE_ROOT}/proof/proof.html` - self-contained review artifact whose metadata block begins with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`, followed by the acceptance matrix, observed-vs-expected findings, selected screenshots/video frames, redacted diagnostic excerpts, before/after repair history, limitations, and final status. Do not publish or share it unless the user asks.

Keep secrets, credentials, private customer data, and unnecessary local paths out of both artifacts. Preserve full raw evidence in its owning tool's report bundle and reference it without copying sensitive content.

**DONE when:** both proof artifacts are self-locating; every in-scope row has a status backed by inspected primary evidence; all scoped repairable failures are fixed and freshly reproven or explicitly unresolved; aggregate `PASS` is used only when every row passes; any supplied candidate tuple and scope hash still match; `proof.json` records that exact proven product state; and the HTML artifact accurately presents the evidence and limitations.

## Handoff

Report the proven journeys, artifacts, evidence reviewed, repair iterations, limitations, aggregate status, and blocking rows.

- `--orchestrated` → return the proof result to the parent goal without user-facing Next Steps.
- Standalone `PASS` → `Next (recommended): /spectre:ship-it — every in-scope proof row passed with reviewed evidence.`
- Standalone non-PASS → choose the blocker-specific action: scoped product defect → `/spectre:fix`, then resume proof; boundary/requirement ambiguity → `/spectre:scope`; user-flow/state/copy ambiguity → `/spectre:ux`; proof-tool/environment blocker → resolve the named prerequisite and resume `/spectre:proof`. Never route a non-PASS result to shipping.

If pausing on a blocked standalone proof, offer `Pause: /spectre:handoff {feature}` with the failing rows, evidence paths, and exact resume action.

## Escalate-If

- Acceptance sources conflict or omit the observable outcome.
- Adequate tooling requires a new dependency and the user has not selected an option.
- Proof depends on unavailable credentials, external services, OS permissions, hardware, or subjective product judgment.
- The repair cap is reached, a finding recurs, or a repair would change approved scope.
