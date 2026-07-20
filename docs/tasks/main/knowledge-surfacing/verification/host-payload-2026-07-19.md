# Phase-1 Codex Host Payload Evidence

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
