---
name: "spectre-ship-it"
description: "Finish a completed feature branch by orchestrating spectre-clean, spectre-rebase, and spectre-create_pr into a reviewer-ready pull request. Use after any completed task or staged workflow when the user asks to clean up, rebase, and open the PR. Proof is an independent optional workflow, never a prerequisite. Do NOT use for implementation, unfinished work, direct pushes to main/master, releases, or the autonomous request-to-PR flow (spectre-deliver)."
user-invocable: true
disable-model-invocation: true
---

# ship-it

Terminal orchestrator for completed work: clean the branch, rebase it safely, and open the PR. Load the focused skills; do not duplicate their procedures.

## Inputs

- `$ARGUMENTS` - optional feature name/root or descendant artifact, target branch (default `origin/main`), feedback-focus hint, or `--draft`.
- Live branch, working tree, remotes, and PR state, resolved just-in-time.

## Feature root

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.

## Proof independence

Proof is a separate optional workflow and is never a prerequisite for `ship-it`. Do not inspect proof artifacts, infer whether proof ran, classify proof status, invoke proof, or gate shipping on proof availability. Concrete unresolved failures reported by the user or surfaced by clean/rebase/PR verification remain blockers on their own merits.

## Outputs + DONE

- Successful `Skill(spectre-clean)` result with its commits and verification summary.
- Successful `Skill(spectre-rebase)` result including backup ref, target, conflicts, and post-rebase verification.
- Successful `Skill(spectre-create_pr)` result and PR URL.
- Final summary: clean commits; rebase target/backup/conflicts; verification performed by the composed skills; PR URL.

**DONE when:** clean completed without bypasses; rebase completed with its safety and verification gates; the actual diff and test evidence ground the PR; and the PR URL is returned.

## Method / guardrails

1. **Resolve.** Confirm a feature branch, target branch, `FEATURE_ROOT`, and no unrelated or sensitive changes. Stop on `main`/`master`.
2. **Clean.** Run `Skill(spectre-clean)` with `{FEATURE_ROOT} --orchestrated` for the completed working set. Read its result and live Git state; do not continue past a blocked phase.
3. **Rebase.** Run `Skill(spectre-rebase)` with the explicit target and `--orchestrated`. Preserve and report its backup ref and restore command.
4. **Create PR.** Run `Skill(spectre-create_pr)` with the target, `--orchestrated`, `--draft`, and feedback hints from `$ARGUMENTS`. Return its URL.

Never use `--no-verify`, force-push over unrelated remote history, suppress failures, or publish evidence containing secrets/PII.

## Handoff

Terminal skill. Return the PR URL plus the compact final summary. End with `Next (recommended): review the PR.` Add `/spectre:code_review` only when an additional adversarial review is requested or the diff risk warrants it. Do not offer `/spectre:handoff` after the terminal PR boundary.

## Escalate-If

- Clean, rebase, or create-PR skill reports a blocker.
- The branch/target is ambiguous, the remote diverged unexpectedly, or the diff contains secrets/PII.
