---
name: "caspar-create_test_guide"
description: "Generate a right-sized manual test guide for completed work — feature-based checklists scaled to change size, focused on risk. Use after execute/validate when you need a human-runnable QA pass before clean/test. Do NOT use to write automated tests (that's the test phase) or to validate wiring (that's validate)."
user-invocable: true
---

# create_test_guide

Produce a manual testing guide, scaled to the change, that a human can run to validate the work. Input is the current task's changes; output is one checklist artifact.

## Inputs
- `$ARGUMENTS` — optional focus areas to emphasize.
- Task context: features added/modified/removed, stack/environment, user personas, integration points/dependencies. Read from canonical artifacts (scope.md, plan.md, tasks.json slices) and the diff. Use `execute.md` only to locate `tasks.json`; do not inline the full task graph.

## Working Set
- Read-only: task artifacts under `docs/tasks/{branch}/`, the implemented diff.
- Write: the single test-guide artifact only.

## Outputs + DONE
Write to `{OUT_DIR}/testing/{branch}_test_guide.md` where `branch=$(git rev-parse --abbrev-ref HEAD)` and `OUT_DIR` = user-specified `target_dir` if given, else `docs/tasks/{branch}` (run `mkdir -p "$OUT_DIR/testing"`).

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
- Return the coverage summary in-thread (no extra docs). Close with a one-line Next Steps pointing to `/caspar:clean` or `/caspar:test`.

## Escalate-If
- Task context is too thin to identify the changed features or personas — ask before guessing.
