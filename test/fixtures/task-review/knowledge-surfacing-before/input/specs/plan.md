# Deterministic Project Knowledge Surfacing: Implementation Plan

## 1. Overview

Spectre currently exposes learned project knowledge through native project skills, a generated registry, and a SessionStart override. That path consumes recurring context and still relies on the model to notice a match and load the right skill.

Replace that architecture with a dependency-free, user-level knowledge service implemented as shared Node modules inside the canonical Spectre plugin runtime:

- Resolve every project, Git or not, to a readable store under `~/.spectre/projects/`.
- Treat skill-shaped `SKILL.md` records as canonical and a machine index as disposable.
- Migrate registry-allowlisted legacy learnings conservatively.
- Match active declared triggers inside one `UserPromptSubmit` hook.
- Inject one primary record directly and expose bounded secondary-match metadata.
- Keep SessionStart limited to capability guidance and lifecycle maintenance.
- Expose lexical search and internal registration/migration commands through the same runtime.

The canonical implementation remains under `plugins/spectre`; the Codex plugin stays generated. The work is sequenced so store integrity, payload limits, and migration safety are proven before legacy discovery paths are retired.

## 2. Technical Approach

### 2.1 One canonical runtime, thin host adapters

Add cohesive modules under `plugins/spectre/hooks/scripts/knowledge/` for project identity and storage, record parsing and validation, matching and ranking, migration, and search. Avoid single-function modules. The existing `plugins/spectre/hooks/scripts/lib.mjs` stays in place because bootstrap and handoff hooks already import it. The new modules use only Node built-ins so the standalone Claude plugin and the npm-installed Codex runtime execute the same behavior without different dependency resolution.

The existing hook translator already copies every top-level non-test `.mjs` runtime file and rewrites plugin-root commands (`scripts/translators/hooks.cjs:20-45`, `scripts/translators/hooks.cjs:70-105`). Extend its flat `listRuntimeMjsFiles` traversal with a recursive walker that copies every non-test `.mjs` under `scripts/knowledge/`, adds every generated nested path to the stale-file keep set, and rewrites an explicit `--host claude` argument to `--host codex`. Tests must prove nested modules copy, nested stale files are removed, and nested `test_*.mjs` files are excluded. Do not author logic under `plugins/spectre-codex`.

`src/lib/knowledge.js` becomes an npm-side adapter to the canonical runtime contracts instead of retaining a second registry/override implementation. Installer, doctor, and CLI code call the shared modules or their stable command entry points.

### 2.2 Readable project identity

Add `resolveProjectStore(projectDir, options)`:

1. Resolve the supplied directory to an absolute canonical path, using `realpath` when possible.
2. Probe Git without requiring it. If available, canonicalize the repository root and `git rev-parse --git-common-dir`.
3. Search existing `project.json` files for the same Git common directory first, then the same canonical project root.
4. If no store exists, propose `~/.spectre/projects/<parent>/<project>/`.
5. If that readable path is claimed by a different identity, prepend parent segments from right to left until unique.
6. Persist the new `project.json` atomically while holding the store-allocation lock.

Git failures fall back to canonical-path identity. Linked worktrees converge through the common directory. A moved non-Git directory receives a new readable store because no stable identity can prove continuity. The prior store remains untouched for manual agent-assisted recovery when the user asks; Spectre does not add an automatic relocation heuristic or command in this scope.

Support `SPECTRE_HOME` as a test/runtime override, defaulting to `~/.spectre`. Extend the current path helpers, which only know project-local registry and recall paths (`src/lib/paths.js:57-82`).

### 2.3 Canonical record and disposable index

Canonical layout:

```text
~/.spectre/projects/<readable-path>/
  project.json
  knowledge/
    <knowledge-id>/
      SKILL.md
      references/
  index.json
  migration-report.json
  runtime/
    sessions/
```

`SKILL.md` frontmatter schema:

```yaml
name: feature-codex-spectre-implementation
description: Use when modifying the Codex Spectre integration.
category: feature
triggers:
  - codex install
  - project skills
status: active
version: 1
```

Rules:

- `name` is lowercase kebab case and equals the directory name.
- `description` is a non-empty, single-purpose search summary.
- `category` uses the existing learn categories.
- `triggers` is a non-empty array of unique, non-empty phrases.
- `status` is one of `active`, `disputed`, `superseded`, or `archived`.
- `version` is a positive integer used for session deduplication.
- The complete UTF-16 JavaScript string length of `SKILL.md`, including frontmatter, is at most 9,000 characters.
- Only active records enter the automatic match set.

Use a real frontmatter parser implemented for this constrained schema, not registry-line or description mutation. Reject duplicate keys, unknown lifecycle values, invalid arrays, mismatched IDs, and malformed delimiters with file-specific diagnostics.

`index.json` is derived and replaceable:

```json
{
  "schemaVersion": 1,
  "generatedAt": "ISO-8601",
  "records": [
    {
      "id": "feature-codex-spectre-implementation",
      "category": "feature",
      "description": "Use when ...",
      "triggers": ["codex install"],
      "status": "active",
      "version": 1,
      "recordPath": "knowledge/feature-codex-spectre-implementation/SKILL.md",
      "sourceFingerprint": "sha256:..."
    }
  ]
}
```

On prompt resolution and search, compare directory membership, file size/mtime, and stored SHA-256 fingerprints. Rebuild from canonical records when the index is absent, corrupt, or stale. Invalid records are excluded and reported without invalidating valid records.

`project.json` is canonical identity metadata:

```json
{
  "schemaVersion": 1,
  "canonicalProjectRoot": "/Users/joe/Dev/spectre",
  "gitRepositoryRoot": "/Users/joe/Dev/spectre",
  "gitCommonDir": "/Users/joe/Dev/spectre/.git",
  "createdAt": "ISO-8601"
}
```

The Git fields are omitted for non-Git projects. JSON files use fixed version-1 shapes in this scope; behavior for future schema versions is deferred until a future migration requires it.

### 2.4 Atomic writes and concurrency

Implement `withStoreLock(storePath, operation, fn)` with an exclusive `open(..., "wx")` lock file containing PID, timestamp, and operation. Registration and explicit migration wait up to 5 seconds. A lock is stale when its PID is no longer alive or its timestamp is more than 60 seconds old; remove a stale lock and retry acquisition once. Every JSON or record commit writes a same-directory temporary file, fsyncs it, and renames it atomically.

Prompt hooks never wait behind a writer. If the lock is held, they use a fresh valid index; if none exists, they scan canonical records read-only and skip cache persistence. A hook failure or timeout always returns no injected context and allows the prompt to continue.

SessionStart migration uses the same 5-second bounded wait. On timeout it writes a diagnostic to stderr and proceeds without migration; the next SessionStart, install/update, `/spectre:learn`, or explicit migration retries. Explicit mutating commands return a lock-timeout error instead of pretending to succeed.

When an index fingerprint and record bytes differ, the reader re-reads once. If the new bytes parse and validate, it frames those verified bytes; otherwise it skips the record silently. Spectre never injects content whose fingerprint was not verified.

Registration stages the proposed record and rebuilt index, validates both, and only then replaces canonical files. A failed validation leaves the prior record and index byte-identical.

### 2.5 Payload budget feasibility gate

Keep 9,000 characters as the storage maximum, not an assertion that every record fits every host.

Before migration or hook delivery is enabled, implement and verify a dependency-free `measurePayload(host, framedContent)` contract:

- Claude rejects any individual output string over 9,000 characters, preserving reserve below the documented 10,000-character cap.
- Codex uses a deterministic conservative estimator plus a framing reserve against the documented approximate 2,500-token limit.
- Registration validates the exact primary frame that both host adapters would emit, including headings and the maximum secondary metadata allowance.
- Runtime rechecks the final frame before writing JSON.

Create prose-heavy, code-heavy, punctuation-heavy, and Unicode fixtures around the acceptance boundary. The estimator must:

- accept every curated prose-heavy core fixture up to 6,000 characters;
- accept every curated code-heavy core fixture up to 4,000 characters;
- record the measured accepted boundary for every fixture class as a named constant with rationale;
- never accept a boundary fixture that triggers Codex preview/file fallback.

The 6,000/4,000 thresholds are minimum useful payloads, not alternate storage maxima. A record may use the full 9,000-character storage allowance when its measured framed payload remains safe.

#### Real-host payload protocol

Add `scripts/verify-knowledge-hosts.mjs` to create an isolated fixture project and `SPECTRE_HOME`, install the current generated runtime, seed prose/code boundary records containing unique sentinels, and print the exact commands below with resolved paths:

```bash
claude --plugin-dir "<repo>/plugins/spectre" --permission-mode dontAsk
CODEX_HOME="<fixture>/.codex" codex -C "<fixture>"
```

In each interactive host:

1. Submit the fixture's exact matching prompt.
2. Confirm the primary sentinel is visible to the model and its required sentinel response is returned.
3. Confirm the concise `systemMessage` names the primary record.
4. Confirm the transcript contains no preview, saved-file path, truncation, or fallback notice.
5. Submit the prompt again in the same session and confirm no duplicate context is applied.
6. Start a new/clear/compact context and confirm the knowledge can be applied again.
7. Submit the fixture's no-match prompt and confirm it proceeds silently.

Record CLI versions, generated fixture manifest, exact commands/prompts, sentinel observations, and pass/fail results in a dated `docs/tasks/main/knowledge-surfacing/verification/host-payload-YYYY-MM-DD.md` artifact. This is a required manual gate when the hosts expose no deterministic headless hook inspection. Any accepted fixture that falls back fails the gate. On failure, stop before migration and append measured estimator values plus observed host behavior to `task_context.md` for a scope-level decision; do not silently weaken direct injection or add a large tokenizer bundle.

### 2.6 Deterministic prompt matching

Add `user-prompt-submit.mjs --host <claude|codex>` to:

1. Parse hook JSON from stdin and extract `prompt`, `session_id`, and project directory.
2. Resolve the canonical store read-only with Git as optional enrichment. If no store exists, emit nothing and create nothing; registration, migration, and install/update are the only store-creation paths.
3. load or refresh the active index.
4. Normalize prompt and trigger phrases with Unicode NFKC, lowercase, punctuation-to-space conversion, and whitespace collapse.
5. Match complete normalized phrases on token boundaries.
6. Rank by longest normalized matched trigger, then stable record ID.
7. Skip records already applied as the same `id@version` in the session.
8. Inject the highest-ranked remaining record in full.
9. Add at most three secondary entries and at most 750 characters total, each containing ID, matched trigger, short description, and a CLI search hint.
10. Recheck the final host payload and emit it through `hookSpecificOutput.additionalContext`.
11. Emit `systemMessage` naming the primary applied record and the count of additional matches.

Secondary entries are labeled “also matching,” never “loaded” or “applied.” No-match and already-applied-only results are silent.

Store applied `id@version` values per host/session with atomic replacement. The SessionStart handler parses `session_id` from hook-event JSON on stdin using the same extraction contract as `UserPromptSubmit`. For `startup|clear|compact`, it clears that session's applied set before later prompts can rehydrate knowledge. If SessionStart omits `session_id`, it clears all applied sets for the resolved project. If `UserPromptSubmit` omits `session_id`, it disables dedupe persistence for that invocation rather than sharing state globally.

### 2.7 SessionStart and explicit search

Replace the current registry-dependent override body (`plugins/spectre/hooks/scripts/load-knowledge.mjs:114-180`) with compact, constant-size guidance:

- relevant active knowledge is applied automatically;
- `spectre knowledge search "<query>"` performs explicit lexical discovery;
- `/spectre:learn` captures durable knowledge.

Do not include registry rows or record bodies. Preserve existing bootstrap and handoff ordering in `hooks.json`, then add one independent `UserPromptSubmit` group (`plugins/spectre/hooks/hooks.json:3-21`).

Extend the npm CLI, whose grammar currently requires a `codex` target for every command (`src/main.js:109-150`):

```text
spectre knowledge search [query] [--project-dir <path>] [--json]
spectre knowledge register --record <path> [--project-dir <path>] [--json]
spectre knowledge migrate [--project-dir <path>] [--json]
```

`search` is public and returns active results ranked by exact query phrase, trigger token overlap, description token overlap, then ID. Description overlap is an initial lexical implementation choice, not a scope-level relevance contract. Empty query lists all active records grouped by category in human output and as a flat stable array in JSON. It reads no model and uses no network.

`register` and `migrate` are stable machine interfaces used by Spectre skills and installers. Internal callers force an index rebuild through `refreshKnowledgeIndex` rather than a public reindex command. Errors use nonzero exits and structured `{ ok: false, code, message, paths? }` JSON when `--json` is set.

Update `spectre-learn` to search before UPDATE/APPEND/CREATE, write to the resolved store, split supplementary detail into `references/`, and retry after registration errors until the core passes both size gates. Update `spectre-recall` to call the search CLI and read the selected canonical record rather than relying on an injected registry or native skill dispatch.

### 2.8 Conservative migration

Build migration candidates only from rows in legacy `registry.toon` files under `.claude/skills/spectre-recall/`, `.agents/skills/spectre-recall/`, and the supported historical `spectre-find` path. Never scan arbitrary native skill directories as migration candidates.

For each allowlisted ID:

- one valid eligible source: copy the full directory and resources;
- byte-identical sources: migrate once and report deduplication;
- divergent sources: migrate neither and preserve both;
- malformed or missing source: preserve and report;
- core or framed payload over budget: preserve and report;
- conflicting canonical target: preserve both sides and report;
- canonical target with identical bytes: report already migrated and re-execute source cleanup for the matching legacy directory and registry row.

Write `migration-report.json` with stable issue codes and source/destination paths. Only after the canonical record and index are committed should migration remove a successfully migrated legacy directory and registry row. Preserve unrelated rows, native skills, config, hooks, and user-authored override text.

Initial migration codes are `MIGRATED`, `DEDUPLICATED`, `DIVERGENT`, `OVERSIZED`, `MALFORMED`, `CONFLICT`, `ALREADY_MIGRATED`, and `SOURCE_MISSING`. Their meanings are add-only stable within schema version 1.

Run the same idempotent migrator from:

- SessionStart, to cover Claude plugin users without the npm installer;
- Codex project install/update;
- `/spectre:learn` before its first canonical search/write;
- explicit `spectre knowledge migrate`.

Successfully migrated learned skills disappear from Codex native skill configuration. Replace the current “register every project skill directory” behavior (`src/lib/config.js:455-491`) with filtering based on the migration report and known retired recall surfaces. Oversized or unresolved records remain where they are and are reported as migration debt.

Oversized records remaining under `.claude/skills/` are an explicitly grandfathered native-discovery exception: Claude Code can still surface them through its own skill discovery. Migration output and doctor must state that native-discovery isolation is incomplete while any grandfathered record exists.

Remove the registry body, `{{REGISTRY}}` placeholder, and model-compliance rule from `spectre-apply`. Once the prompt resolver and constant SessionStart policy own all of its remaining behavior, delete the obsolete canonical skill and let normal generation remove its Codex copy; do not leave an orphaned skill that describes the retired registry flow.

Uninstall removes managed hooks, runtime files, and generated project integration only. It never removes `~/.spectre/projects/` or unresolved legacy records.

## 3. Critical Files

1. `plugins/spectre/hooks/scripts/register_learning.mjs:29-71,96-164,194-256`, `plugins/spectre/hooks/scripts/load-knowledge.mjs:105-199`, and `plugins/spectre/hooks/hooks.json:3-21` — **Core logic and interface to modify.** Replace registry generation/description mutation, make SessionStart capability/reset/migration-only, and register `UserPromptSubmit`.
2. `plugins/spectre/skills/spectre-learn/SKILL.md:11-44`, `plugins/spectre/skills/spectre-recall/SKILL.md:12-39`, `plugins/spectre/skills/spectre-apply/SKILL.md`, and `plugins/spectre/skills/spectre-learn/references/recall-template.md` — **Interfaces to implement or retire.** Move learn/recall to the canonical store and CLI; remove the obsolete registry/application surfaces and template.
3. `src/lib/knowledge.js:94-193` and `src/lib/project.js:303-347` — **Core logic to modify.** Replace the parallel registry/override implementation with adapters to the canonical runtime and capability-only SessionStart output.
4. `src/lib/paths.js:57-82` and `src/main.js:31-42,109-150` — **Core logic and interface to modify.** Add Spectre-home/project-store paths and target-independent knowledge commands.
5. `src/lib/config.js:455-491`, `src/lib/install.js:263-302`, and `src/lib/doctor.js:78-149` — **Core integration to modify.** Filter retired native knowledge, run migration/index initialization, preserve canonical data, and report resolver/trust/debt state.
6. `scripts/translators/hooks.cjs:20-45,47-68,70-105` — **Pattern to follow / core logic to modify.** Recursively generate the canonical runtime and host-specific hook command without hand-editing the Codex mirror.
7. `plugins/spectre/hooks/scripts/test_load-knowledge.mjs`, `src/config.test.js`, `src/install.test.js`, `src/pack.test.js`, and `scripts/test_sync-codex.cjs` — **Tests to extend.** Replace registry/native-recall assertions with capability, migration, prompt-delivery, packaging, and generated-parity contracts.

## 4. External Dependencies — Verify Before Implementation

No new third-party packages.

The canonical hook runtime must execute inside a standalone Claude plugin, where root npm dependencies are not guaranteed to resolve. Use Node built-ins for parsing, hashing, filesystem coordination, Git probing, and search. The existing `@anthropic-ai/tokenizer` dependency is not a valid Codex budget counter and must not be repurposed as one.

Runtime capability baselines to reverify before implementation:

- Claude Code `2.1.215` or current installed version — verify: `claude --version`
- Codex `0.144.6` or current installed version — verify: `codex --version`
- Node.js project-supported version — verify: `node --version`
- Git, optional — verify behavior both with `git --version` present and with Git deliberately unavailable

## 5. Verification — How We Know This Works

- Readable store resolution → verifies by: non-Git, Git, linked-worktree, symlink, collision, missing-Git, and moved-path fixtures resolve to the documented store without opaque IDs.
- Canonical records → verifies by: 9,000-character boundary tests and schema fixtures for every status, malformed frontmatter, mismatched ID, resources, and direct edits.
- Atomic registration → verifies by: injected failure before rename leaves prior record/index byte-identical; concurrent writers yield one complete record and a rebuildable index.
- Payload budgeting → verifies by: accepted dense boundary fixtures remain inline in real Claude and Codex hook runs; rejected fixtures never register or emit oversized context.
- Derived index → verifies by: missing, stale, and corrupt indexes rebuild; a direct trigger/status/version edit changes the next prompt result.
- Exact matching → verifies by: case, punctuation, Unicode normalization, phrase boundaries, overlapping triggers, inactive records, deterministic ties, and stable ranking tests.
- Prompt delivery → verifies by: no-match is silent; one match injects the full primary; multiple matches stay within both caps and accurately distinguish applied from also matching.
- Session deduplication → verifies by: repeated `id@version` is skipped, version increments reapply, startup/clear/compact reset permits reapplication, and missing `session_id` disables prompt dedupe persistence without sharing global state.
- SessionStart policy → verifies by: output contains capability/search guidance but no registry row, learned record, or `{{REGISTRY}}`.
- Search CLI → verifies by: human and JSON golden tests over active records, empty query, explicit project directory, invalid store, and no-network execution.
- Migration → verifies by: both legacy roots, identical duplicates, divergence, resources, malformed inputs, oversized preservation, canonical conflicts, idempotency, and unrelated-file preservation.
- Concurrent migration → verifies by: a held store lock makes SessionStart return cleanly without partial writes while a later explicit migration completes.
- Grandfathered exception reporting → verifies by: migration output and doctor name oversized `.claude/skills` records as still active in Claude native discovery.
- Native discovery retirement → verifies by: successful migrated records and generated recall are absent from Codex skill config while unrelated project skills remain configured.
- Install/doctor/uninstall → verifies by: project/user installs preserve unrelated state; doctor reports hook/trust/index/migration debt; uninstall preserves canonical and unresolved knowledge.
- Generated artifact → verifies by: `npm run sync-codex`, sync tests, packed artifact inspection, and install from the package tarball.
- Real runtimes → verifies by: the §2.5 manual protocol is executed for the §13 scenarios and captures content visibility, notices, no fallback, repeat dedupe, reset reapplication, and no-match silence in a dated evidence artifact.

## 6. Out-of-Bounds — DO NOT Add

1. Do not add semantic search, embeddings, QMD, a local model, or LLM reranking.
2. Do not add a daemon, database, SQLite store, filesystem watcher, or background service.
3. Do not add automated contradiction analysis, pruning, lifecycle transitions, usage scoring, or overnight curation.
4. Do not add a lifecycle/status CLI or UI; direct canonical record edits remain the control surface.
5. Do not add repository graduation, commit automation, or pull-request workflows for knowledge.
6. Do not add output sharding, multi-hook payload splitting, or preview/file fallback as a delivery strategy.
7. Do not auto-merge, rewrite, split, delete, or choose between divergent/oversized legacy records.
8. Do not hand-edit generated `plugins/spectre-codex` files or introduce a second runtime implementation under `src/lib`.

## 7. Risks & Filled Assumptions

### Risks

- **Approximate Codex token limit:** a model-specific exact counter is unavailable in the standalone plugin. Mitigation: make payload feasibility Phase 1, use conservative fixtures plus real-host proof, and stop for redesign if inline delivery cannot be guaranteed.
- **Broad exact triggers:** deterministic matching can still surface irrelevant records. Mitigation: phrase-boundary matching, longest-trigger priority, concise visible notice, and direct trigger editing.
- **Shared-store races:** worktrees and parallel sessions can mutate one index. Mitigation: exclusive mutation lock, atomic rename, prompt-time read-only fallback, and concurrency tests.
- **Legacy partial migration:** divergent, malformed, or oversized records remain discoverable in their native roots. Mitigation: stable migration debt report and honest doctor output; no destructive cleanup.
- **Direct edits during prompt resolution:** a record can change between freshness check and read. Mitigation: fingerprint the bytes actually framed and retry one read when the fingerprint changes.
- **Codex trust:** valid generated hooks may still be inactive. Mitigation: doctor surfaces trust/config status and real install verification checks the resolver.
- **Readable path scan cost:** finding an existing identity requires inspecting project metadata. Mitigation: scan only `project.json` files under the shallow readable tree; no global knowledge-content scan.
- **Runtime-state accumulation:** session dedupe files can accumulate. Mitigation: overwrite each session ledger atomically; defer age-based cleanup until observed growth justifies a separate policy.

### Filled Assumptions

- `SPECTRE_HOME` is the supported override for tests and advanced local isolation; default is `~/.spectre`.
- A moved non-Git directory receives a new store; the old store is preserved for manual agent-assisted recovery.
- Git command failure, malformed Git output, or absent Git behaves exactly like a non-Git project.
- Active records alone are searchable through the initial public CLI and matchable automatically.
- The primary record is framed verbatim after validated frontmatter; Spectre does not summarize it.
- Secondary matches are metadata only, capped at 750 characters and three entries.
- Match normalization is NFKC, lowercase, punctuation-to-space, whitespace collapse, and complete phrase boundaries.
- Search ranking is deterministic lexical ranking, not the trigger matcher reused as a pseudo-semantic engine.
- Session dedupe keys are `host + session_id + knowledge-id@version`; missing session IDs disable persistence rather than sharing state globally.
- SessionStart performs idempotent migration for both hosts because Claude plugin installs have no equivalent npm install callback.
- Migration reports use stable machine codes and are replaced atomically on every run.
- Canonical knowledge and migration debt survive uninstall.

## 8. Current State

1. SessionStart runs bootstrap, handoff resume, then registry loading (`plugins/spectre/hooks/hooks.json:3-21`); no `UserPromptSubmit` resolver exists.
2. `load-knowledge.mjs` reads a project registry, substitutes it into `spectre-apply`, writes `AGENTS.override.md`, and emits a count (`plugins/spectre/hooks/scripts/load-knowledge.mjs:114-199`).
3. Learning writes into `.claude/skills`, updates `registry.toon`, regenerates recall, and injects trigger text into native skill descriptions (`plugins/spectre/skills/spectre-learn/SKILL.md:13-18,38-44`; `plugins/spectre/hooks/scripts/register_learning.mjs:223-256`).
4. Recall depends on the injected/generated registry and native `Skill(...)` dispatch (`plugins/spectre/skills/spectre-recall/SKILL.md:12-35`).
5. Codex config registers every project `.agents/skills/*/SKILL.md`, including learned records and generated recall (`src/lib/config.js:455-491`).
6. Project paths point at repository-local `.spectre`, `.agents`, and recall files; no user-level project identity exists (`src/lib/paths.js:57-82`).
7. The npm CLI has only Codex install, update, uninstall, and doctor commands (`src/main.js:31-37,109-150`).
8. Codex hooks and runtime scripts are generated from the canonical plugin (`scripts/translators/hooks.cjs:70-105`), which is the correct single-authority pattern to retain.

## 9. Implementation Phases

### Phase 1: Store, schema, locking, and payload feasibility

- Add Spectre-home and readable project-store resolution with optional Git enrichment.
- Add canonical record parsing/validation, constrained frontmatter serialization, index rebuild, source fingerprints, and atomic store locking.
- Implement dual host payload measurement and boundary fixtures.
- Run a minimal real Claude/Codex hook probe using framed fixture content.

**Succeeds when:** (a) all identity/schema/concurrency fixtures pass via `npm test`; (b) the estimator meets the §2.5 quantitative thresholds for every fixture class; (c) at least one prose-heavy and one code-heavy accepted fixture arrive inline in a real Codex run under the §2.5 protocol; and (d) the dated evidence artifact is saved. If any accepted fixture falls back, implementation stops before migration or user-data changes and appends measured values plus observed behavior to `task_context.md` for a scope-level decision.

### Phase 2: Lossless legacy migration

- Implement registry-allowlisted candidate discovery across both native roots and historical recall paths.
- Add conservative classification, staged copy, index commit, cleanup ordering, and stable migration reporting.
- Invoke migration through an explicit command without yet wiring automatic startup.

**Succeeds when:** the migration matrix passes, reruns are byte-idempotent, ambiguous inputs remain untouched, and successfully migrated resources match source bytes.

### Phase 3: Registration, search, and skill workflows

- Replace `register_learning.mjs` with the canonical registration adapter.
- Add target-independent `spectre knowledge` CLI grammar and human/JSON contracts.
- Rewrite `spectre-learn` and `spectre-recall` around canonical search/register paths and resource splitting.
- Delete `plugins/spectre/skills/spectre-learn/references/recall-template.md` after recall generation is removed, drop its references from `spectre-learn`, and retire registry description mutation.

**Succeeds when:** `/spectre:learn` can create/update a non-Git record outside the repository, rejects both size-limit failures until repaired, and recall finds it through the lexical CLI.

### Phase 4: Prompt-time resolver and SessionStart reset

- Add exact trigger matching, ranking, primary framing, secondary metadata, session dedupe, and fail-open output.
- Register one `UserPromptSubmit` adapter.
- Make SessionStart capability-only, reset dedupe at lifecycle boundaries, and run migration idempotently.
- Delete `spectre-apply` after removing all registry/application callers and update generated manifests/tests through normal Codex sync.

**Succeeds when:** golden hook tests prove no-match, single-match, multiple-match, repeat, missing-session, startup/clear/compact reset, malformed-input, lock-timeout, and fail-open behavior, and the §2.5 real-host protocol records equivalent inline behavior within host limits.

### Phase 5: Codex install/config/doctor integration

- Route npm-side knowledge functions to the canonical runtime.
- Run migration/index initialization from project install/update.
- Remove successfully migrated learnings and retired recall files from native Codex configuration without touching unrelated entries.
- Extend doctor with resolver, trust, store/index, and migration-debt diagnostics.
- Preserve user-level knowledge on uninstall.

**Succeeds when:** fresh install, upgrade, doctor, reinstall, and uninstall integration tests pass for user/project scopes and leave all user-owned knowledge intact.

### Phase 6: Generation, package, and release verification

- Recursively sync the canonical runtime and host-specific adapter command into the Codex mirror.
- Update sync, pack, hook, installer, and verifier gates.
- Run the full automated suite, packed-artifact install, and representative Claude/Codex end-to-end scenarios.

**Succeeds when:** generated files are clean after `npm run sync-codex`, the packed artifact contains every runtime file, all gates pass, both hosts apply the same record with equivalent visible notices, and the dated §2.5 evidence artifact covers every §13 end-to-end scenario.

## 10. Component/Data Architecture

### Components

Runtime logic lives in cohesive modules under `plugins/spectre/hooks/scripts/knowledge/`. File boundaries follow natural cohesion: store plus identity and locking; record parsing plus validation and index refresh; matching plus ranking and payload framing; migration; and search. Avoid single-function modules. Claude/Codex adapters translate host input/output only; shared modules own all decisions.

### Data ownership

- `SKILL.md` and `references/` are canonical user data.
- `project.json` is canonical identity metadata.
- `index.json` and session ledgers are derived and rebuildable.
- `migration-report.json` is durable operational metadata but never an authority for record content.
- Legacy skills remain canonical only while unresolved; successful migration transfers authority to the user-level record.

### Schema evolution

Every JSON file contains `schemaVersion: 1` as a passive fixed-shape marker. Version negotiation and upgrade/downgrade semantics are deferred until a future schema change requires them.

## 11. API Design

### Shared module contracts

```js
resolveProjectIdentity(projectDir, { spectreHome, gitRunner })
  -> { canonicalProjectRoot, gitRepositoryRoot?, gitCommonDir? }

resolveProjectStore(projectDir, { spectreHome, gitRunner, readOnly = false })
  -> { storePath, metadata, created }

parseKnowledgeRecord(skillPath)
  -> { record, content, fingerprint }

validateKnowledgeRecord(record, content, { hosts })
  -> { ok, errors, measurements }

refreshKnowledgeIndex(storePath, { persist, lockMode })
  -> { index, rebuilt }

matchKnowledge(prompt, index)
  -> [{ id, matchedTrigger, triggerLength, description, version, recordPath }]

buildPromptContext({ host, primary, secondaryMatches })
  -> { ok, additionalContext, measurements, omittedCount }

registerKnowledge({ projectDir, recordPath })
  -> { action, record, storePath, measurements }

migrateLegacyKnowledge({ projectDir })
  -> { migrated, deduplicated, unresolved, reportPath }

searchKnowledge({ projectDir, query })
  -> { results }
```

Internal functions throw descriptive errors. Hook adapters catch every error and fail open. CLI commands using `--json` translate failures to stable `{ ok: false, code, message, paths? }` responses. Mutating commands return nonzero for validation, lock timeout, or unresolved target collision. Search returns success with an empty result set when the store exists but no active records match.

### Hook output

Match:

```json
{
  "systemMessage": "spectre: applied feature-auth-flows; 2 also matching",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "<validated primary frame and bounded secondary metadata>"
  }
}
```

No match, duplicate-only match, missing store, or internal failure: emit no context; internal diagnostics go to stderr only.

## 12. Migration Plan

### Up

1. Resolve/create the user-level store without changing legacy files.
2. Discover candidates only through legacy registry rows.
3. Classify every candidate and write a complete prospective report.
4. Stage eligible record directories in the destination.
5. Validate record schema, 9,000-character ceiling, host payloads, and rebuilt index.
6. Commit canonical records and index atomically.
7. Remove only successfully migrated source directories and their exact registry rows.
8. Remove generated recall only when no unresolved registry rows remain.
9. Refresh Codex native skill configuration to exclude only retired managed paths.
10. Commit the final migration report.

### Rollback

Before source cleanup, rollback deletes only staging files. After canonical commit but before cleanup, rerun treats identical canonical targets as migrated and finishes source cleanup safely. Once successful source cleanup occurs, canonical data is authoritative and there is no shipped production downgrade helper. Tests for post-cleanup recovery use isolated fixture directories and never delete user-level data.

There is no automatic production downgrade because a prior Spectre version would reintroduce native registry behavior. Doctor must report canonical knowledge plus missing resolver when an old runtime is installed.

### Backfill and repeated runs

SessionStart, install/update, `/learn`, and explicit migration all call the same idempotent engine. Repeated runs produce identical canonical bytes and stable issue codes. Oversized, malformed, divergent, or conflicting candidates remain untouched until a future curation scope or a user edit resolves them.

## 13. Testing Strategy

### Unit

- `plugins/spectre/hooks/scripts/test_knowledge-store.mjs`: identity, collisions, non-Git behavior, worktrees, immediate/acquire-within-wait/timeout/stale lock cases, and atomic writes.
- `plugins/spectre/hooks/scripts/test_knowledge-record.mjs`: schema, frontmatter, lifecycle, fingerprints, record mutation between index/read attempts, resources, size, and payload boundaries.
- `plugins/spectre/hooks/scripts/test_knowledge-match.mjs`: normalization, phrase boundaries, ranking, secondary cap, inactive records, missing-session behavior, and dedupe.
- `plugins/spectre/hooks/scripts/test_knowledge-migration.mjs`: full lossless migration matrix, exact issue codes, crash-resume cleanup, lock contention, and reports.
- `plugins/spectre/hooks/scripts/test_knowledge-search.mjs`: lexical ranking, active filtering, human/JSON data.

### Integration

- Extend SessionStart hook tests to assert capability-only context, stdin `session_id` parsing, startup/clear/compact reset, missing-session reset-all, lock-timeout migration behavior, migration invocation, and user override preservation.
- Add `UserPromptSubmit` process tests with real stdin/stdout JSON and per-host golden fixtures.
- Create `src/main.test.js` for knowledge CLI grammar; extend `src/config.test.js`, `src/install.test.js`, and the existing doctor assertions in `src/install.test.js` for config filtering, upgrade, diagnostics, and uninstall preservation.
- Extend `scripts/test_sync-codex.cjs` for recursive runtime copying, nested test-file exclusion, host argument rewriting, nested stale-file removal, and generated parity.
- Extend pack tests to install the tarball into isolated `HOME`, `CODEX_HOME`, and `SPECTRE_HOME` directories.

### End to end

- Claude, Git project: migrate an eligible record, submit a matching prompt, confirm inline content and notice, repeat and reset.
- Codex, linked worktree: resolve the main-worktree store, apply the same record, and confirm equivalent notice.
- Non-Git directory: learn, register, search, match, restart, and uninstall without creating repository knowledge files.
- Multiple matches: confirm one full primary, bounded also-matching metadata, stable ranking, and no fallback file.
- Migration debt: preserve divergent and oversized sources, surface doctor diagnostics, and keep unrelated native skills active.
- Adapter parity: run the same store and prompt through both host adapters and assert equivalent `additionalContext` content and `systemMessage` structure apart from host event framing.

Execute every scenario through the §2.5 real-host protocol and record checkable observations in the dated verification artifact.

### Deferred

No semantic relevance evaluation, contradiction quality evaluation, pruning effectiveness, repo-graduation flow, or automated lifecycle transition testing belongs to this scope.
