---
name: "spectre-prove"
description: "Run one acceptance-proof pass over completed work and publish reviewed user-facing evidence. Use from spectre-execute or standalone for acceptance evidence, screenshots/video/logs, or an HTML proof artifact. Do NOT use for implementation checks, repairs, unit tests, planning, or code review."
user-invocable: true
---

# prove

Prove the completed experience against its approved contract. Reports, tests, assertions, and developer claims are leads; observable behavior and reviewed evidence decide.

## Inputs

- `$ARGUMENTS` - optional explicit feature name/root or descendant artifact, explicitly passed source-plan path, scope/UX/prototype/test-guide paths, journey hints, fresh inspected evidence to reuse, an authorized scope hash, and `--orchestrated` when a parent owns the next action.
- Optional `--profile focused`, valid only with `--orchestrated`: use existing proof tools/scenarios only, run no tooling research or dependency-selection gate, and record unavailable proof capability as `PARTIAL` with limitation `PROOF_TOOLING_UNAVAILABLE`.
- Resolve an explicit feature/root, descendant, or unambiguous thread artifact; otherwise derive a concise kebab name and proceed without a naming gate.
- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Resolve acceptance truth in this order: current explicit user instruction; an explicitly passed source plan as an acceptance source; approved scope and UX/prototype; task acceptance criteria; test guide. Derivative execution evidence such as `execution_state.md` may focus proof but is not acceptance truth. Surface contradictions before proving against an invented interpretation.

This skill must work in a fresh session. Read canonical artifacts and live repository state instead of relying on prior conversation.

Each invocation is exactly one proof pass. Derive a candidate key from relevant product inputs, scope hash, and scenario/config definitions; record observed start/finish state excluding generated proof. If product state changes, mark affected rows `PARTIAL` with `PROOF_STATE_CHANGED`; never bind proof to a future candidate.

## Proof Surface

- Inventory existing tools, scripts, runnable interfaces, and scenarios; prefer the established proof stack.
- Match the mechanism to the actual surface: visible app, browser, desktop/mobile runtime, CLI/TUI, API/service, library, or background workflow. Exercise the same public controls and interfaces a user would use.
- When no adequate proof tool exists: focused profile records affected rows `PARTIAL` with `PROOF_TOOLING_UNAVAILABLE` and continues without research or a user gate. Otherwise read `references/proof-tools.md`, use `@spectre_web_research` when available to verify current options against primary sources, then offer the user 2-4 suitable choices with a recommendation, trade-offs, installation impact, and evidence capabilities; hold for selection before adding a dependency or committing to a materially weaker proof method.
- Identify missing proof infrastructure separately from product findings; this skill reports the required capability but never installs, writes, or repairs it.

## Proof Contract

Build a proof matrix first. Each row contains:

- requirement and source;
- realistic start state, user action, and observable result;
- proof mechanism and primary evidence;
- supporting diagnostics;
- status and limitations.

Use `PASS`, `PARTIAL`, `DIAGNOSTIC_ONLY`, or `FAIL` per row:

- `PASS` - the public workflow/result ran end to end and inspected evidence matched.
- `PARTIAL` - some journey was skipped, fixture-backed, programmatic, or otherwise not proven as the user experiences it.
- `DIAGNOSTIC_ONLY` - code paths, state, logs, or tests were proven without proving the public workflow.
- `FAIL` - observed behavior, pixels, output, persistence, or errors contradict the contract.

For visible work, capture meaningful start/action/result screenshots and video only when timing, motion, transition, or path matters. Inspect actual screenshots/representative frames and compare with approved UX/prototype. Captured-but-unreviewed media does not count. When assertions and pixels disagree, pixels win.

For non-visual work, use the public interface and preserve observable output, persistence, and relevant logs. Do not manufacture visuals. Internal tests/state/logs may support but never replace the promised outcome.

## Proof Pass

1. Reuse fresh inspected primary evidence only when its candidate key and matrix rows match exactly. Run the smallest set of uncovered journeys that completes the matrix. Expensive harness/performance/full qualification allows at most one run per candidate key; rerun only after relevant inputs change or a diagnosed infrastructure failure invalidates it.
2. Inspect primary evidence before reading diagnostic summaries. Then review logs/errors and durable state for silent failures.
3. Classify each finding as product behavior, UX/cosmetic, proof infrastructure, specification ambiguity, or environment/authority constraint. Record the failed claim, expected/observed result, reproduction, evidence paths, fingerprint, and limitation.
4. Write the artifacts and return. Never modify product/proof infrastructure, dispatch an implementer, invoke TDD, or repeat a journey after a repair inside this invocation.

## Outputs + DONE

Write:

- `{FEATURE_ROOT}/proof/proof.json` - compact current-candidate snapshot with `feature`, `feature_root`, acceptance sources, scope hash, candidate key, observed start/finish state, scenarios, matrix, evidence references/hashes, findings, limitations, and aggregate status. Replace prior snapshots; git history preserves them. Never embed raw harness output or accumulating run history.
- `{FEATURE_ROOT}/proof/proof.html` - **required**, self-contained review artifact beginning with `Feature: <feature-name>` and `Feature Root: {FEATURE_ROOT}`, then the matrix, findings, selected reviewed media, redacted diagnostics, current relevant repair dispositions, limitations, and final status. Replace the prior current-candidate report; do not publish or share unless asked.

Keep secrets, credentials, private customer data, and unnecessary local paths out of both artifacts. Raw evidence stays in its owning local tool bundle or product-consumed artifact path and is referenced by URI/path plus hash, never copied into proof.

**DONE when:** both proof artifacts are self-locating; every in-scope row has a status backed by inspected primary evidence; aggregate `PASS` is used only when every row passes; the authorized scope hash still matches; observed start/finish state and unresolved findings are recorded; and the HTML accurately presents the evidence and limitations. DONE means the pass completed, regardless of aggregate status.

## Handoff

Return `PROOF_RESULT`: profile · aggregate status · candidate key · failed/partial row ids · finding fingerprints/classifications · evidence references · limitations · `needs_authority`, plus proven journeys and both required artifact paths.

- `--orchestrated` → return the proof result to the parent without user-facing Next Steps.
- Standalone `PASS` → `Next (recommended): spectre-ship — every in-scope proof row passed with reviewed evidence.`
- Standalone non-PASS → report once, then recommend `spectre-fix`, `spectre-scope`, `spectre-ux`, or the named proof prerequisite. Qualified proof status alone never gates `spectre-ship`.

If a standalone proof pauses on `NEEDS_AUTHORITY`, offer `Pause: spectre-handoff {feature}` with the failing rows, evidence paths, and exact resume action.

## Escalate-If

- Acceptance sources conflict or omit the observable outcome.
- Outside focused profile, adequate tooling requires a new dependency and the user has not selected an option.
- `--profile focused` is supplied without `--orchestrated`.
- Proof depends on unavailable credentials, external services, OS permissions, hardware, or subjective product judgment.
- Resolving a finding would change approved requirements or needs new authority.
