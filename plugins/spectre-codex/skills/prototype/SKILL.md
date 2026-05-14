---
name: "prototype"
description: "👻 | Generate a self-contained HTML prototype to validate a feature visually before planning - primary agent"
user-invocable: true
---

# prototype

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# prototype: Make the Feature Visible Before You Plan It

Produce a self-contained, clickable HTML artifact that makes a feature visible — resolving ambiguity before scope, validating flows before plan, or anchoring stakeholder review. Output: single portable HTML file the user can open locally or host anywhere, saved to `{OUT_DIR}/prototypes/{name}_{MMDDYY}.html`.

## ARGUMENTS

<ARGUMENTS> $ARGUMENTS </ARGUMENTS>

## Invocation Modes

Detect mode from environment markers, ARGUMENTS, and existing docs. **Order matters** — check from most context to least:

- **Complete ux.md exists** (post-ux) — full Stage 2 spec is on disk. The prototype's job is to **render the spec**, not synthesize it. Default fidelity: **high-fi**. Skip all intake except visual anchor. Treat ux.md as authoritative — don't invent screens, don't contradict documented states or copy. On completion, recommend `plan` or `create_tasks`.
- **`FROM_UX=true`** — invoked mid-flow from `ux` Stage 1 → Stage 2 gate. Only approved flows exist (no detailed spec yet). Skip flow-discovery intake. Default fidelity: **mid-fi**. On completion, point user back to `ux` Stage 2.
- **`--explore` flag in ARGUMENTS** — pre-scope discovery. Concept is unvalidated. Default fidelity: **low-fi**. On completion, recommend `scope` as next step.
- **scope.md exists for this branch** (no ux.md) — post-scope validation. Default fidelity: **mid-fi**. On completion, recommend `ux` or `plan` based on feature complexity.
- **Standalone, no context** — ask the user what they're prototyping. Default fidelity: **mid-fi**.

---

# STAGE 1: Intake & Fidelity Alignment

**Goal**: Confirm what we're prototyping, at what fidelity, and what visual anchor to use. Keep this tight — 2 to 4 questions, never a form.

## Step 1 — Immediate Reply & Detect Context

- **Action** — ImmediateReply: Respond before any tools.
  - **If** `FROM_UX=true` → acknowledge ux context, read approved flows from `{OUT_DIR}/ux.md`, **SKIP to Step 3**
  - **Else If** ARGUMENTS empty → probe: "What are we prototyping? A quick description is enough — I'll figure out the fidelity from context."
  - **Else** → proceed to Step 2
  - **CRITICAL**: No tool calls in this step except reading ux output when `FROM_UX=true`.

## Step 2 — Read Available Context & Classify ux.md

- **Action** — DetectExistingDocs: Check for relevant inputs before asking the user anything.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - Look for: `docs/tasks/{branch_name}/concepts/scope.md`, `docs/tasks/{branch_name}/specs/prd.md`, `docs/tasks/{branch_name}/ux.md`
  - Read whichever exist FULLY (no offset/limit)

- **Action** — ClassifyUxDoc: If `ux.md` exists, classify its completeness — this drives fidelity AND how much intake to skip.
  - **Complete** — contains all of: Screens, Layouts, Components, Interactions, States, Content sections (the Stage 2 deliverables from `ux`). Treat as authoritative. Skip flow-discovery questions. Set mode = **post-ux**.
  - **Flows-only** — contains user flows / journeys but missing Stage 2 sections. Treat flows as approved input but expect to make UI decisions. Set mode = **flows-only ux**.
  - **Absent** — fall back to scope.md / prd.md / standalone modes.

## Step 3 — Recommend Fidelity, Confirm Anchor

Pick fidelity from signals available:

| Signal present | Recommends |
|---|---|
| `--explore` flag, or no scope/prd | **Low-fi** — grayscale, layout-only, no typography polish |
| scope.md exists, no design system anchor | **Mid-fi** — real colors, basic type, simplified components (default) |
| scope.md + flows-only ux.md, or brand/design system anchor | **Mid-fi to High-fi** — depends on anchor strength |
| **Complete ux.md** (post-ux) | **High-fi** — full design tokens, realistic data, micro-interactions; render the spec faithfully |

### Intake by mode

**Post-ux mode** (complete ux.md) — present a tight confirmation, ask one question:

> **Prototype plan** — rendering complete UX spec
>
> Source: `{path to ux.md}` ({N} screens, {M} components, {K} states specified)
> Fidelity: **high-fi** (default — full spec is on disk; I'll render it faithfully, not invent)
>
> One thing I need: **visual anchor** — brand colors, font stack, an existing app/URL to match, or a named aesthetic (e.g. "Linear-style", "Notion-quiet", "Stripe-clean"). If the spec already specifies design tokens, reply "use the spec." If you skip this, I'll commit to a deliberate named aesthetic and call it out at the top of the file.

**All other modes** — present recommendation + request anchor + confirm framing:

> **Prototype plan**
>
> I'm reading this as: **{inferred feature/flow}**
> Recommended fidelity: **{low-fi | mid-fi | high-fi}** — {one-line reason}
> Primary flow: **{name}** (from {scope.md | ux.md flows | your description})
>
> Two things I need from you:
> 1. **Override fidelity?** Or "looks good."
> 2. **Visual anchor** — brand colors, font stack, an existing app/URL to match, or a named aesthetic (e.g. "Linear-style", "Notion-quiet", "Stripe-clean"). If you skip this, I'll commit to a deliberate named aesthetic and call it out at the top of the file so you can redirect.

**Wait for response.** If user pushes back on fidelity or feature framing, adjust and re-confirm.

---

# STAGE 2: Parallel Research & Generation

**Gate**: Only proceed after Stage 1 confirmation (or `FROM_UX=true`).

## Step 4 — Dispatch Parallel Subagents

Spawn three subagents in parallel. Each has a focused job.

### `@web-research` — Visual Reference Discovery

Prompt template:

> Research visual design patterns and UI conventions for **{feature type}**. Specifically:
>
> 1. Find 2–3 living examples or screenshots of similar UI patterns in well-regarded products. Return URLs and visual descriptions.
> 2. Identify the established UX convention for this interaction type (wizard, dashboard, list+detail, modal flow, etc.) and any recent (2025–2026) refinements.
> 3. If the user specified an aesthetic anchor ({anchor_text}), find representative color palettes (hex), typography choices (font families with fallbacks), and one or two distinctive design moves that define the aesthetic.
> 4. Return concrete decisions — colors, fonts, layout patterns — not general advice.
>
> Length: under 400 words. Cite sources.

**Why**: Grounds generation in specific references. Without this step the model defaults to its own distribution (Inter + purple gradients). This is the anti-slop forcing function.

### `@analyst` — Flow & Content Extraction

Use one of two prompt templates based on mode detected in Step 2.

**Extraction mode** — post-ux (complete ux.md present):

> Read **{path to ux.md}** fully. The Stage 2 spec is authoritative — your job is to **extract** structured data for HTML rendering, NOT to synthesize new screens, states, or content.
>
> Return a render brief organized by ux.md section:
>
> 1. **Screens** — verbatim from the Screens section: name, purpose, navigation relationships
> 2. **Layouts** — verbatim from Layouts: per-screen header/main/footer + responsive breakpoints
> 3. **Components** — verbatim from Components: each element's purpose, location, all documented states (default, hover, active, disabled, loading, error)
> 4. **Interactions** — verbatim from the Interactions table: Element | Action | Result
> 5. **States** — verbatim from the States table: State | Trigger | Appearance | Available Actions
> 6. **Content** — verbatim copy from the Content section: page titles, button labels, empty-state messages, error messages, confirmation dialogs. Use this copy EXACTLY in the prototype — do not paraphrase.
> 7. **Edge cases & a11y** — note any documented constraints (limits, null/long data, keyboard actions, focus management) the prototype should reflect
>
> If the spec specifies a state or content value, the prototype must match it. If the spec is silent on a detail, flag it as a "filled assumption" so it appears in the prototype's metadata header. Never invent screens that aren't in the spec.

**Synthesis mode** — flows-only ux, scope-only, or standalone:

> Read these documents fully: **{list of paths — scope.md, prd.md, ux.md flows section if present}**. Extract a content skeleton for an HTML prototype:
>
> 1. **Primary flow** — entry → action → outcome, with decision points
> 2. **Required UI states per screen** — every screen needs at minimum: happy path, empty state, error or edge state. Some screens also need: loading, success
> 3. **Stated constraints** — any layout, behavior, or content constraints from the docs
> 4. **Realistic content** — actual product names, plausible numbers, real-looking copy. NO Lorem ipsum. NO "Card Title." If domain-specific data is unclear, invent plausible values that match the feature's domain.
> 5. **Component inventory** — every recurring UI element that will need a named CSS class (button, card, input, badge, etc.)
>
> Return a structured flow brief: screen list, per-screen state list, realistic content for each, component inventory.

**Why**: This is the content skeleton. In post-ux mode, the spec already did this work — re-synthesizing risks contradicting documented decisions. In all other modes, skipping synthesis produces prototypes with Lorem ipsum and inconsistent component styling.

### `@patterns` — Existing Codebase Anchor (only if applicable)

Skip this agent if there is no existing app to anchor to. Otherwise:

> Find existing UI patterns in this codebase that the prototype should match or extend: design tokens (colors, spacing, type), component conventions (button styles, card layouts), and any established interaction patterns. Return file references with the actual values (hex codes, class names, etc.) — not just paths.

**Why**: When prototyping inside an existing app, the prototype should look like a plausible new screen of that app, not a designer's blank canvas.

## Step 5 — Generate the HTML Artifact

Wait for ALL subagents to complete. Synthesize their outputs, then generate a single self-contained HTML file. Use `@dev` to produce the file (or inline if the synthesis is straightforward).

### Hard constraints on the generated HTML

**File structure** (every prototype includes these in order):

1. **`<!DOCTYPE html>` + minimal `<head>`** with `<meta viewport>` and an inline `<style>` block
2. **Metadata comment block** at the very top of `<head>`:
   ```html
   <!--
     SPECTRE PROTOTYPE
     Feature: {feature name}
     Fidelity: {low-fi | mid-fi | high-fi}
     Generated: {YYYY-MM-DD}
     Branch: {branch_name}
     Flow covered: {primary flow}
     Screens/states: {comma-separated list}
     Visual anchor: {named aesthetic or reference URL}
     Source spec: {path to ux.md if post-ux mode, else "none — synthesized from {scope.md | description}"}
     Key assumptions: {bullet list of design decisions and content assumptions}
     Filled assumptions: {only in post-ux mode — items the spec was silent on that the prototype filled in; review these against the spec}
     NOT included: {explicit list of what was deliberately left out}
     Next step: plan  OR  resume ux Stage 2
   -->
   ```
3. **Design tokens comment block** in `<head>`:
   ```html
   <!-- DESIGN TOKENS
     Primary: #{hex}
     Accent: #{hex}
     Surface: #{hex}
     Text: #{hex}
     Font: {family}, served from {CDN or system}
     Border-radius: {value}
     Spacing unit: {value}
   -->
   ```
   Also encode these as CSS custom properties on `:root` so they're reusable in the stylesheet.
4. **Navigation bar** (only if multi-screen) — vanilla JS section toggling via `display:block/none`. No routing, no framework.
5. **One `<section>` per screen.** Every screen must include the happy path AND at least one of: empty state, error state, loading state. Skipping these is the most common prototype failure mode.
6. **Inline `<script>`** at end of body for interactions (tab switching, form submit interception, modal toggle, accordion). Vanilla JS only.

**Size budget**: under 300KB. No base64 photos. No Chart.js or other large libraries. Use inline SVG and CSS-drawn shapes for any illustrations. Tailwind via CDN is acceptable for mid/high-fi; skip for low-fi.

**Asset rules** (keep the file portable so users can open locally, email it, host on a gist, or push to any static host):
- No `<img src="https://...">` that can 404 — use inline SVG, data URIs, or CSS shapes
- No local relative paths (`./image.png`, `../style.css`) — they break the moment the file moves
- Fonts: Google Fonts CDN (single family, two weights max) or system fonts. No custom WOFF files.

### Negative constraints (embed these explicitly in the @dev prompt)

When delegating to `@dev`, the prompt MUST include these as forbidden patterns:

- **No generic AI aesthetic.** Do not use Inter or Roboto by default. Do not use purple gradients on white. Commit to a named, deliberate aesthetic and call it out in the metadata.
- **No Lorem ipsum or placeholder filler.** All text must be realistic for the domain. "Card Title", "User Name", "Description goes here" are forbidden.
- **No happy-path-only screens.** Every screen must show at least one non-happy state (empty, error, or edge).
- **No broken interactivity.** Every `onclick`, `<form>`, or interactive element must respond visually. No `href="#"` that causes page jumps. No event handlers that throw console errors.
- **No external image dependencies that can break.** Inline SVG only.
- **No inconsistent component instances.** Define every recurring component as a named CSS class ONCE and reuse it. Do not re-style inline. If a card appears five times, it uses the same class five times.
- **No page-thinking when flow-thinking is required.** Screens appear in the order a user encounters them, not in the order they're easy to build.
- **No file-size bloat.** No base64 photos. No Chart.js, D3, or other heavyweight libraries. SVG and CSS only.

### Output location

- **Action** — DetermineOutputDir:
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** `FROM_UX=true` or `FROM_KICKOFF=true` → use the existing task directory
  - **Else If** user specifies path → use that
  - **Else** → `OUT_DIR=docs/tasks/{branch_name}`
  - `mkdir -p "$OUT_DIR/prototypes"`

- **Action** — SaveArtifact: Write file to `{OUT_DIR}/prototypes/{feature_slug}_{MMDDYY}.html`

## Step 6 — Self-Check Portability

Before reporting completion, sanity-check the artifact against the portability rules:

- File size under 300KB
- No `<img src="http...">` external images
- No local relative paths (`./`, `../`, `/local/`)
- All recurring components share a named CSS class (no inline-styled duplicates)
- Every screen includes at least one non-happy state

Surface any violations as caveats in the handoff. Don't silently ship a broken portable file.

## Step 7 — Present & Handoff

- **Action** — PresentForReview:

  > **Prototype complete**: `{path}` ({size} KB, {N} screens, {fidelity})
  >
  > **Visual anchor**: {named aesthetic}
  > **Key assumptions made** (also embedded in file header):
  > - {bullet 1}
  > - {bullet 2}
  > - {bullet 3}
  > **NOT included**: {explicit list}
  >
  > Open the file in a browser to review (`open {path}` on macOS, or drag into any browser tab). The file is fully self-contained — share it however you like (email, gist, static host, etc.). Reply with feedback to iterate, or pick a next step below.

- **Action** — SurfaceFilledAssumptions (post-ux mode only): If `mode = post-ux` AND any filled assumptions exist (items the spec was silent on that the prototype filled in), append a closing-the-loop block:

  > **Filled assumptions** — ux.md was silent on these; I made calls to render the spec. Review and tell me which to promote into the spec:
  >
  > 1. {assumption} → I chose **{decision}** ({why, one line})
  > 2. {assumption} → I chose **{decision}** ({why, one line})
  > 3. {assumption} → I chose **{decision}** ({why, one line})
  >
  > Reply with numbers to update ux.md (e.g. `1, 3`), `all` to add all, or `skip` to leave the spec as-is.

  If user picks updates:
  - Edit `ux.md` directly: place each chosen item in the appropriate section (Components / States / Content / Edge Cases / Interactions).
  - Re-run the Step 6 portability check (no regen needed unless user also requested HTML changes).
  - Re-present with a one-line diff per added item: `ux.md ← added: {item} (in {section})`.

- **Action** — RenderFooter: Render Next Steps using `Skill(spectre-guide)` skill, with mode-specific recommendation:
  - **If `FROM_UX=true`** → recommend: "Resume `ux` Stage 2 with this prototype as input"
  - **If `--explore`** → recommend: `scope` with the prototype as anchor
  - **If post-scope** → recommend: `ux` (if flows still need detail) or `plan` (if ready to build)
  - **Else** → standard Next Steps options

---

## Iteration Loop

If the user replies with feedback after Step 7:
- Small visual tweaks (color, copy, layout) → edit the HTML directly
- Structural changes (add screen, change flow) → re-run Step 4 subagents with the deltas and regenerate
- **Spec contradicts prototype** (post-ux mode) → ask which is authoritative for each contradiction, then update ux.md AND the HTML together so they stay paired; re-run Step 6 portability check
- After any edit, re-run the Step 6 self-check before re-presenting

---

## Success Criteria

- [ ] Immediate reply sent; mode detected (FROM_UX, --explore, post-scope, or standalone)
- [ ] Existing context docs (scope.md, prd.md, ux.md) read FULLY before asking questions
- [ ] Fidelity recommended with rationale; user confirmed or overrode
- [ ] Visual anchor captured (named aesthetic or reference) — never left as generic default
- [ ] Three subagents dispatched in parallel: web-research (references), analyst (flow + content), patterns (existing codebase anchor, if applicable)
- [ ] ALL subagents completed before generation
- [ ] HTML artifact is single self-contained file under 300KB
- [ ] Metadata comment block at top of `<head>` includes feature, fidelity, assumptions, NOT-included list
- [ ] Design tokens block present and encoded as CSS custom properties on `:root`
- [ ] Every screen includes happy path + at least one non-happy state (empty, error, or edge)
- [ ] No Lorem ipsum, no placeholder filler — realistic domain content throughout
- [ ] No external image dependencies (inline SVG only)
- [ ] All recurring components use a single named CSS class (no inline re-styling)
- [ ] All interactive elements respond visually; no console errors; no `href="#"` jump links
- [ ] Saved to `{OUT_DIR}/prototypes/{slug}_{MMDDYY}.html`
- [ ] Portability self-check run (size, external images, relative paths, component reuse, state coverage); violations surfaced as caveats
- [ ] (post-ux mode only) Filled assumptions surfaced in chat with offer to update ux.md; selected items written to ux.md with diff summary
- [ ] Next Steps footer rendered with mode-appropriate recommendation
