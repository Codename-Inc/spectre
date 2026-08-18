# Workflow estimation guidance

## Purpose

Render one concise time estimate at an applicable high-level design gate and at every final pre-code approval gate when a valid analog exists. Estimates are planning aids, never commitments or reasons to hold a gate.

## Source precedence

1. Prefer `.spectre/telemetry/workflow-estimates.json` when it is readable and includes a compatible contract version, `as_of`, inclusion boundary, cohort size, confidence, wait-exclusion policy, and observed durations.
2. Otherwise use the dated SPECTRE seed prior below.
3. Otherwise omit the estimate and continue.

Do not scan transcripts during a live Plan. Do not combine Plan, Execute, and optional delivery-tail observations into one duration. Use P50/P80 only for at least five comparable successful runs; with smaller cohorts, use a nearest analog or observed envelope. Confidence and evidence quality are internal eligibility signals, never user-facing labels.

## Presentation invariant

At either gate, render at most one bold duration sentence immediately before the approval sentence. Do not add a heading, bullets, caveats, confidence labels, cohort details, token usage, monetary estimates, billing explanations, graph details, or follow-on guidance. If no valid analog exists, omit the estimate without an unavailable-state warning.

Historical analysis may retain richer telemetry for offline evaluation, but the live Plan workflow presents time only.

## Gate 1 — Remaining planning time

Select the size-compatible Plan estimate. Its duration excludes time waiting for the user's response. Round endpoints to the nearest 10 minutes and place exactly this sentence immediately before the high-level design approval sentence:

```text
**Estimated remaining planning time: about {rounded duration or range}, based on completed plans of similar scope.**
```

## Gate 2 — Implementation time estimate

After route artifacts and reviews settle, count parents, subtasks, and dependency waves when they exist. Select the closest contract-compatible successful analog by waves first, then parents; do not fit a regression from the seed cohort.

When a valid analog exists, round its duration to the nearest 10 minutes and place exactly this sentence immediately before the final approval sentence:

```text
**Estimated implementation time: about {rounded duration}, based on completed projects of similar size.**
```

## Shipped seed prior

`as_of: 2026-08-06` · transcript-derived · user waits removed · confidence retained internally.

### Plan

- XS, S, and M have no shipped seed analog; omit unless compatible local telemetry exists.
- L: ~25–45 min remaining agent work after approval (`n=3`; STANDARD legacy analog).
- XL: ~40–70 min remaining agent work after approval (`n=10`; COMPREHENSIVE legacy analog).

### Execute analog ladder

- 6 parents / 4 waves → 2h 26m agent work.
- 19 parents / 8 waves → 4h 1m.
- 22 parents / 11 waves → 7h 36m.

The structured Execute seed has only three successful analogs; treat evidence quality as an internal eligibility signal.

## Unavailable state

At either gate, omit the estimate when no valid analog exists.
