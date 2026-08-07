# Workflow estimation guidance

## Purpose

Render concise historical guidance at Spectre Plan's two STANDARD/COMPREHENSIVE user gates. Estimates are planning aids, never commitments, invoices, or reasons to hold a gate.

## Source precedence

1. Prefer `.spectre/telemetry/workflow-estimates.json` when it is readable and includes a compatible contract version, `as_of`, inclusion boundary, cohort size, confidence, wait-exclusion policy, token definition, and pricing basis.
2. Otherwise use the dated SPECTRE seed prior below.
3. Otherwise render the unavailable state and continue.

Do not scan transcripts during a live Plan. Do not combine Plan, Execute, and optional delivery-tail observations into one duration. Use P50/P80 only for at least five comparable successful runs; with smaller cohorts, show a nearest analog or observed envelope and label confidence low.

## Required cost language

Call the token measure **processed tokens** when it includes root plus linked child-agent usage and cache reads/writes.

- **Claude or Codex subscription-authenticated usage:** dollars are directional **API-equivalent**, not the user's incremental charge or invoice. A subscription may cover all usage, so incremental spend can be zero.
- **Direct API or per-token billing:** dollars represent estimated API spend only when the agent states the provider/model, input/cache/output rate basis (or authoritative price-table source), and pricing `as_of` date. If that basis cannot be established, omit dollars and show tokens only.

Always state which basis applies. Never call API-equivalent guidance “cost paid.”

## Gate 1 — Historical guidance

Place this immediately before the exact high-level-design approval sentence:

```text
Historical guidance · {confidence}
- Remaining Plan agent work after approval: {duration range} ({n} comparable completed plans).
- Typical full {tier} Plan expenditure: {processed-token guidance}; {dollar guidance and basis}.
- Excludes time waiting for your response. Execute guidance follows when tasks and dependency waves are known.
```

Use the selected tier only. Keep the block to these three lines.

## Gate 2 — Execution guidance

After task artifacts and reviews settle, count parents, subtasks, and dependency waves. Select the closest contract-compatible successful analog by waves first, then parents; do not fit a regression from the seed cohort.

Place this immediately before the exact final approval sentence:

```text
Execution guidance · {confidence}
- Planned size: {parents} parents / {subtasks} subtasks / {waves} dependency waves.
- Nearest historical analog: {analog graph} → {agent-work duration}; {processed tokens}; {dollar guidance and basis}.
- Optional delivery tail, if requested: ~49 min median. Excludes user wait, queueing, credentials, external outages, and scope changes.
```

If two analogs bracket the graph closely, show a compact observed envelope instead. Do not imply that tokens scale linearly with elapsed time: delegation and context size materially affect expenditure.

## Shipped seed prior

`as_of: 2026-08-06` · transcript-derived · user waits removed · low confidence unless noted · dollars priced from the historical run's model/rate mapping and therefore directional API-equivalent for subscription use.

### Plan

- STANDARD: ~25–45 min remaining agent work after approval (`n=3` completed plans, low confidence). Typical full-plan expenditure was roughly 12M processed tokens and $15–$21 API-equivalent across this small cohort.
- COMPREHENSIVE: ~40–70 min remaining agent work after approval (`n=10` comparable completed plans). Typical full-plan expenditure: median ~32M processed tokens / ~$32 API-equivalent; P80 ~61M / ~$47.

### Execute analog ladder

- 6 parents / 4 waves → 2h 26m agent work · 54M processed tokens · ~$43 API-equivalent.
- 19 parents / 8 waves → 4h 1m · 1.78B · ~$1,085 API-equivalent.
- 22 parents / 11 waves → 7h 36m · 3.11B · ~$1,913 API-equivalent.

The structured Execute seed has only three successful analogs, so confidence is low. Linked child agents accounted for about 90% of processed tokens across the broader included workflow corpus.

## Unavailable state

Render one line and continue: `Historical guidance unavailable for this gate; no compatible local or shipped estimate was found.`
