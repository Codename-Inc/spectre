# Reviewer CLI Runtime Probes v1

Captured on 2026-07-23 from installed reviewer CLIs with one no-tool response per runtime. These samples verify event fields only; they are not benchmark trials and must not be used for latency or quality comparisons.

## Outcomes

| Runtime | Version | Model / effort | Structured flag | Exit | External wall | Route state |
|---|---|---|---|---:|---:|---|
| Claude Code | 2.1.218 | Opus / medium | `--output-format stream-json --verbose` | 0 | 2.28s | Completed; non-blocking seven-day `allowed_warning` at 0.8 utilization |
| Codex | 0.145.0 | GPT-5.6-sol / medium | `exec --json` | 0 | 4.23s | Completed; no rate/spend event observed |

Exact commands, flags, exits, raw-output hashes, and the supported-versus-unavailable telemetry map are in `probe-summary.json`.

## Telemetry contract learned from the samples

| Field | Claude Code | Codex |
|---|---|---|
| Input / cache / output tokens | Native result usage | Native `turn.completed.usage` |
| Reasoning-output tokens | Unavailable | Native `reasoning_output_tokens` |
| Native total tokens | Unavailable; do not sum implicitly | Unavailable; do not sum implicitly |
| Actual runtime cost | Native `total_cost_usd` | Unavailable |
| Estimated token cost | Requires a separate dated price basis | Requires a separate dated price basis |
| Tool calls | Count structured tool-use/server-tool events; zero in sample | Count structured item types; zero in sample |
| Messages / turns | Native `num_turns` | Count lifecycle and `agent_message` items |
| Retries | No counter/event in sample; unavailable | No counter/event in sample; unavailable |
| Native timing | `duration_ms`, `duration_api_ms`, TTFT fields | Unavailable |
| End-to-end wall time | Evaluator-owned monotonic timer; `/usr/bin/time` retained only as probe evidence | Evaluator-owned monotonic timer; `/usr/bin/time` retained only as probe evidence |

The evaluator must retain raw events before normalization. A missing native value stays `null` with an unavailable reason; estimated cost must remain distinct from actual runtime-reported cost.

## Files

- `claude.stdout.jsonl` / `claude.stderr.txt` — raw Claude sample and wrapper timing.
- `codex.stdout.jsonl` / `codex.stderr.txt` — raw Codex sample and wrapper timing.
- `probe-summary.json` — versioned commands, versions, exits, hashes, and telemetry map.
- `verify-probes.mjs` / `verify-probes.test.mjs` — focused observed-or-unavailable contract verification.
