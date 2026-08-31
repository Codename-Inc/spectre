# Correctness Review

Determine whether the plan will deliver the approved Scope through the actual repository. Scope behavior, success criteria, and constraints are binding; implementation means are revisable. Keep Scope unchanged and classify necessary boundary changes as `Scope Change Required`.

Check:

- Every requirement reaches a planned change, its integration or consumer, and executable verification.
- Referenced paths, patterns, reuse claims, dependencies, ordering, ownership, and material assumptions match repository evidence.
- Verification covers one representative happy path and primary failure per distinct required behavior; additional cases require another requirement, public boundary, credible regression, or materially different present risk.
- Planned safeguards address concrete risks created by the changed boundaries.

A proposed addition requires: `required now by | simpler local option | why it fails now | verification`.

Report evidence-backed `Blocker`, `High`, `Medium`, or `Scope Change Required` findings; zero findings is valid.

Finding schema:

`# | Severity | Category | Location | Finding | Consequence | Suggested Edit`

Include metadata/hashes, evidence/unknowns, retained constraints/tests, findings, dispositions/resulting edits, and the post-edit plan hash. Write the report before authorized plan edits.

DONE when every finding is disposed, no Blocker/High remains, scope changes are withheld, and hashes/write bounds pass.
