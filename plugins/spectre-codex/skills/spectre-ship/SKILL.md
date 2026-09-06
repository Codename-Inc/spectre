---
name: "spectre-ship"
description: "Turn completed branch work into a reviewer-ready PR: directly coordinate cleanup, rebase, one advisory full suite, repair/route failures, and spectre-create_pr. Use when asked to ship finished work. Proof is optional. Do NOT use for implementation, main/master pushes, releases, or autonomous request-to-PR delivery."
user-invocable: true
disable-model-invocation: true
---

# ship

Own cleanup, rebase, one advisory suite, and draft PR. Load focused skills; do not duplicate them.

## Inputs

- `$ARGUMENTS` - optional feature name/root or descendant artifact, target branch (default `origin/main`), feedback-focus hint, or `--draft`.
- Live branch, working tree, remotes, and PR state.

## Feature root

- Reuse a managed `FEATURE_ROOT` only when explicit/current-thread evidence ties it to this work (physical directory wins; never branch/recency/lifecycle/scans); distinct work ignores ambient roots. Otherwise, including on collision, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.

## Proof independence

Proof is optional: do not inspect, infer, invoke, or gate on it. Only authority or publication-safety impasses prevent PR creation.

## Outputs + DONE

- PR URL, clean commits, rebase summary, tested SHA, verification/repair routing, `CI: pending`, measurement, and `PR_OPENED` status `PASS|REPAIRED|PRE_EXISTING_FAILURES|INDETERMINATE|KNOWN_FAILURES_REMAIN`.

**DONE when:** Prune/Test → Sweep, rebase, one full suite, repair/routing, measurement relay/degradation, and PR URL are complete. Non-green verification never prevents DONE.

## Method / guardrails

1. **Resolve once.** Confirm a feature branch, target, `FEATURE_ROOT`, full set, and no unrelated/sensitive changes; stop on `main`/`master`. Reuse current-thread `CLEANED_THROUGH_SHA` only if unambiguous and ancestral; otherwise use the full set. Invoke `node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" measure start --label Ship` and relay its snapshot; below, `measure` means `node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" measure`.
2. **Cleanup boundary.** Classify P0-P3; invoke `measure start` for Prune/Test, then one parallel dispatch: `Skill(spectre-prune)` through one prune lead and `Skill(spectre-test)` through one test lead with the same set, risk plan, `{FEATURE_ROOT}`, and `--orchestrated`. The test lead owns batching; neither stages/commits. At each child end invoke `measure finish` for its snapshot with its returned child identity when available; relay compact paths/checks and repair/route cross-boundary needs unless `NEEDS_AUTHORITY`.
3. **Sweep.** Invoke `measure start --label "Sweep"`; run `Skill(spectre-sweep)` with `--orchestrated`, unchanged set, and both results. It alone integrates stale/uncovered checks, repairs attributable failures, and commits; at Sweep end invoke `measure finish` for the Sweep snapshot.
4. **Rebase.** Invoke `measure start --label "Rebase"`; run `Skill(spectre-rebase)` with target, `--orchestrated`, and `--verification-owner parent`; retain backup summary. No checks; at Rebase end invoke `measure finish` for the Rebase snapshot.
5. **Refresh work before the draft split.** Resolve the exact work ID from the run/PR/candidate association and invoke `Skill(spectre-capture)` before verification or draft-PR creation. Retain that ID for every later call; a save failure reports the failed operation and retained recovery input but does not block the draft PR or assert capture succeeded.
6. **Observe one full suite after rebase.** At rebased `FULL_SUITE_SHA`, derive complete `EXPECTED_BASE_SHA`, `EXPECTED_HEAD_SHA`, and `EXPECTED_DIFF_SHA256`; invoke `measure start --label "Full suite"` and `measure start --label "Create PR"`. In parallel start the one full suite lane and `Skill(spectre-create_pr)` pending pass with target, `--orchestrated --pr-phase pending`, the work ID, and that tuple; pending opens/returns a draft with local verification `RUNNING`. At each lane end invoke `measure finish` for its snapshot with its returned child identity when available. No duplicate suites or raw child output.
   - Attribute exact failures `branch-caused|unrelated|indeterminate`, preferring target-SHA CI and otherwise reproducing only the failing check at target.
   - Repair branch-caused families; rerun only failing/affected checks, never the full suite. Route unrelated/indeterminate findings; record repaired HEAD and `CI: pending`.
   - Verification is evidence, never a stop condition.
7. **Create PR and measure.** After the suite, call `Skill(spectre-create_pr)` with target, `--orchestrated --pr-phase final-update`, existing URL/body, the same work ID, refreshed complete `EXPECTED_BASE_SHA`/`EXPECTED_HEAD_SHA`/`EXPECTED_DIFF_SHA256`, and `FINAL_VERIFICATION_SUMMARY`, changing Testing only; refresh candidate-sensitive claims first if repairs changed the tuple. On `PR_CANDIDATE_STALE`, refresh and retry. After repairs, final checks, and URL acquisition, refresh that same work ID through `Skill(spectre-capture)` with truthful execution, verification, and draft-PR states; a draft is not merged. Invoke `measure summary --rows … --outer-snapshot … --persist --project-dir … --feature-root "$FEATURE_ROOT" --base-sha "$EXPECTED_BASE_SHA" --head-sha "$EXPECTED_HEAD_SHA" --diff-sha256 "$EXPECTED_DIFF_SHA256"`; relay its table, persistence status, and history path. Persistence degradation never blocks PR completion; never inspect transcripts, track clocks, or calculate. Unattributed Prune/Test and Full suite/Create PR use one exact parallel-group total; unavailable measurement never blocks Ship.

Never use `--no-verify`, force-push over unrelated remote history, suppress failures, or publish evidence containing secrets/PII.

## Handoff

Return the PR URL plus compact `PR_OPENED`/verification status. End: `Next (recommended): review the PR; CI owns merge-gating full-suite validation.` Do not offer handoff after this terminal boundary.

## Escalate-If

- A cleanup phase, rebase, or create-PR reports `NEEDS_AUTHORITY` because no safe executable path exists without new user authority.
- The branch/target is ambiguous, the remote diverged unexpectedly, or the diff contains secrets/PII.
- Never escalate solely for test/lint/type/build failures, full-suite status, repair count, diff growth, or candidate drift that can be refreshed.
