# Phase-1 Codex Host Payload Evidence

> **Historical evidence — superseded 2026-07-22.** These observations verify the former prompt-time injection implementation and are preserved unchanged as historical host evidence. They do not describe the active usage-ranked knowledge contract, which uses a metadata-only SessionStart registry, neutral search for omitted or unknown records, and verified exact-ID load before application. Registry exposure is delivery evidence, search match/miss is discovery evidence, and successful verified load is the sole runtime rank signal.

## Wave 11 Final Verification

**Date:** 2026-07-19 20:09-20:29 PDT (`America/Los_Angeles`)
**Feature base:** `d43a27f` (`feat(knowledge): sync canonical runtime to codex`)
**Verifier repair:** `b0f6864` (`fix(verify): validate prompt-time knowledge delivery`)
**Result:** PASS, with one host-native lifecycle observation marked PARTIAL
**Fixture root:** `/tmp/spectre-knowledge-hosts-wave11-final-2026-07-19`

This is the final Wave 11 acceptance record and supersedes interim conclusions
later in this file where they differ. Both real hosts received the production
prompt-time payload inline. Automated lifecycle tests and direct production
adapter processes passed for `startup`, `clear`, and `compact`. Actual Codex
0.144.6 `/compact` is recorded separately as PARTIAL because the host recorded
compaction but did not dispatch its configured `SessionStart` hook; Spectre
therefore had no lifecycle event on which to clear the ledger. New real host
contexts did reapply the primary record.

### Versions

| Item | Value |
|---|---|
| Node.js | `v24.18.0` |
| npm | `11.16.0` |
| Git | `2.39.5 (Apple Git-154)` |
| Claude Code | `2.1.215` |
| Codex CLI | `0.144.6` |
| Spectre package | `6.0.0` |

### Verification Spine

| Command/gate | Result |
|---|---|
| `npm test` | PASS, `143/143` tests in 28 suites |
| Explicit knowledge/install/sync suite | PASS, `79/79` tests in 16 suites |
| `npm run sync-codex` | PASS |
| Second `npm run sync-codex` | PASS, idempotent |
| `npm run sync-codex -- --check --quiet` | PASS, clean |
| Verifier gate 1 | PASS, `162/162` structure checks |
| Verifier gate 2 | PASS, full test suite |
| Verifier gate 3 | PASS, `10/10` Codex checks |
| Verifier gate 4 | PASS, `32/32` real CLI checks |

The explicit suite command was:

```bash
node --test \
  plugins/spectre/hooks/scripts/test_knowledge-store.mjs \
  plugins/spectre/hooks/scripts/test_knowledge-record.mjs \
  plugins/spectre/hooks/scripts/test_knowledge-match.mjs \
  plugins/spectre/hooks/scripts/test_knowledge-migration.mjs \
  plugins/spectre/hooks/scripts/test_knowledge-search.mjs \
  plugins/spectre/hooks/scripts/test_load-knowledge.mjs \
  plugins/spectre/hooks/scripts/test_user-prompt-submit.mjs \
  src/main.test.js src/config.test.js src/install.test.js src/pack.test.js \
  scripts/test_sync-codex.cjs
```

Gate 4 initially found five stale registry-era assertions. The bounded verifier
repair changed only `.claude/skills/verify-spectre/scripts/lib.mjs` and
`gate4_cli.mjs`: it now drives real hook-event JSON and asserts
capability-only SessionStart plus prompt-time delivery/deduplication. No product
or generated Codex file changed for that repair.

### Real Host Commands

The final fixture was generated from the production runtime:

```bash
node scripts/verify-knowledge-hosts.mjs \
  --fixture-root /tmp/spectre-knowledge-hosts-wave11-final-2026-07-19 \
  --json
ln -s /Users/joe/.codex/auth.json \
  /tmp/spectre-knowledge-hosts-wave11-final-2026-07-19/.codex/auth.json
```

Claude sessions used the production plugin:

```bash
SPECTRE_HOME="$FIXTURE/.spectre" claude -p \
  --plugin-dir /Users/joe/Dev/spectre/plugins/spectre \
  --permission-mode dontAsk --session-id "$SESSION_ID" "$PROMPT"
```

Codex sessions used the generated fixture hook configuration:

```bash
SPECTRE_HOME="$FIXTURE/.spectre" CODEX_HOME="$FIXTURE/.codex" \
  codex exec --json --ignore-user-config --skip-git-repo-check \
  --dangerously-bypass-hook-trust -s read-only -C "$FIXTURE" "$PROMPT"
```

Exact boundary prompts:

```text
For the spectre payload prose boundary fixture, reply with exactly SPECTRE_PROSE_INLINE_OK and nothing else.
For the spectre payload code boundary fixture, reply with exactly SPECTRE_CODE_INLINE_OK and nothing else.
This prompt deliberately matches no Spectre payload fixture.
```

### Boundary Payload Evidence

| Host/case | Session/thread | Persisted result |
|---|---|---|
| Claude prose | `44444444-4444-4444-8444-444444444444` | Two `6,419`-byte contexts: initial and post-reset; repeat emitted none |
| Claude code | `55555555-5555-4555-8555-555555555555` | One `4,412`-byte context |
| Claude no-match | `66666666-6666-4666-8666-666666666666` | Zero Spectre contexts/notices |
| Codex prose | `019f7d83-b1dd-72c0-883b-3a6563dd44f1` | One `6,419`-byte context; same-thread repeat emitted none |
| Codex code | `019f7d84-59ca-75a2-bb52-3f43b3656571` | One `4,412`-byte context |
| Codex no-match | `019f7d84-a503-78b1-b159-444b9321737e` | Zero Spectre contexts |
| Codex new context | `019f7d89-06b3-7993-8a89-08ff83d5c989` | Primary reapplied in a fresh actual interactive context |

Persisted transcript inspection:

```json
{"case":"claude-prose","payloadCount":2,"bytes":[6419,6419],"sha256":["f4ed29f7107b1bf6c26b65e9e08d2784881423813d249cd142aed2b85b7c87f6","f4ed29f7107b1bf6c26b65e9e08d2784881423813d249cd142aed2b85b7c87f6"]}
{"case":"codex-prose","payloadCount":1,"bytes":[6419],"sha256":["f4ed29f7107b1bf6c26b65e9e08d2784881423813d249cd142aed2b85b7c87f6"]}
{"case":"claude-code","payloadCount":1,"bytes":[4412],"sha256":["2b879c4683bb24b836d8114147010972a896b15200fa4754e8902cd684a36473"]}
{"case":"codex-code","payloadCount":1,"bytes":[4412],"sha256":["2b879c4683bb24b836d8114147010972a896b15200fa4754e8902cd684a36473"]}
{"case":"claude-no-match","payloadCount":0}
{"case":"codex-no-match","payloadCount":0}
```

The Claude and Codex hashes match for each fixture. The persisted inputs end
with the fixture terminal content and contain no fallback artifact reference.
No preview, saved-file handoff, or fallback notice was emitted. Terminal/UI
folding of long hook output did not alter the model input.

### Lifecycle Evidence

| Observation | Result | Evidence |
|---|---|---|
| Same-session repeat | PASS | Claude prompt hook stdout was empty; Codex transcripts contain one primary across repeated prompts |
| Fresh/new context | PASS | Both hosts applied the primary again under a different session/thread ID |
| Production compact event | PASS | Direct `load-knowledge.mjs --host claude|codex` processes received host-shaped `SessionStart`/`compact`, cleared the addressed ledger, and emitted capability-only output |
| Automated startup/clear/compact | PASS | Focused adapter tests cover both hosts, addressed and missing-session resets |
| Actual Claude reset/resume | PASS | Session `4444...` contains two identical primary contexts separated by an empty repeat |
| Actual Codex `/compact` | PARTIAL | Interactive thread `019f7d89-06b3-7993-8a89-08ff83d5c989` records `compacted` and `context_compacted` but no SessionStart dispatch; its ledger remained |

The Codex PARTIAL result is a host event-delivery limitation, not described as
a Spectre pass. No transcript polling, fallback reset, or product workaround
was added. Spectre's event handler behavior is green when the event is
delivered, and actual new-context reapplication is green.

### Multiple Matches

Four additional active records shared the prose trigger. Fresh real sessions
were `77777777-7777-4777-8777-777777777777` (Claude) and
`019f7d8b-50d8-73e2-8b59-0c2647d36350` (Codex).

```json
{"host":"claude","bytes":6957,"sha256":"8b5ca16e2bf8656b88a79e9d61ae38aa796809e4d51004bfdba8fbd7b939fd3d","secondaryMetadata":3,"omitted":1,"secondaryBodies":0}
{"host":"codex","bytes":6957,"sha256":"8b5ca16e2bf8656b88a79e9d61ae38aa796809e4d51004bfdba8fbd7b939fd3d","secondaryMetadata":3,"omitted":1,"secondaryBodies":0}
```

Claude showed
`spectre: applied testing-payload-prose; 3 also matching; 1 omitted`.
Both hosts returned `SPECTRE_PROSE_INLINE_OK`.

### Linked Worktree

A record was registered from
`/tmp/spectre-wave11-linked-20260719-main` and searched/matched from linked
worktree `/tmp/spectre-wave11-linked-20260719-worktree`. Both resolved the
canonical store under
`/tmp/spectre-wave11-linked-home-20260719/projects/tmp/spectre-wave11-linked-20260719-main`.
Actual Codex thread `019f7d8c-ab77-7092-b30e-36e7c821b483`, whose persisted
cwd is the linked worktree, received the `403`-byte
`testing-linked-worktree` context and returned
`SPECTRE_LINKED_WORKTREE_OK`.

### Non-Git Lifecycle

The non-Git project was `/tmp/spectre-wave11-nongit-20260719`, with canonical
state under `/tmp/spectre-wave11-nongit-home-20260719`.

1. Project-scope Codex install completed.
2. `knowledge register` created `testing-nongit-lifecycle` outside the project.
3. `knowledge search` returned it as an exact phrase match.
4. Actual Codex threads `019f7d8d-48f3-71a0-a542-e97b0e46fb98` and
   `019f7d8d-7aba-76e0-bd03-f755fd85fdaf` each returned
   `SPECTRE_NONGIT_LIFECYCLE_OK`, proving fresh-process reapplication.
5. Actual Claude `/spectre-learn` registered and re-read
   `testing-nongit-learn-sentinel` after migrate/search/proposal/registration.
6. No `.claude/` or `.agents/` learned record appeared in the project.
7. Project uninstall removed the managed runtime and manifest.
8. Both canonical records remained after uninstall; no project knowledge copy
   existed.

The first headless learn attempt used `dontAsk` and correctly stopped because
Bash was denied. The accepted run used `bypassPermissions` against only the
isolated fixture home, allowing the skill's real CLI transaction to complete.

### Migration Debt

The legacy fixture
`feature-grandfathered-wave11` was `10,719` bytes under `.claude/skills` and
had an allowlisted `spectre-recall/references/registry.toon` row.

```json
{"code":"OVERSIZED","grandfatheredClaudeNativeDiscovery":true,"canonicalCopy":false,"legacySourcePreserved":true,"registryRowPreserved":true}
```

`knowledge migrate --json` returned
`grandfatheredClaudeNativeDiscoveryIncomplete: true`. Doctor JSON reported
`migration.status: "debt"`, `unresolvedCount: 1`, and
`nativeDiscovery.status: "grandfathered_claude"`. Human doctor output named
the record as still eligible for Claude native discovery.

### Final Assessment

Production inline delivery, exact payload preservation, deduplication,
new-context reapplication, no-match silence, secondary capping, linked
worktree identity, non-Git learn/register/search/runtime/uninstall behavior,
and conservative migration debt all passed. The only partial observation is
native Codex 0.144.6 `/compact`, where the host did not dispatch the hook event
Spectre requires; the behavior is recorded without broadening product scope.

**Date:** 2026-07-19 17:38 PDT (`America/Los_Angeles`)
**Result:** PASS
**Gate:** Phase-1 real-host payload stop gate

Both accepted boundary fixtures arrived inline in the public Codex CLI. The
model returned each required response, the TUI named the applied primary
record, and the persisted model inputs contain the complete framed payloads.
No host fallback preview, saved-file path, truncation, or fallback notice was
observed. Phase 2 is not blocked by this gate.

## Runtime

| Item | Value |
|---|---|
| Repository commit before evidence | `70c9c12eb85ef92b9b3485a296d43bdad5752e19` |
| Codex CLI | `codex-cli 0.144.6` |
| Codex model | `gpt-5.6-sol` (default on fresh acceptance runs) |
| Node.js | `v24.18.0` |
| Fixture root | `/tmp/spectre-knowledge-hosts-2026-07-19` |
| Isolated `CODEX_HOME` | `/tmp/spectre-knowledge-hosts-2026-07-19/.codex` |
| Isolated `SPECTRE_HOME` | `/tmp/spectre-knowledge-hosts-2026-07-19/.spectre` |

The isolated `CODEX_HOME` linked only the existing Codex `auth.json`. The
fixture installed its own `hooks.json`, copied the current knowledge runtime,
and used a read-only sandbox. `--dangerously-bypass-hook-trust` applied only
to the generated, inspected fixture hook.

## Fixture Manifest

| Constant | Value |
|---|---:|
| Prose core characters | `6,000` |
| Code core characters | `4,000` |
| Secondary metadata reserve | `750` |
| Codex estimated-token limit | `2,250` |
| Codex reserve | `250` |
| Prose primary sentinel | `SPECTRE_PRIMARY_PROSE_6000_V1` |
| Code primary sentinel | `SPECTRE_PRIMARY_CODE_4000_V1` |

Measured final framed payloads:

| Fixture | Characters | UTF-8 bytes | Estimated tokens | Result |
|---|---:|---:|---:|---|
| Prose | `6,438` | `6,438` | `1,639 / 2,250` | accepted |
| Code | `4,432` | `4,432` | `1,240 / 2,250` | accepted |

Exact prompts:

```text
Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.
Apply the knowledge for spectre payload code boundary and reply exactly SPECTRE_CODE_INLINE_OK.
This prompt deliberately matches no Spectre payload fixture.
```

## Commands

Fixture preparation and authentication:

```bash
rm -rf /tmp/spectre-knowledge-hosts-2026-07-19
node /Users/joe/Dev/spectre/scripts/verify-knowledge-hosts.mjs \
  --fixture-root /tmp/spectre-knowledge-hosts-2026-07-19 --json
ln -s "$HOME/.codex/auth.json" \
  /tmp/spectre-knowledge-hosts-2026-07-19/.codex/auth.json
CODEX_HOME=/tmp/spectre-knowledge-hosts-2026-07-19/.codex \
  codex login status
```

Prose acceptance run:

```bash
SPECTRE_HOME=/tmp/spectre-knowledge-hosts-2026-07-19/.spectre \
CODEX_HOME=/tmp/spectre-knowledge-hosts-2026-07-19/.codex \
codex exec --json --ignore-user-config --skip-git-repo-check \
  --dangerously-bypass-hook-trust -s read-only \
  -C /tmp/spectre-knowledge-hosts-2026-07-19 \
  -o /tmp/spectre-knowledge-hosts-2026-07-19/prose-response.txt \
  'Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.'
```

Same-session repeat:

```bash
SPECTRE_HOME=/tmp/spectre-knowledge-hosts-2026-07-19/.spectre \
CODEX_HOME=/tmp/spectre-knowledge-hosts-2026-07-19/.codex \
codex exec resume --json --ignore-user-config --skip-git-repo-check \
  --dangerously-bypass-hook-trust \
  -o /tmp/spectre-knowledge-hosts-2026-07-19/prose-repeat-final-response.txt \
  019f7cf0-7baf-7c20-a919-25125e07cf88 \
  'Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.'
```

Code acceptance run:

```bash
SPECTRE_HOME=/tmp/spectre-knowledge-hosts-2026-07-19/.spectre \
CODEX_HOME=/tmp/spectre-knowledge-hosts-2026-07-19/.codex \
codex exec --json --ignore-user-config --skip-git-repo-check \
  --dangerously-bypass-hook-trust -s read-only \
  -C /tmp/spectre-knowledge-hosts-2026-07-19 \
  -o /tmp/spectre-knowledge-hosts-2026-07-19/code-response.txt \
  'Apply the knowledge for spectre payload code boundary and reply exactly SPECTRE_CODE_INLINE_OK.'
```

No-match acceptance run used the same flags with this prompt:

```text
This prompt deliberately matches no Spectre payload fixture.
```

The visible-status check used the public interactive CLI with
`--no-alt-screen`, the same isolated homes, read-only sandboxing, and the
prose prompt. The directory trust prompt was accepted for this disposable
fixture, and `/quit` ended the PTY immediately after the response.

## Observations

| Required observation | Result | Evidence |
|---|---|---|
| Primary sentinel visible | PASS | Persisted prose and code developer inputs contain their unique primary sentinels. |
| Required response observed | PASS | Codex returned `SPECTRE_PROSE_INLINE_OK` and `SPECTRE_CODE_INLINE_OK`. |
| `systemMessage` named primary | PASS | TUI showed `UserPromptSubmit hook (completed)` and `warning: Spectre applied testing-payload-prose (0 additional matches).` |
| Host fallback preview absent | PASS | Persisted inputs equal the complete expected `6,438` and `4,432` character frames. |
| Saved-file path absent | PASS | No saved-file path appeared in events, responses, or applied developer input. |
| Truncation absent | PASS | Both persisted payload lengths and terminal markers exactly match the generated frames. |
| Fallback notice absent | PASS | No fallback notice appeared in events, responses, or applied developer input. |
| Repeat deduped | PASS | After repeated prompts, thread `019f7cf0-7baf-7c20-a919-25125e07cf88` contains exactly one applied developer payload. |
| New context reapplied | PASS | Fresh PTY thread `019f7cf2-efd8-72c0-ab37-25a3d88c29c9` contains the full prose payload and returned the required response. |
| No-match silent | PASS | Thread `019f7cf2-2956-7450-8dd5-53d1b13ec068` contains zero applied Spectre developer payloads. |

The TUI summarizes long hook output as `... +98 lines (ctrl + t to view
transcript)`. This is ordinary display folding, not payload-limit fallback:
the persisted model input contains all `6,438` expected characters, ends with
the expected terminal marker, and contains no saved-file or fallback notice.

## Transcript Checks

Programmatic inspection of the isolated persisted transcripts returned:

```json
{"case":"prose-and-repeat","payloadCount":1,"expectedLength":6438,"exact":true,"hostFallbackTerms":false}
{"case":"code","payloadCount":1,"expectedLength":4432,"exact":true,"hostFallbackTerms":false}
{"case":"no-match","payloadCount":0,"expectedLength":0,"exact":true,"hostFallbackTerms":false}
{"case":"fresh-prose-pty","payloadCount":1,"expectedLength":6438,"exact":true,"hostFallbackTerms":false}
```

The CLI emitted the expected warning that hook trust was explicitly bypassed
for the invocation. That warning is unrelated to payload fallback. A
diagnostic resume also emitted a model-change warning; it did not affect hook
deduplication, and the final same-session acceptance command above used no
explicit model override.

## Phase 4 Production Adapter Reverification

**Date:** 2026-07-19 18:42-18:46 PDT (`America/Los_Angeles`)
**Result:** PASS
**Gate:** Production `UserPromptSubmit` plus capability-only `SessionStart`

The Phase 1 probe hook was replaced in the isolated Codex fixture with copies
of the canonical production `user-prompt-submit.mjs`, `load-knowledge.mjs`,
and shared `knowledge/` runtime. Claude loaded the same canonical production
hooks through `--plugin-dir`.

### Runtime

| Item | Value |
|---|---|
| Repository base before evidence | `4b3f9f3` |
| Claude launcher/runtime | `2.1.215 (Claude Code)` / `claude-opus-4-8` |
| Codex launcher | `codex-cli 0.144.6` |
| Codex persisted session/TUI self-report | `0.144.0` / `gpt-5.6-sol` |
| Node.js | `v24.18.0` |
| Fixture root | `/tmp/spectre-knowledge-hosts-phase4-2026-07-19` |
| Isolated Codex home | `/tmp/spectre-knowledge-hosts-phase4-2026-07-19/.codex` |
| Isolated Spectre home | `/tmp/spectre-knowledge-hosts-phase4-2026-07-19/.spectre` |

The Codex launcher/runtime version discrepancy is reported as observed rather
than normalized away. The real sessions ran the production adapters copied
from this working tree.

### Commands

Fixture preparation:

```bash
node /Users/joe/Dev/spectre/scripts/verify-knowledge-hosts.mjs \
  --fixture-root /tmp/spectre-knowledge-hosts-phase4-2026-07-19 --json
ln -s /Users/joe/.codex/auth.json \
  /tmp/spectre-knowledge-hosts-phase4-2026-07-19/.codex/auth.json
```

Claude production-hook run:

```bash
cd /tmp/spectre-knowledge-hosts-phase4-2026-07-19
SPECTRE_HOME="$PWD/.spectre" claude -p \
  --output-format stream-json --include-hook-events --verbose \
  --permission-mode dontAsk \
  --plugin-dir /Users/joe/Dev/spectre/plugins/spectre \
  --session-id 11111111-1111-4111-8111-111111111111 \
  'Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.'
```

The same command used session
`33333333-3333-4333-8333-333333333333` and the exact code prompt for the
code fixture. Same-session repeat used `--resume`; the no-match run used
session `22222222-2222-4222-8222-222222222222`.

Codex production-hook run:

```bash
SPECTRE_HOME="$PWD/.spectre" CODEX_HOME="$PWD/.codex" \
  codex exec --json --ignore-user-config --skip-git-repo-check \
  --dangerously-bypass-hook-trust -s read-only -C "$PWD" \
  'Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.'
```

The code and no-match runs used the same command with their exact manifest
prompts. Same-session repeat used:

```bash
SPECTRE_HOME="$PWD/.spectre" CODEX_HOME="$PWD/.codex" \
  codex exec resume --json --ignore-user-config --skip-git-repo-check \
  --dangerously-bypass-hook-trust \
  019f7d31-a546-7f22-9d85-b4507641f233 \
  'Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.'
```

For deterministic compact verification in both headless hosts, the production
`load-knowledge.mjs` adapter received a `SessionStart` event with
`source: "compact"` and the original session ID. Resuming each original real
host thread then reapplied the production payload. Automated process tests
cover host-shaped `startup`, `clear`, and `compact` inputs both with and
without `session_id`.

### Observations

| Required observation | Claude | Codex |
|---|---|---|
| Prose response | `SPECTRE_PROSE_INLINE_OK` | `SPECTRE_PROSE_INLINE_OK` |
| Code response | `SPECTRE_CODE_INLINE_OK` | `SPECTRE_CODE_INLINE_OK` |
| Applied notice | `spectre: applied testing-payload-prose; 0 also matching` | Same notice visible in TUI |
| Repeat before reset | Production hook stdout empty | One persisted applied payload |
| Compact reset | Original thread reapplied | Original thread reapplied |
| No match | Production hook stdout empty | Zero persisted applied payloads |
| Preview/file/truncation/fallback | Absent | Absent |

Persisted model-input checks:

```json
{"case":"claude-prose","payloadCount":2,"lengths":[6419,6419],"exact":true,"sha256":"f4ed29f7107b1bf6c26b65e9e08d2784881423813d249cd142aed2b85b7c87f6","fallback":false}
{"case":"codex-prose","payloadCount":2,"lengths":[6419,6419],"exact":true,"sha256":"f4ed29f7107b1bf6c26b65e9e08d2784881423813d249cd142aed2b85b7c87f6","fallback":false}
{"case":"claude-code","payloadCount":1,"lengths":[4412],"exact":true,"sha256":"2b879c4683bb24b836d8114147010972a896b15200fa4754e8902cd684a36473","fallback":false}
{"case":"codex-code","payloadCount":1,"lengths":[4412],"exact":true,"sha256":"2b879c4683bb24b836d8114147010972a896b15200fa4754e8902cd684a36473","fallback":false}
{"case":"claude-no-match","payloadCount":0,"exact":true,"fallback":false}
{"case":"codex-no-match","payloadCount":0,"exact":true,"fallback":false}
```

The two prose payloads in each original thread are the initial application
and the post-compact reapplication. The intervening repeat did not add a
payload. Each persisted payload exactly equals direct production-adapter
output; the matching hashes across Claude and Codex prove adapter parity.

## Automated Harness Check

```bash
node --test plugins/spectre/hooks/scripts/test_knowledge-payload.mjs
```

Result: `6/6` passed. The tests cover boundary estimation, generated hook
wiring, exact prompt/sentinel contracts, same-session deduplication,
new-session reapplication, and no-match silence.

## Comprehensive Review Closure

**Date:** 2026-07-19 21:01-21:20 PDT (`America/Los_Angeles`)
**Repository base:** `c5e6aa1`
**Result:** PASS
**Scope:** dense Codex payload, eligible Git migration, and divergent Git debt

### Runtime

| Item | Value |
|---|---|
| Claude Code | `2.1.215` |
| Claude model | `claude-opus-4-8` |
| Codex CLI | `0.144.6` |
| Node.js | `v24.18.0` |
| Fixture root | `<fixture>` |
| Eligible project | `<fixture>/eligible-git` |
| Divergent-debt project | `<fixture>/debt-git` |

Both migration projects were initialized with `git init`. Their isolated
canonical stores were `<fixture>/eligible-home` and `<fixture>/debt-home`.
Paths below are relative or redacted; no user home or repository checkout path
is required to interpret the result.

### Commands

The eligible migration ran through the real Claude host and production plugin
hooks:

```bash
git init <fixture>/eligible-git
cd <fixture>/eligible-git
SPECTRE_HOME=<fixture>/eligible-home claude -p \
  --output-format stream-json --include-hook-events --verbose \
  --permission-mode dontAsk --plugin-dir <repo>/plugins/spectre \
  --session-id 81818181-1818-4818-8818-181818181818 \
  'Apply the eligible git migration knowledge and reply exactly SPECTRE_GIT_MIGRATION_OK.'
```

The divergent fixture exercised explicit migration, project-native Codex
configuration filtering, and doctor:

```bash
git init <fixture>/debt-git
SPECTRE_HOME=<fixture>/debt-home node <repo>/bin/spectre.js \
  knowledge migrate --project-dir <fixture>/debt-git --json
SPECTRE_HOME=<fixture>/debt-home node <repo>/bin/spectre.js \
  update codex --scope project --project-dir <fixture>/debt-git
SPECTRE_HOME=<fixture>/debt-home node <repo>/bin/spectre.js \
  doctor codex --scope project --project-dir <fixture>/debt-git --json
```

### Dense Codex Probe

This was one real Codex host run for the selected near-boundary fixture, not a
claim about every dense payload or future host version.

| Observation | Result |
|---|---|
| Thread | `019f7daf-6edf-7200-9759-94cfc441bc57` |
| Dense core | `2,050` mixed alphanumeric characters |
| Exact registration frame | `2,207 / 2,250` estimated tokens, accepted |
| Exact runtime frame | `1,654 / 2,250` estimated tokens, accepted |
| Applied contexts | Exactly one |
| Required response | `SPECTRE_DENSE_INLINE_OK` |
| Preview/file/truncation/fallback | Absent |
| Raw transcript SHA-256 | `8eb8c21e9d7812218639ceac68fc54bdb956025bf30a839df66d0a64fe63cf34` |
| Applied context SHA-256 | `44d142e2416389d5bf72cdd193526c8d063b90f948c54c8d15fc0aafdfcc4838` |

The persisted developer context contained
`SPECTRE_PRIMARY_DENSE_ALPHANUMERIC_V1` in full and the assistant response was
exactly the required sentinel.

### Eligible Git Migration

The Git fixture began with one allowlisted
`.claude/skills/feature-git-eligible` record and one corresponding legacy
registry row. The real Claude `SessionStart:startup` hook migrated it before
the same session's prompt hook matched it.

| Observation | Result |
|---|---|
| Claude session | `81818181-1818-4818-8818-181818181818` |
| Migration report | `MIGRATED` |
| SessionStart notice | Capability-only knowledge/search/learn notice emitted |
| Prompt notice | `spectre: applied feature-git-eligible; 0 also matching` |
| Applied contexts | Exactly one |
| Primary sentinel | `SPECTRE_GIT_MIGRATION_PRIMARY_V1` present |
| Required response | `SPECTRE_GIT_MIGRATION_OK` |
| Canonical location | Isolated `SPECTRE_HOME`, outside the Git repository |
| Repository knowledge copy | Absent |
| Legacy source and registry | Removed after successful migration |

The final cleanup assertion required the canonical `SKILL.md`, index, and
migration report to exist while the legacy source and registry were absent.
The same host session then read that canonical record through the production
prompt hook. This preserves the production commit-before-cleanup contract
without using a fixture-only migration path.

Hashes:

```text
canonical SKILL.md  51f75c65eaf4d482d7584522eed2b2f5775f8d059a7fe5932e2bc52d100439fd
migration report    20f4f14cf7c2f010d9d9c39bb78d18fdaf8d9bb0555432200b32c7b58d35ac5a
Claude stream       f79535946749853ec215121cb33191e4457933a2a3bf5ba2147591344c385c4d
Claude transcript   ef2c10205e2e2766fffe6b040d2d24196e4e0ce90c034fbe6e2b891717ed5970
```

### Divergent Migration Debt

The second Git fixture used one allowlisted ID with byte-distinct `.claude`
and `.agents` sources. It also contained an unrelated enabled native skill and
an existing `[[skills.config]]` entry with a custom field.

| Observation | Result |
|---|---|
| Migration classification | `DIVERGENT` |
| Canonical winner | None; canonical index contains `0` records |
| Source preservation | Both divergent sources byte-identical before/after |
| Registry preservation | Both legacy rows remain |
| Doctor migration status | `debt` |
| Doctor unresolved count | `1` |
| Doctor issue | `feature-divergent-git` / `DIVERGENT` |
| Unrelated native skill | Bytes unchanged |
| Unrelated config | Original enabled block and custom field byte-preserved |

Source and evidence hashes:

```text
.claude divergent source  5347732f10f727cbd4f3a653032aa563a10918336fb5891a172edce22d1c70e4
.agents divergent source  43fdd987f27ed7dfdef7031e2b9b0358ccae354cdcd616b5a6efce100cea54a8
unrelated native skill    e9c9018e6e66de6e93b824e2263895b974c525496435becaeb6dbb1c9ef182a2
migration report          87840dafb582198533d569eb24646824f1602c4bd595ac784204828dd8ad5a50
doctor JSON               01e4265b7bcda525d9687c2eb1b3e4ed8ef44959f43cfc85f63d268badfdb5a6
```

Doctor separately reported the disposable project as untrusted because it was
not added to Codex's trust configuration. That does not affect report parsing
or the migration-debt result, and this fixture is not claimed as
resolver-active host proof.

No host prompt was used to claim divergent knowledge application: migration
intentionally created no canonical record, so doing so would have fabricated
a winner. The production migrate/update/doctor path instead proved
non-destructive preservation, native configuration retention, and truthful
migration debt.
