# Execute intermediate-review routing

Load on the first completed phase; reuse thereafter.

## Eligibility and triggers

- Completion makes a fully verified phase eligible, not review-required.
- Trigger intermediate review only for independently implemented batches converging on a shared contract/consumer; downstream dependency on a changed interface/state whose defect would compound; auth/trust, persistence/migration, concurrency/order/retry, destructive, or high-fan-out boundaries; or concrete wiring/correctness risk from verified evidence plus E2E `Gap|Adaptation` that deterministic checks cannot settle.
- Subagent/wave/phase completion, agent count, and diff size alone are not triggers. Never review while attributable deterministic failures remain.

## Routing

- Record every completed phase as `intermediate:<trigger>` or `final-only`; bundle triggered phases completed by the same wave into one reviewer call with a verdict per phase.
- A trigger at final completion belongs to `Skill(spectre-code_review)`; never run both reviews over the final surface.
