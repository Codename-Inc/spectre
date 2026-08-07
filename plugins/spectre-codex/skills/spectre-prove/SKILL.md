---
name: "spectre-prove"
description: "Run one acceptance-proof pass over completed work and publish reviewed user-facing evidence. Use from spectre-execute or standalone for acceptance evidence, screenshots/video/logs, or an HTML proof artifact. Do NOT use for implementation checks, repairs, unit tests, planning, or code review."
user-invocable: true
---

# prove

Independently prove the completed experience against its approved contract. Treat implementation reports, tests, DOM/state assertions, and developer claims as leads, not proof. Observable behavior and reviewed evidence decide the result.

## Inputs

- `$ARGUMENTS` - optional explicit feature name/root or descendant artifact, explicitly passed source-plan path, scope/UX/prototype/test-guide paths, journey hints, a prior proof run to extend, an authorized scope hash, explicit `EVIDENCE_DIRS`, and `--orchestrated` when a parent owns the next action.
- Optional `--profile focused`, valid only with `--orchestrated`: use existing proof tools/scenarios only, run no tooling research or dependency-selection gate, and record unavailable proof capability as `PARTIAL` with limitation `PROOF_TOOLING_UNAVAILABLE`.
- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child; a child never rederives it. Passing any produced artifact identifies the feature name and root without branch inference.
- An explicit legacy `docs/tasks/**` artifact remains a readable acceptance input, but do not move or bulk-rewrite it. Write new proof artifacts only beneath the confirmed canonical `FEATURE_ROOT` and record the legacy source in the acceptance-source manifest.
- Resolve acceptance truth in this order: current explicit user instruction; an explicitly passed source plan as an acceptance source; approved scope and UX/prototype; task acceptance criteria; test guide. Derivative execution evidence such as `execution_state.md` may focus proof but is not acceptance truth. Surface contradictions before proving against an invented interpretation.

This skill must work in a fresh session. Read canonical artifacts and live repository state instead of relying on prior conversation.

Each invocation is exactly one proof pass. Record the observed repository/runtime state at start and finish, excluding generated evidence. If product state changes during the pass, mark affected rows `PARTIAL` with limitation `PROOF_STATE_CHANGED`; never bind proof to a future PR candidate.

## Proof Surface

- Inventory available skills, repository scripts, automation, runnable applications, public interfaces, and existing scenarios before choosing tools. Prefer the project's established proof stack and reusable scenarios.
- Match the mechanism to the actual surface: visible app, browser, desktop/mobile runtime, CLI/TUI, API/service, library, or background workflow. Exercise the same public controls and interfaces a user would use.
- When no adequate proof tool exists: focused profile records affected rows `PARTIAL` with `PROOF_TOOLING_UNAVAILABLE` and continues without research or a user gate. Otherwise read `references/proof-tools.md`, use `@spectre_web_research` when available to verify current options against primary sources, then offer the user 2-4 suitable choices with a recommendation, trade-offs, installation impact, and evidence capabilities; hold for selection before adding a dependency or committing to a materially weaker proof method.
- Identify missing proof infrastructure separately from product findings; this skill reports the required capability but never installs, writes, or repairs it.

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

## Proof Pass

1. Run the smallest complete set of journeys that covers every in-scope matrix row. Preserve commands, environment, timestamps, evidence paths, and limitations.
2. Inspect primary evidence before reading diagnostic summaries. Then review logs/errors and durable state for silent failures.
3. Classify each finding as product behavior, UX/cosmetic, proof infrastructure, specification ambiguity, or environment/authority constraint. Record the failed claim, expected/observed result, reproduction, evidence paths, fingerprint, and limitation.
4. Write the artifacts and return. Never modify product/proof infrastructure, dispatch an implementer, invoke TDD, or repeat a journey after a repair inside this invocation.

## Outputs + DONE

Write:

- `{FEATURE_ROOT}/proof/proof.json` - machine-readable proof state with `feature`, `feature_root`, acceptance sources, scope hash, observed start/finish state, tool/scenario, matrix/run history, evidence, findings, limitations, and aggregate status. Retain legacy history without binding the current pass to it.
- `{FEATURE_ROOT}/proof/proof.html` - self-contained review artifact beginning with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`, then the matrix, findings, selected reviewed media, redacted diagnostics, prior repair history when present, limitations, and final status. Do not publish or share unless asked.

Keep secrets, credentials, private customer data, and unnecessary local paths out of both artifacts. Preserve full raw evidence in its owning tool's report bundle and reference it without copying sensitive content.

**DONE when:** both proof artifacts are self-locating; every in-scope row has a status backed by inspected primary evidence; aggregate `PASS` is used only when every row passes; the authorized scope hash still matches; observed start/finish state and unresolved findings are recorded; and the HTML accurately presents the evidence and limitations. DONE means the pass completed, regardless of aggregate status.

## Handoff

Return `PROOF_RESULT`: profile · aggregate status · run id · failed/partial row ids · finding fingerprints/classifications · evidence paths · limitations · `needs_authority`, plus the proven journeys and artifact paths. Keep full evidence in the artifacts.

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

## Codex Agent Preflight

Before dispatching any `@spectre_*` custom agent, run the bundled setup helper once:

```bash
node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
```

If the helper reports agents were installed or updated in this session, continue directly only for lookup/scoping work that can be completed without a subagent. For other agent-dependent workflows, stop with a clear one-session restart requirement so Codex can discover the new custom agents.
