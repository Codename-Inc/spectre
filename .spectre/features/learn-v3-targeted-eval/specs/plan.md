# Learn v3 Targeted Effectiveness Evaluation Plan

Feature: `learn-v3-targeted-eval`
Feature Root: `.spectre/features/learn-v3-targeted-eval`
Execution Mode: direct

## Overview

Determine whether current Learn v3 is more effective than no knowledge at all with the smallest causal comparison that covers both benefit and harm. Freeze the current candidate once, run only `longitudinal-correction` and `irrelevant-task` for candidate and no-knowledge on Claude and Codex with two repeats, adjudicate separate outcome dimensions, and publish one result as `POSITIVE`, `NEUTRAL`, `NEGATIVE`, or `INCONCLUSIVE`.

This is a 16-cell ceiling containing 40 native sessions. It does not resume the 144-cell matrix, compare the retired baseline, or run during planning.

## Technical Approach

### 1. Freeze a targeted contract against the current candidate

Create a feature-local evaluation contract that records the exact 16 cell IDs, the current repository/candidate HEAD, fixture/oracle/configuration/native-pipeline hashes, the scoring fields below, and the fixed decision rules. Use the existing full-manifest freeze implementation, then select only the named cells through repeated `--cell` arguments.

Before freezing, normalize the existing no-knowledge transport for `userLearnSessions`: candidate prompts invoke Learn, while no-knowledge prompts receive the same factual evidence and artifact obligation using ordinary project evidence without mentioning or attempting Learn. The present prompt contract leaves the literal “Use Learn” instruction in no-knowledge longitudinal sessions, which would bias the control with an impossible action. Cover the candidate and no-knowledge prompt forms with a deterministic test.

The authorized cells are:

```text
longitudinal-correction:candidate:claude:1
longitudinal-correction:candidate:claude:2
longitudinal-correction:no-knowledge:claude:1
longitudinal-correction:no-knowledge:claude:2
longitudinal-correction:candidate:codex:1
longitudinal-correction:candidate:codex:2
longitudinal-correction:no-knowledge:codex:1
longitudinal-correction:no-knowledge:codex:2
irrelevant-task:candidate:claude:1
irrelevant-task:candidate:claude:2
irrelevant-task:no-knowledge:claude:1
irrelevant-task:no-knowledge:claude:2
irrelevant-task:candidate:codex:1
irrelevant-task:candidate:codex:2
irrelevant-task:no-knowledge:codex:1
irrelevant-task:no-knowledge:codex:2
```

Do not reuse v15 candidate artifacts as current evidence. Any candidate, fixture, oracle, prompt, configuration, or native-pipeline change after freeze invalidates the affected cache under the existing hash contract.

| Addition | Required now by | Simpler local option | Why it fails now | Verification |
| --- | --- | --- | --- | --- |
| Feature-local targeted contract and result schema | A two-condition causal conclusion with separate correctness, stale-safety, grounding, relevance, and cost axes | Use the existing full-matrix report unchanged | It assumes candidate, baseline, and no-knowledge across 144 cells and collapses manual outcome dimensions, so a selected 16-cell run remains generically pending and cannot answer the user's question | Recompute the final classification from the committed targeted JSON and exact paired rows |

### 2. Qualify causality without native model calls

Before `--allow-native`, stage all selected condition/host shapes and assert:

- candidate and no-knowledge receive byte-identical ordinary repository evidence and task state;
- candidate Learn sessions and no-knowledge ordinary-recording sessions contain the same factual claims and output obligations, while no no-knowledge prompt contains `Learn`, `spectre-learn`, or a missing workflow command;
- no-knowledge has no Spectre knowledge plugin, store, SessionStart payload, or connected external tools;
- candidate uses the synced canonical/Codex plugin outputs from the frozen candidate;
- the final longitudinal session does not contain either “three attempts” or “five attempts” in its prompt, while both values remain discoverable through the condition's ordinary accumulated project evidence;
- the irrelevant task contains the two accessibility observations for both conditions, while only candidate has the unrelated warehouse-retention knowledge record;
- selected IDs contain no baseline or other case family and total exactly 16 cells / 40 prepared sessions;
- host homes, Git/GitHub fixtures, network/socket restrictions, credentials, raw logs, and trace paths remain isolated under the already-tested staging boundary.

Fail this gate before any native call if evidence differs, the answer leaks, the candidate mirror is stale, or the selected count expands.

### 3. Run the frozen cells once under the existing bounds

Run the exact selected set with the frozen Claude/Codex models and effort, maximum four simultaneous sessions and two per host. Treat the first completed candidate/no-knowledge irrelevant pair as an in-budget canary; continue only if both artifacts, isolation evidence, and host provenance are clean. The canary remains part of the 16 cells and creates no extra calls.

Persist every cell result, raw-log location, deliverable hash, session usage, snapshots, ordered operations/results, trace, and freeze key. Do not start a replacement cell automatically. A launch failure, timeout, missing deliverable, unavailable required candidate trace, direct-store bypass, connected-tool access, hash mismatch, or incomplete full-cycle usage is `INVALID` and makes the aggregate result `INCONCLUSIVE` unless the already-completed valid pairs independently satisfy a terminal rule without imputing the missing pair.

### 4. Adjudicate effectiveness on separate axes

Blind manual adjudication to condition labels until each artifact hash is bound. Record these fields per cell:

- `taskOutcome`: `correct-complete | safe-deferral | incorrect`;
- `currentConstraint`: `three | five | missing | not-applicable`;
- `staleValueUsed`: boolean;
- `grounding`: `grounded | noncritical-elaboration | critical-unsupported-claim`;
- `knowledgeRelevance`: `relevant | irrelevant | none`;
- `artifactHash` and exact evidence reference;
- structural/integrity disposition from the existing evaluator;
- full-cycle native tokens and elapsed time when complete.

For longitudinal cells, `correct-complete` requires using the current ceiling of three, not using five as current, and completing the requested artifact. A safe request for missing evidence is better than a wrong or stale answer but less effective than correct completion. For irrelevant cells, correctness requires both accessibility findings and no warehouse-retention policy; candidate must perform zero knowledge-body and history-body loads.

Do not collapse correct constraint use and a secondary unsupported detail into one opaque boolean. Grounding remains a real quality dimension and a critical unsupported claim can still make `taskOutcome` incorrect, but noncritical elaboration is reported separately.

### 5. Pair and classify the result

Pair candidate and no-knowledge by case, host, and repeat. Compare longitudinal pairs lexicographically:

1. `taskOutcome`: correct-complete > safe-deferral > incorrect;
2. stale safety: any current use of five loses the pair;
3. grounding: grounded > noncritical elaboration > critical unsupported claim;
4. when semantic outcomes tie, lower complete native full-cycle token usage wins; report elapsed time as descriptive rather than a tie-breaker.

Publish one aggregate result using rules fixed before native execution:

- `POSITIVE`: all four candidate longitudinal cells are valid, use three, and avoid stale five; candidate is never worse and strictly wins at least three of four longitudinal pairs, or ties semantic outcomes while having a lower paired median full-cycle token cost; all four candidate irrelevant cells match control correctness, load no knowledge/history body, and remain within the 300-token SessionStart cap.
- `NEGATIVE`: candidate uses stale five in any valid final artifact; loses at least two longitudinal pairs on semantic outcome; introduces a repeated irrelevant-task correctness/grounding regression; or has no semantic benefit while complete paired full-cycle cost is consistently higher on both hosts and repeats.
- `NEUTRAL`: every required cell is valid, longitudinal semantic outcomes tie, no stale or irrelevant-task regression occurs, and token results show neither consistent advantage nor disadvantage.
- `INCONCLUSIVE`: an integrity gap, missing judgment/usage, host split, single unmatched regression, or mixed result prevents the rules above from deciding without adding runs.

The final Markdown and JSON reports must show every pair, both repeats, raw counts, invalid cells, token coverage, candidate/no-knowledge deltas, and the exact rule that selected the classification. A result may not be upgraded by extrapolating from missing cells.

## Critical Files

- `scripts/evaluate-knowledge.mjs:62` — **Core logic:** freeze/run entrypoint and exact `--cell` selection.
- `scripts/evaluate-knowledge.mjs:455` — **Core logic:** hash-bound cache, concurrency, persistence, and failure continuation.
- `scripts/knowledge-evaluation-staging.mjs:583` — **Core logic:** isolated candidate/no-knowledge staging boundary.
- `scripts/knowledge-evaluation-fixtures/manifest.json:65` — **Pattern:** irrelevant-knowledge negative control.
- `scripts/knowledge-evaluation-fixtures/manifest.json:191` — **Pattern:** four-session correction journey.
- `scripts/knowledge-evaluation-oracle.json:32` — **Interface:** load/capture expectations requiring targeted semantic augmentation.
- `scripts/test_evaluate-knowledge.mjs:96` — **Test:** named-cell selection and frozen cache behavior.

## External Dependencies — Verify Before Implementation

No new packages. Before native execution, confirm the pinned Claude and Codex CLIs authenticate inside the isolated homes and the existing Node test/runtime dependencies resolve from this checkout.

## Verification — How We Know This Works

### Frozen selection and evidence symmetry

- A deterministic test expands the targeted contract to exactly 16 unique IDs, 8 candidate and 8 no-knowledge, with no baseline/other-family ID and exactly 40 prompt sessions.
- Prompt-contract tests show exactly two Learn invocations in each candidate correction cell, zero Learn references in no-knowledge cells, and equivalent factual evidence/output obligations across each paired session.
- Staging snapshots show identical ordinary evidence per paired cell and prove the final correction prompt contains neither retry value.
- Freeze verification rejects any changed fixture, oracle, configuration, candidate, prompt, or pipeline input before a host call.

### Native integrity and bounded execution

- All accepted cells have matching freeze keys, completed host status, persisted artifact hashes, complete ordered evidence, clean sandbox/connected-tool checks, and required candidate traces.
- The run inventory contains only the 16 authorized IDs and no more than 40 native sessions; concurrency never exceeds four total or two per host.
- Invalid infrastructure evidence remains `INVALID` and cannot receive a semantic pass.

### Effectiveness conclusion

- Four longitudinal candidate/no-knowledge pairs and four irrelevant pairs have hash-bound blinded judgments on every declared axis.
- The report recomputes the fixed pair ordering and aggregate classification from JSON and shows the deciding rows and complete token-coverage status.
- Independent recomputation from the committed JSON yields the same classification and never uses the prior 144-cell acceptance threshold as a substitute.

## Out-of-Bounds — DO NOT add

- Do not run native models or consume the 40-session allowance during planning.
- Do not run baseline/current-Spectre cells or any of the other ten scenario families.
- Do not resume, complete, or relabel the v15 144-cell matrix.
- Do not exceed 16 cells or 40 native sessions; invalid cells require separate user authorization before any one-off retry.
- Do not tune Learn, prompts, fixtures, oracle, scoring rules, or models after seeing results and then reuse the same freeze.
- Do not treat v15 cached candidate artifacts as current-candidate evidence.
- Do not turn this directional two-model experiment into a statistical-generalization claim.
- Do not modify production Learn behavior as part of evaluation execution; discovered defects are reported for a separately authorized repair/evaluation round.

## Risks & Filled Assumptions

- **Small stochastic sample:** two repeats detect obvious instability but cannot estimate broad model variance. Mitigation: require host/repeat consistency and return `INCONCLUSIVE` for mixed results.
- **Longitudinal cost:** eight four-session cells account for 32 of 40 native calls. Mitigation: use the first in-budget irrelevant pair as the host/isolation canary and stop immediately on boundary failure.
- **Control strawman:** a control with no evidence would make Learn trivially win. Mitigation: preserve identical ordinary repository evidence and remove only the knowledge subsystem.
- **Answer leakage:** restating three in the final prompt would erase the memory test. Mitigation: byte-level prompt assertions before native authorization.
- **Binary semantic confound:** the earlier rubric conflated correct recall with secondary elaboration. Mitigation: separate task outcome, stale safety, grounding, relevance, and cost before aggregation.
- **Candidate drift:** final review repairs changed the candidate after v15. Mitigation: create a new freeze bound to current `plugins/` and refuse reuse across hashes.
- **Infrastructure contamination:** prior qualification exposed live GitHub/app/socket paths. Mitigation: retain the existing isolated homes, local fixtures, disabled connected tools, OS boundary, ordered evidence, and no-retry rule.

## Routing Observations

- Workstream count: 1.
- Independent workstreams: none; contract freeze, qualification, native execution, adjudication, and aggregation are one causally ordered evaluation.
- Dependency sequencing: freeze contract → zero-model symmetry/isolation gate → bounded native cells → integrity reconciliation → blinded judgments → paired classification.
- Shared-contract consumers: candidate/no-knowledge staging, both native host adapters, judgment ledger, and final report consume the same frozen IDs and hashes.
- Staged rollout or migration: none.
- New abstraction: none; a feature-local targeted aggregation contract supplements the full-matrix report without changing Learn production behavior.
- Unresolved material decision: none.
- Observed uncertainty: moderate because native outputs are stochastic and prior trace/host contamination failures require strict invalidation rather than repair during the pass.
