---
name: Spectre
description: Contract-driven agentic coding workflows. The Ghost Ledger: ink chrome, white spectral light, paper artifacts.
colors:
  ink: '#0a0b0d'
  ink-raised: '#101216'
  surface: '#15181d'
  surface-raised: '#1b1f26'
  hairline: '#edf0f41f'
  hairline-strong: '#edf0f442'
  text: '#eceef1'
  muted: '#a6acb4'
  faint: '#757c85'
  ghost-dim: '#545b64'
  spectre: '#eef1f5'
  spectre-bright: '#f8fafc'
  spectre-soft: '#eef1f512'
  spectre-glow: '#eef1f573'
  complete: '#c9cfd7'
  complete-soft: '#c9cfd729'
  paper: '#f5f5f4'
  paper-sunken: '#e9e9e7'
  paper-ink: '#1d2024'
  paper-muted: '#60656b'
typography:
  display:
    fontFamily: 'Space Grotesk, Segoe UI, system-ui, sans-serif'
    fontSize: 'clamp(38px, 6vw, 62px)'
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: '-0.025em'
  headline:
    fontFamily: 'Space Grotesk, Segoe UI, system-ui, sans-serif'
    fontSize: 'clamp(30px, 4.6vw, 48px)'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'Space Grotesk, Segoe UI, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: 'Space Grotesk, Segoe UI, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace'
    fontSize: '10px'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '0.15em'
  meta:
    fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: '8px'
  md: '10px'
  lg: '12px'
  xl: '14px'
  2xl: '16px'
  pill: '999px'
spacing:
  xs: '8px'
  sm: '12px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  input-search:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '8px 14px 8px 40px'
    height: '40px'
  chip-file:
    backgroundColor: '{colors.ink-raised}'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
    padding: '6px 12px'
    height: '36px'
  button-icon:
    textColor: '{colors.muted}'
    rounded: '{rounded.pill}'
    width: '36px'
    height: '36px'
  card-stage:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.xl}'
    padding: '18px 20px'
  card-stage-present:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.text}'
    rounded: '{rounded.xl}'
    padding: '18px 20px'
  card-hero:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.text}'
    rounded: '{rounded.2xl}'
    padding: '26px 30px'
  sheet-document:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.paper-ink}'
    rounded: '{rounded.2xl}'
    padding: '52px 56px'
---

# Design System: Spectre

## 1. Overview

**Creative North Star: "The Ghost Ledger"**

The scene: an engineering lead opens Spectre Home at 10pm in a dim room to see what the agents shipped while they were in meetings. The shell recedes into ink. The one in-flight build glows like something present in the room. Each document reads like a printed page under a desk lamp. That sentence is the whole system.

Spectre turns feature builds into durable, inspectable records, so the interface is a ledger kept in ink. Chrome lives on near-black. Artifacts (scope.md, plan.md, tasks.json, proof) live on neutral paper. Anything alive right now appears as white light: a luminous node, a breathing ring, a soft halo. Nothing else glows, because nothing else deserves attention. The ghost is not decorated; the ghost is the signal.

This system explicitly rejects generic project-management boards that reduce a build to movable tickets, CI log viewers that make raw output the information architecture, SaaS analytics dashboards dominated by summary metrics and decorative cards, gamified progress trackers that reward ceremony over evidence, and dense agent-control consoles that bury the feature's intent under narration.

**Key Characteristics:**

- Strict monochrome: black ink, white paper, and a grayscale ramp between. No hue anywhere.
- State is luminance, shape, and motion: solid pale for done, luminous white for live, dim hollow for pending.
- Two surfaces only: ink for the machine, paper for the artifacts.
- Terminal mono is a first-class voice for filenames, timestamps, ratios, and stage labels.
- Forensic calm: hairline borders, generous dark space, film grain, one pulse animation reserved for live things.

## 2. Colors: The Ink and Paper Palette

A strict achromatic palette. Every neutral carries a whisper of cool (chroma under 0.01) so the blacks feel like night air rather than void.

### Primary

- **Spectre White** (#eef1f5): the ghost light. Reserved exclusively for what is alive right now: the current lifecycle node, live links, the live dot, hover accents on interactive text, focus rings, and every glow in the system. Its rarity is the signal. If two things on a screen glow, one of them is lying.
- **Spectre Bright** (#f8fafc): the hot end of gradients and the hover state for feature names and chips. Never a resting color.

### Neutral

- **Ink** (#0a0b0d): the application canvas. Never pure #000; pure black reads as a hole, not a surface.
- **Ink Raised** (#101216): sunken wells one step above the canvas: beam dot beds, task panels, file chip backgrounds.
- **Surface** (#15181d): cards, lists, and inputs at rest.
- **Surface Raised** (#1b1f26): hover state for rows and the top of the hero and present-stage gradients.
- **Hairline** (#edf0f41f, 12% white): default borders and separators. Structure drawn in mist.
- **Hairline Strong** (#edf0f442, 26% white): chip borders, hero card border, interactive outlines.
- **Text** (#eceef1): primary reading on ink. Never pure #fff.
- **Muted** (#a6acb4): secondary text, timestamps, icon defaults.
- **Faint** (#757c85): placeholders, task IDs, column headers.
- **Ghost Dim** (#545b64): the dormant state. Pending rings, unlit affordances, anything that exists but has not happened.
- **Complete** (#c9cfd7): done fills: check nodes, completed links, finished mini-lifecycles. Solid and quiet. Finished work does not glow, because it no longer asks for attention.
- **Complete Soft** (#c9cfd729, 16%): the wash inside completed nodes.
- **Paper** (#f5f5f4): the document sheet. Neutral ghost-white, no cream, no warmth.
- **Paper Sunken** (#e9e9e7): code blocks and inset areas on paper.
- **Paper Ink** (#1d2024): body text on paper.
- **Paper Muted** (#60656b): secondary text on paper.

### Named Rules

**The Ghost Light Rule.** White is the only light in the system, and state is never carried by hue. Done, live, pending, and blocked are distinguished by luminance, shape, and motion, and every state also ships with an icon or text label. If a screen needs a color to be understood, the design failed, not the palette.

**The Two Surfaces Rule.** Everything is ink or paper. Chrome, navigation, lists, and controls live on ink. Documents and artifacts live on paper. There is no third surface: no slate panel, no tinted card, no warm gray detour.

## 3. Typography

**Display Font:** Space Grotesk (with Segoe UI, system-ui fallback)
**Body Font:** Space Grotesk (same family carries headings, labels, body, data)
**Label/Mono Font:** JetBrains Mono (with SFMono-Regular, Consolas fallback)

**Character:** a technical grotesque with engineering posture, paired with a terminal mono that speaks for the machine. The pairing matches the product's voice: blunt, contract-driven, unimpressed by decoration. Obvious over clever, in type as in workflow.

### Hierarchy

- **Display** (700, clamp(38px, 6vw, 62px), line-height 1.05, -0.025em): screen titles only, one per screen. Feature builds, the feature record name.
- **Headline** (700, clamp(30px, 4.6vw, 48px), line-height 1.1, -0.02em): the featured build's name at hero scale.
- **Title** (600, 16px, line-height 1.15): deck names, feature row names, task panel headings.
- **Body** (400, 15px, line-height 1.5): interface text. Documents render at 16px/1.66 with a 74ch measure.
- **Label** (JetBrains Mono 600, 10px, uppercase, +0.15em): stage names on the beam, column headers.
- **Meta** (JetBrains Mono 400, 12px): filenames, timestamps, task ratios, repository paths.

### Named Rules

**The Terminal Is First-Class Rule.** Mono is not a fallback face. Filenames, timestamps, task IDs, ratios, and stage labels are always JetBrains Mono, because they are machine facts. Prose never uses mono, because prose is for humans. The two voices never blend mid-sentence.

## 4. Elevation

The dark shell has no drop shadows. Depth on ink is conveyed by luminance steps (canvas to Ink Raised to Surface to Surface Raised) plus hairline borders. Glow is reserved for live things and hover lift. Paper is the single exception: it casts a true shadow because it is the only lit object in the room.

### Shadow Vocabulary

- **Spectral glow** (`box-shadow: 0 0 22px rgba(238,241,245,.45)`): the live lifecycle node at rest. The only permanent glow.
- **Halo** (`box-shadow: 0 0 34px -14px rgba(238,241,245,.18)`): the present stage deck and the brand mark.
- **Hover lift** (`box-shadow: 0 0 60px -16px rgba(238,241,245,.22)`): hero card on hover, paired with a 3px rise.
- **Paper cast** (`box-shadow: 0 44px 90px -30px rgba(0,0,0,.85)`): the document sheet only. Never on ink surfaces.
- **Focus ring** (`box-shadow: 0 0 0 3px rgba(238,241,245,.45)`): keyboard focus on ink. On paper, the same ring in Paper Ink.

### Named Rules

**The Dark Doesn't Drop Shadows Rule.** On the ink shell, black drop shadows are forbidden; they are mud on a black canvas. Elevate with a lighter surface and a hairline. Lift with a white glow. Only paper casts, because only paper is lit.

## 5. Components

### Brand Mark

The ghost: a small dome-bodied spectre with a scalloped hem and two eyes, drawn in 1.8px round-capped strokes, set inside a thin circular ring with a soft white halo (24px ring, 15px mark). It always renders in Spectre White on ink, or Paper Ink on paper. Never recolor it, never fill it, never put it in a gradient. It is the only logo; there is no wordmark lockup beyond setting "Spectre" in Space Grotesk 600 beside it.

### Live Dot

- **Live:** an 8px Spectre White dot with a breathing ring (2.6s ease-in-out pulse). Means: this build is in flight right now.
- **Steady:** the same dot in Complete, ring optional. Means: connected, watching, healthy. Calm, not celebratory.

### Search Input

- **Style:** Surface background, Hairline border, gently rounded (10px), 40px tall, leading search icon in Faint, 8px 14px 8px 40px padding.
- **Focus:** border brightens to 55% white plus the standard focus ring. No glow beyond the ring; it is a tool, not an event.

### File Chip

- **Style:** Ink Raised background, Hairline Strong border, 8px radius, 36px tall, filename in Meta mono, leading file icon in Muted.
- **Hover:** name and icon shift to Spectre Bright, border brightens, 1px rise with a faint white lift glow. Filenames are first-class controls; the chip is their affordance.
- **Don't** color-code icons by file type. The extension is already in the name.

### Lifecycle Beam (signature)

The beam is how Spectre draws a build: node, link, node, at three scales (hero 42px nodes, record rail 42px, row mini 14px).

- **Done node:** Complete border, Complete Soft fill, ink check inside. **Done link:** solid Complete at 85% opacity.
- **Live node:** Spectre White fill, ink core, spectral glow, breathing ring. **Live link:** gradient from Complete to Spectre White with a soft glow, reading past into present.
- **Pending node:** hollow ring in Ghost Dim. **Future link:** dashed Hairline Strong. Pending stages stay wordless beyond their label.
- Nodes are buttons on the record rail (scroll-to-stage); on the index they are a static `role="img"` summary with a full aria-label.

### Stage Deck

- **At rest:** Surface background, Hairline border, 14px radius, 18px 20px head padding.
- **Present:** Surface Raised with a faint top-down white tint (6% fading to nothing), 32% white border, and the Halo shadow. The current stage is lit; everything else is filed.
- **Pending:** 45% opacity. Receded, not hidden.

### Task Rows

Subtasks nest under parent tasks. Parents roll progress up; subtasks carry the detail.

- **Parent rows:** full-width buttons with status icon, mono ID, title, a factual subtask ratio (1 / 2) in Meta mono, and a chevron that points right when collapsed, down when expanded. The active parent is expanded by default; completed and unstarted parents are collapsed. Expanding is instant with a 250ms opacity fade, never a height animation.
- **Subtask rows:** 48px rows indented under a 1px Hairline guide that drops from the parent icon: status icon, mono task ID in Faint, title.
- **In progress:** a Spectre Soft wash across the whole row, ID brightens to Spectre White. Never a side stripe; the wash plus the status icon carries it.
- **Completed:** title drops to Muted, check icon in Complete.

**The Live Pulse Rule.** The breathing ring marks the exact live task. A live parent glows steady (Spectre fill, ink core) without the ring, so an expanded group never shows two pulses.

### Feature Rows

- **Hover:** Surface Raised background, name shifts to Spectre Bright. No inset bars, no stripes; the row changing altitude is enough.

### Document Sheet

- **Style:** Paper background, Paper Ink text, 16px radius, the Paper cast shadow, 52px 56px padding, 74ch measure. Code blocks on Paper Sunken with a 10% Paper Ink border.
- The sheet is the moment the product hands you the artifact. It should feel like lifting a printed page off a dark desk.

### Header

Sticky 56px bar: 78% Ink with a 14px backdrop blur and a Hairline bottom border. This is the one permitted blur in the system, and it is functional (legibility over scrolling content), not glass decoration.

## 6. Do's and Don'ts

### Do:

- **Do** reserve Spectre White glow for the one thing that is live. One screen, one ghost.
- **Do** pair every state with a shape (check, ring, pulse) and a text label, so meaning never rides on luminance alone.
- **Do** set filenames, timestamps, task IDs, ratios, and stage labels in JetBrains Mono.
- **Do** render documents on Paper and everything else on Ink. When in doubt, ask: is this the artifact or the machine?
- **Do** animate at 150 to 350ms with ease-out-expo (cubic-bezier(.19, 1, .22, 1)). The 2.6s breathe pulse is for live indicators only.
- **Do** keep progress factual: task ratios (3 / 6) and stage state. Progress bars are allowed; percentages that imply false precision are not.

### Don't:

- **Don't** introduce hue for state: no green done, no orange live, no red error, no purple file icons. Violates The Ghost Light Rule.
- **Don't** use pure #000 or #fff. Ink and Paper stop one step short on purpose.
- **Don't** draw side-stripe accents (border-left or inset box-shadow stripes over 1px) on rows, decks, or callouts. Use a full-row wash instead.
- **Don't** use gradient text, glass cards, or glassmorphism. The sticky header's functional blur is the only exception.
- **Don't** build "generic project-management boards that reduce a feature build to movable tickets." A build is a record, not a card in a column.
- **Don't** make "raw execution output the primary information architecture" like CI log viewers. Logs are evidence behind the record, never the record.
- **Don't** ship "SaaS analytics dashboards dominated by summary metrics and decorative cards." No hero-metric templates, no big number over a small label.
- **Don't** add "gamified progress trackers that reward ceremony rather than useful evidence": no confetti, streaks, badges, or completion celebrations.
- **Don't** build "dense agent-control consoles" with agent narration, diagnostics, or workflow controls. This surface observes; it does not steer.
- **Don't** manufacture "a single misleading percentage." Progress is factual: what is complete, active, pending, or unproven.
