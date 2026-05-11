---
name: spectre-test
description: 👻 | Risk-aware test coverage & commit - primary agent
user-invocable: true
---

# spectre-test

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# test: test coverage with risk-aware focus

## Description

- **What** — Triage changes into risk tiers, dispatch @spectre:tester subagents to fix lint and write **risk-appropriate tests** (not brute-force 100% line coverage), and commit after each passing batch.
- **Outcome** — All lint issues fixed, surgical test coverage that maximizes confidence while minimizing token cost, incremental commits per batch, artifacts recorded in OUT_DIR.
- **Philosophy** — Test behaviors at boundaries, not implementation details. Prioritize code that can hurt users when it breaks. Skip tests that only measure "was this line executed?" without verifying correctness.

## ARGUMENTS Input

Optional scope hint or specific files to focus on.

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## Instructions

- Primary agent plans and verifies; @tester subagents write test code
- Maximize parallelism: dispatch multiple @tester agents simultaneously, not sequentially
- Primary agent coordinates; subagents execute test writing in parallel batches
- No OUT_DIR artifacts — this is a lightweight flow
- Risk assessment is inline reasoning, not a classification phase
- Test behaviors at boundaries, not implementation details
- Skip tests for P3 files (types, configs, simple wrappers)
- when committing, —no-verify and eslint-disable, or committing code with eslint-disable, is expressly forbidden without the user’s explicit permission. 

### Why Risk-Weighted &gt; 100% Line Coverage

**100% line coverage is a vanity metric that:**

- Treats all code equally (a payment handler vs a string formatter)
- Tests implementation details (brittle, breaks on refactor)
- Creates maintenance burden (tests that slow you down)
- Gives false confidence (100% coverage ≠ 100% correctness)
- Burns tokens on code that can't break in production

**Risk-weighted coverage instead:**

- Focuses testing effort where bugs cause user pain
- Tests behaviors and contracts, not internal wiring
- Creates tests that survive refactoring
- Catches actual bugs via mutation-resistant assertions
- Dramatically reduces token cost while increasing safety

### Risk Tier Definitions

#### P0 — Critical (Must Test Thoroughly)

**Identification patterns:**

- Path contains: `auth`, `payment`, `security`, `crypto`, `session`, `token`
- File has `@critical` JSDoc/comment annotation
- Handles: user data mutations, financial transactions, PII, permissions
- API handlers for external consumers
- Database migration files

**Coverage requirements:**

- 100% **behavioral** coverage (every user-facing outcome has a test)
- All error paths tested with specific error assertions
- Edge cases for security-sensitive inputs (null, empty, malformed, overflow)
- Contract tests for all public APIs (schema validation)
- Mutation-resistant assertions (would a bug actually fail this test?)

**Test quality bar:**

```typescript
// ✅ GOOD P0 test - tests behavior and catches real bugs
it('rejects payment when card is expired', async () => {
  const result = await processPayment({ card: expiredCard, amount: 100 });
  expect(result.status).toBe('DECLINED');
  expect(result.reason).toBe('CARD_EXPIRED');
  expect(chargeService.charge).not.toHaveBeenCalled(); // Side effect prevented
});

// ❌ BAD test - tests implementation, not behavior
it('calls validateCard', async () => {
  await processPayment({ card, amount: 100 });
  expect(validateCard).toHaveBeenCalledWith(card);
});
```

#### P1 — Core (Test Key Behaviors)

**Identification patterns:**

- Main feature components (not utility wrappers)
- API route handlers (internal)
- State management (stores, reducers, contexts)
- Core business logic
- Data fetching/caching layers

**Coverage requirements:**

- Happy path coverage for all public functions
- Critical error paths (ones users would see)
- Contract tests at team boundaries (exported APIs other modules consume)
- No need to test internal helper functions
- No need to test every code branch, just primary behaviors

**Test quality bar:**

```typescript
// ✅ GOOD P1 test - covers the behavior users care about
it('fetches and caches user profile', async () => {
  const profile = await getUserProfile(userId);
  expect(profile.name).toBe('Joe');

  // Second call uses cache
  await getUserProfile(userId);
  expect(api.get).toHaveBeenCalledTimes(1);
});

// ❌ SKIP - internal implementation detail
it('calls normalizeUserData internally', () => { ... });
```

#### P2 — Supporting (Test Public Surface Only)

**Identification patterns:**

- Utility functions and helpers
- Internal services not exposed to other teams
- Formatters, validators, transformers
- Hooks that compose other hooks
- Adapters and wrappers

**Coverage requirements:**

- Public exported functions: happy path only
- Skip internal/private functions entirely
- Skip trivial functions (single-line returns, simple compositions)
- Only test if the function has logic worth verifying

**Test quality bar:**

```typescript
// ✅ GOOD P2 test - public util with actual logic
it('formats currency correctly', () => {
  expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50');
});

// ❌ SKIP - trivial wrapper with no logic
// export const getFullName = (u) => `${u.first} ${u.last}`;
```

#### P3 — Low Risk (Skip Testing)

**Identification patterns:**

- TypeScript type definitions (`.d.ts`)
- JSON/YAML configuration files
- CSS/SCSS/Tailwind styles
- Markdown documentation
- Constants and enums (no logic)
- Re-export barrels (`index.ts` that just re-exports)
- Simple component wrappers (just pass props through)
- Build scripts and tooling config

**Coverage requirements:**

- **NO TESTS REQUIRED** — Types are the test
- Type checking + linting is sufficient
- These files cannot break at runtime in ways tests would catch

### Test Quality Requirements (All Tiers)

#### Each test MUST:

- **Test ONE behavior** — Single assertion focus, clear failure message
- **Use descriptive names** — `when_[condition]_then_[outcome]` or `[action]_should_[result]`
- **Assert outcomes, not calls** — Verify what happened, not what was invoked
- **Be refactor-resilient** — Test should pass if behavior unchanged, even if internals change
- **Catch real bugs** — Ask: "If I introduced a bug, would this test fail?"

#### Each test MUST NOT:

- **Mock implementation details** — Don't mock internal functions
- **Assert on call counts** — Unless testing side-effect prevention
- **Duplicate type coverage** — Don't test that TS types are correct
- **Test framework behavior** — Don't test that React renders or Express routes

#### Mutation Testing Mindset

For every test, ask: "If I changed the implementation to return a wrong value, would this test catch it?"

```typescript
// ✅ Mutation-resistant — changing the discount calculation would fail this
it('applies 20% discount for premium users', () => {
  expect(calculateTotal({ items: [100], userTier: 'premium' })).toBe(80);
});

// ❌ NOT mutation-resistant — always passes regardless of implementation
it('calls calculateDiscount', () => {
  calculateTotal({ items: [100], userTier: 'premium' });
  expect(calculateDiscount).toHaveBeenCalled();
});
```

### Contract Tests at Team Boundaries

When your code is consumed by other teams/modules, add contract tests:

```typescript
// API Contract Test
describe('UserAPI contract', () => {
  it('GET /users/:id returns UserResponse schema', async () => {
    const response = await request(app).get('/users/123');
    expect(response.body).toMatchSchema(UserResponseSchema);
  });

  it('returns standard APIError shape on 404', async () => {
    const response = await request(app).get('/users/nonexistent');
    expect(response.status).toBe(404);
    expect(response.body).toMatchSchema(APIErrorSchema);
  });
});

// Event Contract Test
describe('UserCreated event contract', () => {
  it('emits event matching UserCreatedEvent schema', async () => {
    await createUser({ name: 'Test' });
    expect(eventBus.lastEvent).toMatchSchema(UserCreatedEventSchema);
  });
});
```

## Steps

### Step 1/4 — Discover Full Working Set and Plan

- **Action** — DiscoverFullWorkingSet:
  - Validate commit_id if provided
  - Gather: committed changes + staged + unstaged + untracked
  - **Full Working Set** = UNION of all sources
- **Action** — RecordWorkingSet: Write `OUT_DIR/working_set.json`
- **Action** — BaselineLintFull: Run lint on ALL files in Full Working Set
- **Action** — MapDependencies: Build import/dep snapshot

### Step (2/4) - Risk Assessment & Test Plan

- **Action** — InlineRiskCheck: Quick mental triage of changed files

  **P0 Critical** (thorough coverage required):

  - Paths containing: `auth`, `payment`, `security`, `crypto`, `session`, `token`
  - Handles: user data mutations, financial transactions, PII, permissions
  - Has `@critical` annotation

  **P1 Core** (key behaviors):

  - API handlers, feature components, state management, services

  **P2 Supporting** (public surface only):

  - Utils, helpers, hooks, formatters

  **P3 Skip** (no tests):

  - Type definitions (`.d.ts`), configs, styles, index barrels, simple wrappers

- **Action** — CreateTestPlan: Write 3-7 bullet test plan

  - Format: `- [P{tier}] {file}: {behavior to test}`
  - P0 files get multiple bullets (all behaviors + error paths)
  - P1 files get 1-2 bullets (happy path + critical errors)
  - P2 files get 1 bullet (public function smoke test)
  - P3 files listed as "SKIP — {reason}"

- **Action** - Update`OUT_DIR/working_set.json` with risk tier categorization.

### Step (3/4) - Write Tests & Verify

- **Action** — DispatchTestWriter: Spawn MULTIPLE @spectre:tester subagents IN PARALLEL

  - **Parallelization Strategy**:
    - Partition test plan items into independent batches (by file or logical grouping)
    - Dispatch one @spectre:tester per batch — aim for 3-5 parallel agents for medium scope, up to 8 for large scope
    - Each agent receives: its batch of test plan items, file paths, risk tier context
    - **Critical**: Use a single message with multiple Task tool calls to launch all agents simultaneously
  - **Batching Heuristics**:
    - P0 files: 1 agent per file (thorough coverage requires focus)
    - P1 files: Group 2-3 related files per agent
    - P2 files: Group 3-5 files per agent (lighter coverage)
  - Instruct each: "Write behavioral tests, assert outcomes not calls, mutation-resistant"
  - Wait for all agents to complete before proceeding to lint/test verification

- **Action** — RunLint: Execute linter; fix violations

  - **If** lint fails → autofix first, then manual fix
  - **Else** → continue

- **Action** — RunTests: Execute full test suite

  - **If** tests fail → analyze failure, fix via @spectre:tester or direct edit
  - **Else** → continue

- **Action** — VerifyQuality: Spot-check 1-2 tests

  - Confirm: tests assert behaviors, would catch real bugs, survive refactoring
  - **If** test quality poor → rework via @@spectre:tester
  - **Else** → continue

### Step (4/4) - Commit

- **Action** — CommitPlanningArtifacts: Gather and commit planning/working docs FIRST
  - Check for uncommitted files in `OUT_DIR/`:
    - `working_set.json` (scope and risk tier categorization)
    - Any other `.md` or `.json` artifacts created during this flow
  - Check for uncommitted docs in `docs/tasks/{branch_name}/` or related planning directories
  - **If** uncommitted planning artifacts exist:
    - Stage all: `git add docs/tasks/{branch_name}/ OUT_DIR/`
    - Commit: `docs(test): add test planning artifacts for {branch_name}`

- **Action** — GroupChanges: Organize code changes into logical commits

  - Group by: feat/fix/refactor/test/chore
  - Tests can be bundled with their feature or separate (your judgment)

- **Action** — CommitAll: Create conventional commits for code changes

  - Format: `type(scope): description`
  - Each commit answers: What changed and why?

- **Action** — RenderFooter: Render Next Steps footer using `@skill-spectre:spectre-guide` skill (contains format template and spectre command options)

## Next Steps

See `@skill-spectre:spectre-guide` skill for footer format and command options.

## Success Criteria

**Step 1 - Analyze Diff**:

- [ ] Scope identified (files changed) and documented

- [ ] Behaviors changed listed (not just file names)

**Step 2 - Risk Assessment & Test Plan**:

- [ ] Each changed file assigned P0-P3 tier

- [ ] Test plan created with 3-7 bullets

- [ ] P3 files explicitly marked SKIP

**Step 3 - Write Tests & Verify**:

- [ ] Multiple @spectre:tester agents dispatched in parallel (not sequential)

- [ ] Test plan partitioned into independent batches

- [ ] All agents launched in single message (parallel tool calls)

- [ ] P0 files have thorough behavioral coverage

- [ ] P1 files have key path coverage

- [ ] P2 files have public surface coverage

- [ ] P3 files have NO tests (confirmed skipped)

- [ ] Lint passes

- [ ] All tests pass

- [ ] Test quality spot-checked

**Step 4 - Commit**:

- [ ] Changes grouped logically

- [ ] Conventional commit format used

- [ ] Single Next Steps footer rendered

- [ ] Next steps guide read and options sourced