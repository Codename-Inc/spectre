# Execute workflow events

Load for structured `tasks.json` execution and plan-direct execution. Plan-direct passes its source plan path as `--source`, uses stable coarse-map workstream ids (`ws-<n>`) as task ids, and emits workstream-granularity events only — no per-subtask events and no wave/phase boundaries beyond those its state records. Instructions below that persist status into `tasks.json` apply to structured mode only; plan-direct persists status in its execution state.

## Start or resume

Run once after resolving the source artifact (`TASKS_JSON`, or `PLAN_SOURCE` in plan-direct mode) and `FEATURE_ROOT`:

```bash
node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" run start --source "$TASKS_JSON" --owner "$FINALIZATION_OWNER" --project-dir "$PROJECT_ROOT" --json
```

Keep returned `runId` as `RUN_ID` and `primaryActorId` as `PRIMARY_ACTOR_ID`. Start the `execute` stage. Start each phase and wave before its first work. Use stable idempotency keys from the run + boundary/task/attempt.

When routing is known, append `--provider "<provider>" --model "<primary-model>" --effort "<effort>"` to `run start`. Omit unknown values; never guess.

Telemetry is local supporting state, never an authority gate. On an operational/lock/write failure, set `TELEMETRY_STATUS=degraded`, continue from `tasks.json`, and report the exact coded failure. Never include prompts, code, commands, or raw tool output as event data/evidence.

## Dispatch and worker ownership

Before dispatch, set the selected parent and child task statuses to `in_progress`, then run:

```bash
node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" agent dispatch --run-id "$RUN_ID" --actor-id "$PRIMARY_ACTOR_ID" --tasks "<comma-separated parent+subtask ids>" --attempt <N> --idempotency-key "dispatch:$RUN_ID:<batch>:<N>" --project-dir "$PROJECT_ROOT" --json
```

When routing is known, append `--provider "<provider>" --model "<worker-model>" --effort "<effort>"` to `agent dispatch`. Pass the returned `workerActorId`, `assignmentId`, exact task ids/attempt, recorded provider/model/effort, project root, and command name `node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs"` inside `<workflow_telemetry>`. Omit unknown routing values; never guess. The worker:

1. emits `agent start`;
2. emits `task start` immediately before each assigned parent/subtask;
3. emits `task submit` after that task's implementation/focused evidence is ready;
4. emits `task block` for a genuine blocked assignment;
5. emits `agent finish` before its Completion Report.

Primary-direct work uses `task start` and `task submit` with `PRIMARY_ACTOR_ID`; no synthetic worker is created. A missing worker submission may be reconciled only from returned evidence by submitting as the primary with `--source-kind primary-reconciliation`; preserve the telemetry warning.

## Verification and acceptance

Start/finish waves and phases with their typed commands. After the primary's affected batch checks, record one verification gate with task ids and repo-relative evidence paths:

```bash
node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" gate record --run-id "$RUN_ID" --actor-id "$PRIMARY_ACTOR_ID" --kind verification --status pass --tasks "<ids>" --wave-id "<wave>" --evidence "<comma-separated paths>" --project-dir "$PROJECT_ROOT" --json
```

Persist every accepted child/parent status as `done` in `tasks.json`, then emit `task complete` leaf-first using the passing gate event id. Emit `task skip` only after the primary persists `skipped` plus its source-owned disposition. A failed check records a failed verification gate; repair and record a fresh gate rather than changing prior events.

Record intermediate/final review and proof results as `gate record --kind review|proof`. Evidence is path+hash metadata only. For a human authority wait, emit `human-input require`, then `resolve` when answered.

## Finish

- Parent-owned: finish the run as `implementation_ready` only after every task is completed/skipped and wave gates are current.
- Self-owned: finish as `passed` only after every task is completed/skipped and a passing proof gate exists.
- Use `failed`, `blocked`, or `interrupted` honestly for terminal/error state; never manufacture a pass because telemetry is degraded.

Include `RUN_ID`, event status (`complete|degraded`), and any reconciliation/degradation in the Execute handoff.
