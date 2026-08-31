# Simplification Review

Produce the smallest plan behaviorally equivalent to the corrected plan and approved Scope. Scope and the correctness review's retained constraints are binding.

For every mechanism, surface, phase, artifact, and test, identify its current requirement, constraint, prerequisite, or verified fact and the failure caused by removing it. Then delete, collapse, reuse, or defer wherever that trace is absent or a simpler established path is sufficient.

Retain a new complexity boundary only with:

`required now by | simpler local option | why it fails now | removal failure`

Keep one representative happy-path and primary-failure test per distinct required behavior. This pass may add only the minimum replacement detail needed by a larger net reduction.

Use `High` for untraceable complexity or an invalid exception, `Medium` for a material safe reduction, and `Scope Change Required` where reduction would change approved behavior.

Finding schema:

`# | Severity | Action | Location | Finding | Why Safe | Suggested Edit`

Include metadata/hashes, Must Delete, Collapse/Reuse/Defer, retained complexity exceptions, test reductions, findings/dispositions, structural Before → After, and the post-edit plan hash. Write the report before authorized plan edits.

DONE when the plan is smaller in mechanisms, surfaces, process, or tests—or every retained complexity boundary proves no safe reduction—while behavior, constraints, hashes, and write bounds survive.
