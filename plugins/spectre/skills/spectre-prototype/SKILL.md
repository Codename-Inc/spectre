---
name: "spectre-prototype"
description: "Generate a single self-contained, clickable HTML prototype to make a feature visible before planning — resolving ambiguity pre-scope, validating flows pre-plan, or rendering an approved UX spec for stakeholder review. Triggers on \"prototype this\", \"mock up the UI\", \"make a clickable preview\", or a mid-flow `ux` Stage 1→2 transition. Do NOT trigger to write production app code, build a multi-file frontend, or plan/scope the work itself — this produces one throwaway HTML file only."
user-invocable: true
---

# prototype

Produce one portable, self-contained HTML file that makes a feature visible before it is planned. Output saved to `{OUT_DIR}/prototypes/{slug}_{MMDDYY}.html`.

## Inputs
- `$ARGUMENTS` (feature description, `--explore` flag, optional output path).
- Env markers: `FROM_UX=true`, `FROM_KICKOFF=true`.
- On-disk context (read FULLY, no offset/limit): `docs/tasks/{branch}/concepts/scope.md`, `.../specs/prd.md`, `.../ux.md`. Resolve `branch` via `git rev-parse --abbrev-ref HEAD` at runtime.

## Mode + fidelity (detect most-context-first; this drives intake and faithfulness)
| Mode | Signal | Fidelity | Job |
|---|---|---|---|
| post-ux | complete `ux.md` (has Screens, Layouts, Components, Interactions, States, Content) | high-fi | **render the spec faithfully** — do not invent screens or contradict documented states/copy |
| flows-only ux | `FROM_UX=true`, or ux.md with flows but missing Stage-2 sections | mid-fi | flows are approved input; you make the UI calls |
| explore | `--explore` flag | low-fi (grayscale, layout-only) | concept unvalidated |
| post-scope | scope.md exists, no ux.md | mid-fi | validate scope |
| standalone | none | mid-fi | ask what we're prototyping |

## Working set
Stage 1 intake (tight: 2–4 questions, never a form), then a gated parallel research+generate pass. Single-threaded write of the HTML.

## Method / guardrails
1. **Immediate reply, then detect.** Respond before any tool call (except reading `ux.md` when `FROM_UX=true`). If ARGUMENTS empty → ask what we're prototyping.
2. **Read context before asking.** Read whichever of scope.md/prd.md/ux.md exist, fully; classify ux.md as complete / flows-only / absent → sets mode.
3. **Confirm fidelity + visual anchor.** Recommend fidelity per the table; request a visual anchor (brand colors, font stack, reference URL, or named aesthetic e.g. "Linear-style"). If user skips, commit to a deliberate named aesthetic and call it out at the top of the file. **Gate: wait for confirmation** (auto-proceed only when `FROM_UX=true`).
4. **Dispatch parallel subagents** (roster fixed — do not add or rename):
   - `@spectre:web-research` — 2–3 living UI references + the established convention for this interaction type + concrete palette/type/layout decisions for the anchor (hex, font families). Anti-slop forcing function: without it the model defaults to Inter + purple gradients. <400 words, cite sources.
   - `@spectre:analyst` — **extract** mode (post-ux): pull Screens/Layouts/Components/Interactions/States/Content verbatim from ux.md; use documented copy EXACTLY; flag spec-silent details as "filled assumptions"; never invent screens. **synthesize** mode (else): primary flow, per-screen state list, realistic domain content (no Lorem ipsum), component inventory.
   - `@spectre:patterns` — only if an existing app to anchor to: real design tokens, component conventions, interaction patterns (return actual hex/class values, not paths). Skip otherwise.
   Return findings in-thread (compressed); write no intermediate docs.
5. **Generate** after ALL subagents return. Use `@spectre:dev` (or inline if trivial). Embed the negative constraints below verbatim in the dev prompt.

### Required HTML structure (load-bearing — these prevent the known failure modes)
1. `<!DOCTYPE html>` + minimal `<head>` (`<meta viewport>`, inline `<style>`).
2. **Metadata comment** at top of `<head>`: Feature · Fidelity · Generated (date) · Branch · Flow covered · Screens/states · Visual anchor · Source spec (ux.md path or "synthesized from …") · Key assumptions · Filled assumptions (post-ux only) · NOT included · Next step.
3. **Design-tokens comment** (Primary/Accent/Surface/Text/Font/Border-radius/Spacing) AND the same encoded as CSS custom properties on `:root`.
4. **Nav bar** only if multi-screen — vanilla-JS `display:block/none` toggling. No router, no framework.
5. **One `<section>` per screen**, in user-encounter order. Every screen shows the happy path AND ≥1 of: empty / error / loading state.
6. Inline `<script>` at end of body for interactions. Vanilla JS only.

### Hard constraints (positive form unless destructive)
- Single self-contained file, **under 300KB**. Tailwind-via-CDN OK for mid/high-fi; skip for low-fi.
- Portable assets only: inline SVG / data-URI / CSS shapes. **No `<img src="http…">`, no local relative paths (`./`, `../`), no custom WOFF.** Fonts: one Google-Fonts family (≤2 weights) or system.
- **No generic AI aesthetic** (no default Inter/Roboto, no purple-on-white gradients). **No Lorem ipsum / placeholder filler.** **No happy-path-only screens.** **No broken interactivity** (no `href="#"` jumps, no console errors). **No inconsistent components** — each recurring element = one named CSS class, reused, never re-styled inline.

## Outputs + DONE
File at `{OUT_DIR}/prototypes/{slug}_{MMDDYY}.html` (`OUT_DIR=docs/tasks/{branch}` unless `FROM_UX`/`FROM_KICKOFF` reuse the task dir or user gives a path; `mkdir -p` the prototypes subdir). DONE when:
- [ ] Mode + fidelity detected; context docs read fully before any question; visual anchor captured (never left generic).
- [ ] Subagents dispatched in parallel and all completed before generation.
- [ ] HTML is one self-contained file <300KB; metadata + design-token blocks present; tokens on `:root`.
- [ ] Every screen: happy path + ≥1 non-happy state; realistic content; inline SVG only; recurring components share one class; all interactions respond, no console errors.
- [ ] Portability self-check run (size, external images, relative paths, component reuse, state coverage); any violation surfaced as a caveat, not silently shipped.

## Handoff
Present: path, size, screen count, fidelity, visual anchor, key assumptions, NOT-included list; tell user to `open` it in a browser and that it is fully shareable. Iterate on feedback (small tweaks → edit HTML; structural → re-run subagents + regen; re-run the portability check after any edit). **post-ux only:** surface filled assumptions and offer to promote selected ones into `ux.md` (edit the matching section, re-present with a one-line diff). Close with an inline Next-Steps line, mode-specific: `FROM_UX` → resume `/spectre:ux` Stage 2; `--explore` → `/spectre:scope`; post-scope → `/spectre:ux` or `/spectre:plan`.

## Escalate if
- Spec contradicts the prototype (post-ux): ask which is authoritative per contradiction, then update `ux.md` and the HTML together and re-run the portability check.
- No usable visual anchor and no inferable aesthetic, or required context docs are missing/unreadable when a mode expects them.
