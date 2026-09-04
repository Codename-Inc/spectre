# Final Adversarial Code Review

Try to prove the completed work wrong, unsafe, unreachable, or unable to meet the supplied requirements. Accept correctness only when the evidence survives adversarial scrutiny; never defend the implementation.

Review only the supplied candidate and its direct blast radius. Actively seek counterexamples, broken invariants, failure paths, false-positive tests, unreachable outcomes, and evidence contradicting claimed delivery. Cover correctness; regression/integration; security; performance/reliability; materially avoidable overengineering; test adequacy; requirement reachability; scope creep; dead computations/orphaned outputs; old active paths; and duplicate data sources. Omit style, praise, speculation, subjective preferences, and requirements from another scope.

Use `CRITICAL|HIGH|MEDIUM|LOW`: CRITICAL for exploit, data loss/corruption, privilege bypass, or core failure; HIGH for a concrete user-facing defect, serious security weakness, or demonstrated hot-path/reliability failure; MEDIUM for a localized defect or material maintainability/performance/test risk; LOW for a small actionable issue. Zero findings is valid.

Every finding requires `file:line`, violated behavior, evidence/reproduction, impact, smallest scope-safe fix, `finding_fingerprint=sha256(requirement anchor + primary symbol/boundary + normalized observable failure)`, and `invariant_family=sha256(requirement anchor + normalized violated invariant + lifecycle/data-flow boundary)`. CRITICAL/HIGH also requires the normalized invariant and a reproducible failure, exploit, or performance path; otherwise downgrade or omit.

Assign every applicable requirement/AC exactly one `Delivered|Partial|Dead|Missing` status. Delivered requires compact consumer/usage `file:line` evidence and a reachable outcome. Other statuses require a matching finding and action. Trace UI outcomes backward from render/action; trace service/data outcomes through caller, boundary, side effect/persistence, and reload/reconciliation. Do not repeat requirement prose or evidence already cited elsewhere.

Write only the supplied review report with:

0. title, `Feature:`, `Feature Root:`;
1. **Scope Boundary** — completed work, diff/base, immutable tuple, requirements, files/dependencies/tests, exclusions;
2. **Verdict** — `BLOCKED` for CRITICAL/HIGH, `PASS WITH FINDINGS` for MEDIUM/LOW only, otherwise `CLEAN`;
3. **Findings** — `# | Severity | Lens | Location | Evidence / Reproduction | Impact | Finding Fingerprint | Invariant Family | Smallest Fix`, severity ordered, or `No findings`;
4. **Coverage Record** — inspected and unverified areas with reasons;
5. **Requirement Delivery Coverage** — `Requirement/AC | Status | Consumer/outcome evidence | Gap/Finding` for every applicable item;
6. **Scope and Dead-Path Audit** — separate tables for scope creep, dead computations/orphaned outputs, old active paths, and duplicate data sources; empty categories say `None found`;
7. **Prioritized Actions** — ordered remediation or `None`;
8. **Review Metadata** — ISO8601 timestamp, `Review Mode: final`, runtime/model/effort/route, and fallback reason.

DONE when only the report changed; scope and tuple are unchanged; every requirement/AC has one evidence-backed status; findings satisfy the identity/evidence rules; and all required sections and route metadata are complete.
