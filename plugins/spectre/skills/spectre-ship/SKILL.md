---
name: "spectre-ship"
description: "Turn completed branch work into a reviewer-ready PR: clean, rebase, observe one advisory full suite, repair/route failures, and open via spectre-create_pr. Use when asked to ship finished work. Proof is optional. Do NOT use for implementation, main/master pushes, releases, or autonomous request-to-PR delivery."
user-invocable: true
disable-model-invocation: true
---

# ship

Clean, rebase, observe the repository suite once without gating the PR, then open it. Load focused skills; do not duplicate them.

## Inputs

- `$ARGUMENTS` - optional feature name/root or descendant artifact, target branch (default `origin/main`), feedback-focus hint, or `--draft`.
- Live branch, working tree, remotes, and PR state, resolved just-in-time.

## Feature root

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.

## Proof independence

Proof is optional and independent: do not inspect, infer, invoke, or gate on it. Verification failures are repair/routing work; only an authority or publication-safety impasse may prevent PR creation.

## Outputs + DONE

- PR URL plus clean commits; rebase target/backup/conflicts; tested SHA; compact failures/attribution/repairs/routing; final focused checks; `CI: pending`; and `PR_OPENED` verification status `PASS|REPAIRED|PRE_EXISTING_FAILURES|INDETERMINATE|KNOWN_FAILURES_REMAIN`.

**DONE when:** clean/rebase safety completed, the full suite ran once, failures were repaired or routed/disclosed, and the PR URL is returned. Non-green verification never prevents DONE by itself.

## Method / guardrails

1. **Resolve.** Confirm a feature branch, target branch, `FEATURE_ROOT`, and no unrelated or sensitive changes. Stop on `main`/`master`.
2. **Clean.** Run `Skill(spectre-clean)` with `{FEATURE_ROOT} --orchestrated`; repair or route child findings and continue unless `NEEDS_AUTHORITY`.
3. **Rebase.** Run `Skill(spectre-rebase)` with the target, `--orchestrated`, and `--verification-owner parent`; retain its backup/restore summary.
4. **Observe the full suite once.** At rebased `FULL_SUITE_SHA`, run one repository-authoritative root suite; do not duplicate package suites or run a baseline suite. Keep raw output out of child prompts.
   - Attribute exact failures `branch-caused|unrelated|indeterminate`, preferring target-SHA CI and otherwise reproducing only the failing check at target.
   - Repair branch-caused root-cause families; rerun failing/affected checks. Do not rerun the full suite after repairs. Route unrelated findings; disclose unresolved indeterminate findings; record repaired HEAD and `CI: pending`.
   - Verification status is evidence, never a stop condition; red output, attempts, diff growth, and remaining failures cannot prevent PR creation.
5. **Create PR.** Pass compact `VERIFICATION_SUMMARY` to `Skill(spectre-create_pr)` with target, `--orchestrated`, `--draft`, and feedback hints. Return its URL. On `PR_CANDIDATE_STALE`, refresh and retry.

Never use `--no-verify`, force-push over unrelated remote history, suppress failures, or publish evidence containing secrets/PII.

## Handoff

Return the PR URL plus compact `PR_OPENED`/verification status. End: `Next (recommended): review the PR; CI owns merge-gating full-suite validation.` Do not offer handoff after this terminal boundary.

## Escalate-If

- Clean, rebase, or create-PR reports `NEEDS_AUTHORITY` because no safe executable path exists without new user authority.
- The branch/target is ambiguous, the remote diverged unexpectedly, or the diff contains secrets/PII.
- Never escalate solely for test/lint/type/build failures, full-suite status, repair count, diff growth, or candidate drift that can be refreshed.
