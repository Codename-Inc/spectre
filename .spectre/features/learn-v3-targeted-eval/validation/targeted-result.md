# Learn v3 Targeted Effectiveness Result

## Result: NEGATIVE

The targeted pass is **NEGATIVE under the predeclared harm rule**, because the candidate produced the same irrelevant-task grounding regression in both valid Codex repeats while the no-knowledge controls stayed grounded. Both candidate artifacts remained task-correct and did not load the irrelevant knowledge body, so this is a narrow quality regression rather than a correctness collapse.

The core durable-correction question is still **INCONCLUSIVE**. All four candidate correction cells completed and wrote artifacts, but every one failed the required trace-integrity gate. Their artifact-only directions split cleanly by host—two Claude losses and two Codex wins—and therefore cannot establish a causal correction benefit.

No retries or replacement cells were run.

## What ran

| Measure | Result |
| --- | ---: |
| Frozen cells | 16 / 16 |
| Native sessions | 40 / 40 |
| Runtime-completed cells | 16 |
| Integrity-valid cells | 12 |
| Integrity-invalid cells | 4 |
| Correct-complete artifacts | 13 |
| Safe deferrals | 1 |
| Incorrect artifacts | 2 |
| Complete full-cycle token records | 8 (all Claude) |
| Unknown full-cycle token records | 8 (all Codex) |
| Automatic retries | 0 |

The 13/16 correct-complete count is descriptive only. It must not be read as a candidate win because it combines conditions, includes four integrity-invalid candidate artifacts, and ignores paired grounding differences.

## Paired results

| Case | Host | Repeat | Integrity-valid pair | Candidate | No knowledge | Direction | Native token delta (candidate − control) |
| --- | --- | ---: | --- | --- | --- | --- | ---: |
| longitudinal correction | Claude | 1 | No | safe deferral; missing current value; critical unsupported claim | correct three; noncritical elaboration | candidate loss, artifact-only | +1,236,862 |
| longitudinal correction | Claude | 2 | No | incorrect stale five; critical unsupported claim | correct three; noncritical elaboration | candidate loss, artifact-only | +833,797 |
| longitudinal correction | Codex | 1 | No | correct three; grounded | incorrect; current value missing | candidate win, artifact-only | unknown |
| longitudinal correction | Codex | 2 | No | correct three; noncritical elaboration | correct three; critical unsupported claim | candidate win, artifact-only | unknown |
| irrelevant task | Claude | 1 | Yes | correct; grounded | correct; grounded | tie | −16,588 |
| irrelevant task | Claude | 2 | Yes | correct; grounded | correct; noncritical elaboration | candidate win | −4,070 |
| irrelevant task | Codex | 1 | Yes | correct; noncritical elaboration | correct; grounded | candidate loss | unknown |
| irrelevant task | Codex | 2 | Yes | correct; noncritical elaboration | correct; grounded | candidate loss | unknown |

The two valid Codex losses independently fire the fixed rule: `NEGATIVE` when the candidate introduces a repeated irrelevant-task correctness/grounding regression. The plan allows a valid subset to select a terminal rule even when other cells are invalid; no invalid correction pair was imputed.

## Integrity findings

All eight no-knowledge cells and all four irrelevant-task candidate cells were integrity-valid. Candidate irrelevant-task behavior also met the retrieval-harm boundaries:

- zero knowledge-body and history-body loads in every candidate irrelevant cell;
- SessionStart payloads of 185, 185, 199, and 200 tokens, all below the 300-token cap;
- complete artifacts, isolated homes/filesystems, and no bypass findings.

All four candidate correction cells were invalid because their recorded traces could not be reconciled with native history-read evidence. Three also carried shell-read bypass findings:

| Cell | Trace disposition | Bypass findings | Artifact outcome |
| --- | --- | ---: | --- |
| `longitudinal-correction:candidate:claude:1` | missing native history-read evidence | 1 | safe deferral; current value missing |
| `longitudinal-correction:candidate:claude:2` | missing native history-read evidence | 2 | incorrect; stale five used as current |
| `longitudinal-correction:candidate:codex:1` | missing native history-read evidence | 0 | correct three |
| `longitudinal-correction:candidate:codex:2` | missing native history-read evidence | 1 | correct three |

The stale-five Claude artifact is a serious directional warning, but it is not the deciding rule because that cell is integrity-invalid. The deciding evidence is the repeated valid Codex irrelevant-task grounding regression.

## Cost signal

Claude reported complete full-cycle usage. On the irrelevant task, candidate was modestly cheaper in both repeats (−16,588 and −4,070 tokens). On the invalid correction cells, candidate was much more expensive (+1,236,862 and +833,797 tokens), but those deltas are not accepted effectiveness evidence because the candidate cells failed integrity.

Codex reported session counts but not complete native token totals, so no cross-host cost conclusion is allowed.

## Interpretation

This pass does not validate Learn v3 as more effective than no persisted knowledge. Under the deliberately strict, precommitted rule set it produces a narrow `NEGATIVE` result: task correctness tied on all irrelevant controls, but candidate grounding was worse in both Codex repeats.

It also does not establish that durable learning is broadly harmful. The correction artifacts show a host split, and the candidate-side trace failures prevent accepting either the Claude losses or Codex wins as causal evidence. A one-off rerun could target only those four invalid candidate correction cells, but that would require explicit authorization and a fresh freeze; none was performed here.

## Provenance

- Plan: `.spectre/features/learn-v3-targeted-eval/specs/plan.md` (`05639d749829b9f8daccac6825acbab73c349c49b66158143c1408dc42c98778`)
- Candidate source: `d2932ebec28cb61d37ac061edab7afd9a146d746`
- Frozen contract: `.spectre/features/learn-v3-targeted-eval/validation/targeted-contract.json`
- Freeze artifact: `.spectre/features/learn-v3-targeted-eval/validation/targeted-freeze.json` (`36f2a88d0d3e3d2c3465f0e338507521297e63b7b982d3a6070fe3048c8f4e78`)
- Machine-readable result: `.spectre/features/learn-v3-targeted-eval/validation/targeted-result.json`
- Local reviewed evidence: `/tmp/learnv3-targeted-eval.zeg03j/full-report-reviewed.json` (`900ce218544299782aa0d8e093f3b61d14f3aebb348a0c7ec6fbb28322fbe3ae`)
- Local blinded judgments: `/tmp/learnv3-targeted-eval.zeg03j/blind-judgments.json` (`a552596515c1555d70ef0eba4d5b15b3a83fe2e8e3965b82ae579e45bcc0fa07`)
- Raw logs: `/tmp/learnv3-targeted-eval.zeg03j/raw` (40 stdout + 40 stderr; tree hash `sha256:89b22275158da2673835156cac9a3a9357f9c5c11ede095022a432a58f11bf88`)

The compact JSON preserves all 16 cell rows, all eight pairs, artifact hashes, integrity dispositions, targeted judgments, token coverage, and the exact deciding rule. The larger local evidence remains hash-bound but is intentionally not added to the repository.
