# Knowledge Surfacing Runtime Baseline

Recorded on 2026-07-19 in `America/Los_Angeles` from
`/Users/joe/Dev/spectre`.

## Installed Toolchain

| Probe | Recorded output |
|---|---|
| `claude --version` | `2.1.215 (Claude Code)` |
| `codex --version` | `codex-cli 0.144.6` |
| `node --version` | `v24.18.0` |
| `git --version` | `git version 2.39.5 (Apple Git-154)` |
| `skills-ref --version` | Not installed on `PATH`; it is not a runtime prerequisite. |

Git is optional at runtime. The implementation must also be tested with Git
deliberately unavailable so non-Git projects retain the complete knowledge
workflow.

## Host Hook Limits

### Claude Code

- `UserPromptSubmit` command hooks receive the submitted `prompt` on stdin.
- `hookSpecificOutput.additionalContext` is injected alongside the prompt;
  `systemMessage` is the visible status channel.
- Each hook output string is capped at 10,000 characters. Oversized output is
  replaced by a preview and saved-file path.
- Spectre's planned limit is 9,000 characters for each final output string,
  preserving 1,000 characters of reserve. The exact framed output, including
  secondary metadata, must be measured.

Source: <https://code.claude.com/docs/en/hooks>

### Codex

- `UserPromptSubmit` command hooks receive the submitted `prompt`; matcher
  configuration is ignored for this event.
- `hookSpecificOutput.additionalContext` becomes extra developer context;
  `systemMessage` is surfaced in the UI or event stream.
- Each model-visible hook output is limited to roughly 2,500 tokens. Oversized
  output is replaced by a head-and-tail preview plus a saved-file path, or a
  truncated preview if the file cannot be written.
- The implementation must use a conservative dependency-free estimator and
  validate it in real Codex. Preview, saved-file, truncation, and fallback
  behavior are failures, not delivery strategies.

Source: <https://learn.chatgpt.com/docs/hooks>

## Packaging And Dependency Constraints

- `plugins/spectre/hooks/hooks.json` currently registers only the ordered
  `SessionStart` chain: `bootstrap.mjs`, `handoff-resume.mjs`, then
  `load-knowledge.mjs`, for `startup|clear|compact`.
- The canonical runtime is authored under `plugins/spectre`; Codex output under
  `plugins/spectre-codex` is generated and must not be hand-edited.
- Standalone Claude plugins cannot rely on root npm dependency resolution.
  Knowledge runtime code must therefore use Node built-ins.
- The root package currently has one production dependency:
  `@anthropic-ai/tokenizer@^0.0.4`. It is not a valid Codex budget counter.
- This baseline approves no new production runtime package.

## Agent Skills Record Contract

Canonical `SKILL.md` files use YAML frontmatter followed by Markdown. The
specification fields are:

| Field | Requirement |
|---|---|
| `name` | Required, 1-64 characters, lowercase letters/numbers/single hyphens, no leading/trailing/consecutive hyphen, equals directory name. |
| `description` | Required, 1-1,024 characters, describes what the skill does and when to use it. |
| `license` | Optional license name or bundled-file reference. |
| `compatibility` | Optional, 1-500 characters when present. |
| `metadata` | Optional map from string keys to string values. |
| `allowed-tools` | Optional experimental space-separated string. |

Spectre-specific values belong under `metadata`, including
`spectre-category`, `spectre-triggers`, `spectre-status`, and
`spectre-version`. `spectre-triggers` is a JSON-encoded array stored as one
metadata string.

The official command is:

```bash
skills-ref validate <fixture-skill-directory>
```

Use it only as a development-time oracle when authoring or refreshing golden
fixtures. It is not installed or invoked by production code and is not a new
package dependency.

Source: <https://agentskills.io/specification>

## Reproducible Host Fixture Protocol

The future harness owns `/tmp/spectre-knowledge-hosts-2026-07-19`, seeds the
isolated store, and prints a JSON manifest. From the repository root, prepare
and launch it with these exact commands:

```bash
REPO=/Users/joe/Dev/spectre
FIXTURE=/tmp/spectre-knowledge-hosts-2026-07-19
node "$REPO/scripts/verify-knowledge-hosts.mjs" --fixture-root "$FIXTURE" --json
cd "$FIXTURE"
SPECTRE_HOME="$FIXTURE/.spectre" claude --plugin-dir "$REPO/plugins/spectre" --permission-mode dontAsk
SPECTRE_HOME="$FIXTURE/.spectre" CODEX_HOME="$FIXTURE/.codex" codex -C "$FIXTURE"
```

The prepared manifest must contain these exact prompts:

- Prose: `Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.`
- Code: `Apply the knowledge for spectre payload code boundary and reply exactly SPECTRE_CODE_INLINE_OK.`
- No match: `This prompt deliberately matches no Spectre payload fixture.`

The prose and code records use distinct primary sentinels:
`SPECTRE_PRIMARY_PROSE_6000_V1` and `SPECTRE_PRIMARY_CODE_4000_V1`.

For each host, record these observations in the dated host evidence artifact:

1. The primary sentinel was visible to the model.
2. The exact required sentinel response was returned.
3. The concise `systemMessage` named the primary record.
4. No preview appeared.
5. No saved-file path appeared.
6. No truncation appeared.
7. No fallback notice appeared.
8. Repeating the prompt in the same session did not apply duplicate context.
9. Starting a new, clear, or compact context permitted reapplication.
10. The no-match prompt proceeded silently.

An accepted fixture fails the gate if any no-fallback observation is false.
