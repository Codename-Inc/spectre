---
name: "spectre-create_test_guide"
description: "Generate a right-sized manual test guide for completed work — feature-based checklists scaled to change size, focused on risk. Use after execute/validate when you need a human-runnable QA pass before clean/test. Do NOT use to write automated tests (that's the test phase) or to validate wiring (that's validate)."
user-invocable: true
---

# create_test_guide

Produce a manual testing guide, scaled to the change, that a human can run to validate the work. Input is the current task's changes; output is one checklist artifact.

## Inputs
- `$ARGUMENTS` — optional explicit feature name/root or descendant artifact, focus areas to emphasize, an explicit source-plan path, and `--orchestrated` when a parent workflow owns the next step.
- Task context: features added/modified/removed, stack/environment, user personas, integration points/dependencies. Prioritize an explicitly passed source-plan path ahead of literal `plan.md`; otherwise read from canonical artifacts (scope.md, plan.md, tasks.json slices) and the diff. Use `execute.md` only to locate `tasks.json`; do not inline the full task graph.

## Working Set
- Resolve `FEATURE_ROOT` in this exact order: (1) an explicit feature directory or feature name; (2) a supplied artifact beneath the feature root; (3) one unambiguous feature artifact already present in the current thread. A name maps to `.spectre/features/<feature-name>/`. If resolution is absent or ambiguous, ask for the feature name/path.
- Never use branch name, modification time, lifecycle completeness, or directory scanning to infer a feature. Arbitrary output roots are invalid for new canonical test-guide artifacts.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child; a child never rederives it. Passing any produced artifact identifies the feature name and root without branch inference.
- An explicit legacy `docs/tasks/**` artifact remains a readable input, but do not move or bulk-rewrite it. Write the new guide only beneath the confirmed canonical `FEATURE_ROOT` and record the legacy source in its Testing Overview.
- Read-only: explicitly supplied feature/legacy artifacts and the implemented diff.
- Write: the single test-guide artifact only.

## Outputs + DONE
Write to `{FEATURE_ROOT}/testing/test_guide.md` and begin immediately below the title with:

```text
Feature: <feature-name>
Feature Root: .spectre/features/<feature-name>
```

DONE when:
- Complexity classified **Simple | Medium | Complex** with a one-line rationale (Simple = smoke/happy-path + quick regression; Medium = edge cases, error handling, basic integration; Complex = advanced scenarios, performance, cross-feature, security).
- **Required sections present (always):** Testing Overview (scope, environment, prerequisites) · Environment Setup (steps + verification) · Core Test Cases (primary functionality) · Results Documentation (how to record/report).
- **Optional sections included only when relevant:** Known Issues & Limitations · Rollback Procedures (high-risk/prod) · Performance · Accessibility (UI/UX) · Cross-Browser/Device (frontend) · Data Validation · Security (auth/permissions/data-access).
- Organized **by user workflow/feature**, not procedural phases; headers name the user goal.
- Each checkbox is an **action + verification pair** (e.g. "Send POST to /api/users → verify 201 with user ID returned"), using `[ ]` for tracking; related steps grouped under one scenario; concrete test data (paths, names, shortcuts/UI elements in parens) included.
- Depth scaled to change size (CSS tweak ≠ payment system); instructions runnable by someone unfamiliar with the code; no over-engineering for trivial changes.
- A coverage summary returned: # workflows, # steps, estimated time, and the chosen complexity tier + rationale.

Feature-section shape:
```markdown
### 1. Feature Name (User Action/Context)
- [ ] Action to perform → what to verify/expect
- [ ] Edge case or error handling → expected behavior
```

## Method / guardrails
- Scale to risk: prioritize what is most likely to break or impact users; only include sections that add value.
- Each scenario validates one capability end-to-end.

## Handoff
- Return the coverage summary in-thread (no extra docs).
- `--orchestrated` → return the guide path and coverage summary to the caller without user-facing Next Steps.
- Standalone → recommend `/spectre:proof` when the completed feature has an observable public workflow; recommend `/spectre:test` only for an identified automation gap; recommend `/spectre:clean` only when proof is explicitly deferred. Emit one primary recommendation with its observed reason.

## Escalate-If
- Task context is too thin to identify the changed features or personas — ask before guessing.
