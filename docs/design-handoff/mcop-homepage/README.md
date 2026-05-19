# Handoff: MCOP Framework 2.0 — Motion Glass Homepage

> **Placement in this repository**
>
> - **Live prototype** — [`public/homepage/index.html`](../../../public/homepage/index.html). Browsable as a static page; mirrors the precedent of [`public/showcase/index.html`](../../../public/showcase/index.html).
> - **Reference screenshots** — [`./screenshots/`](./screenshots/) (adjacent to this document).
> - **Proposed revised root README** — [`./PROJECT_README.md`](./PROJECT_README.md). Kept here as a reference only; the live root [`README.md`](../../../README.md) has *not* been replaced.
>
> Prose references below to `index.html` and `screenshots/` describe the bundle as authored; resolve them against the placement above when reading.

## Overview

A professional homepage for the **MCOP Framework 2.0** GitHub repository (`Kuonirad/MCOP-Framework-2.0`) — a recursive meta-cognitive optimization protocol for AI agents. The page introduces the deterministic triad (NovaNeoEncoder · StigmergyV5 · HolographicEtch), shows live-feeling cryptographic provenance, exposes benchmark budgets, surfaces the Universal Adapter Protocol with seven providers, compares MCOP against mainstream agent frameworks, and ends with a quick-start install section + outro.

The aesthetic is **"motion glass gossamer"**: an obsidian backdrop with drifting aurora gradients, translucent glass surfaces with refractive sheen + a slow gossamer light-sweep, iridescent italic display type, monospaced metadata, and a steady stream of subtle motion (animated counters, drifting hashes, live resonance meters, three triad canvases, a particle chain-of-custody canvas, an orbiting adapter constellation).

## About the Design Files

The files in this bundle (`index.html`, `README.md`) are **design references created in HTML** — a working prototype showing intended look, motion, and behavior. They are **not** production code to ship as-is.

The task is to **recreate this design in the target codebase's existing environment**. The MCOP repo is a **Next.js 15.5 + TypeScript** project (already established), so the recommended approach is:

- Implement as a Next.js page (e.g. `src/app/page.tsx` or a marketing route)
- Use React components for each section (Hero, Ticker, Triad, Chain, Perf, Adapters, Compare, Install, Outro)
- Lift the CSS into either CSS Modules / Tailwind (whichever matches the repo's convention) or a single `homepage.css`
- Keep the canvas animations as vanilla `<canvas>` + `useEffect` hooks, or migrate to `react-three-fiber` if the team prefers (the existing `/showcase/` already uses Three.js)
- Preserve all `data-screen-label` attributes for downstream tooling

## Fidelity

**High-fidelity (hifi).** Final colors, typography, spacing, interactions, and motion are all specified. Recreate pixel-perfectly using the codebase's existing libraries and patterns. The HTML reference is fully self-contained and can be opened directly to verify intended behavior.

---

## Sections (single-page scroll)

The page is one continuously scrolling document. Sections are numbered `§ 01 … § 06` in the section heads using `data-screen-label="NN <Name>"` on each `<section>`.

### 1. Hero (`data-screen-label="01 Hero"`)

- **Layout**: full viewport min-height, `padding: 140px 32px 60px`, content aligned to bottom of viewport.
- **Eyebrow**: pulsing cyan dot + monospace tag — "Meta-Cognitive Optimization Protocol · Framework 2.0".
- **H1**: serif display, italic, `clamp(56px, 10.5vw, 178px)`, line-height 0.92, three lines. Middle word "cryptographically" uses an **iridescent gradient** that animates left↔right over 12s (violet → amber → cyan → magenta).
- **Lede**: serif, ~24px, max-width 680px.
- **Hero row** (4 glass cards in a `1.6fr 1fr 1fr 1fr` grid, collapses to 1fr on mobile):
  1. CTA cell: two buttons (primary iridescent "Open on GitHub →", outline "Quick start →") + a `live` SHA-256 hash line that drifts.
  2. Pipeline metric: `4.4 ms`, sub: "22,700 ops/sec · full triad".
  3. Coverage metric: `96.6 %`, sub: "jest · documented surface".
  4. License metric: `BUSL 1.1`, sub: "→ MIT · 2030-04-26".

### 2. Ticker

- Full-bleed marquee strip between hero and triad. Monospace 11px, letter-spacing .24em, uppercase. Items separated by amber-glow dots. Animation: `slide 80s linear infinite`. Content doubled for seamless loop. Tokens: SHA-256, UUID-v4, ISO 8601, Merkle-Chained, RFC 8785, Rank-1 Tensor, Cosine Resonance, Append-Only Ledger, Deterministic, Byte-Identical, Next.js 15.5, TypeScript 5, SBOM Validated, CodeQL Hardened, Trusted Publishing, Eudaimonic Bloom.

### 3. The Deterministic Triad (`§ 01`)

Three glass cards in a 3-column grid (collapses to 1 column ≤980px). Each card is `min-height: 520px`, `padding: 0` (children manage padding), `grid-template-rows: auto 1fr auto`.

- **Top strip**: kernel class name (uppercase mono) + italic serif index (`i.`, `ii.`, `iii.`).
- **Canvas region** (240px tall): a custom WebGL/2D animation per kernel:
  - **NovaNeoEncoder** (`data-hue="violet"`): concentric circles + 26 orbiting tensor nodes + violet radial pulse.
  - **StigmergyV5** (`data-hue="cyan"`): 14 layered sinusoidal pheromone trails with gradient strokes that breathe alpha over time.
  - **HolographicEtch** (`data-hue="amber"`): 7 horizontal rank-1 strata (slightly displaced) + sparkle markers.
- **Body**: serif h3 (34px) with italic emphasis ("Context becomes *tensor.*"), body copy, accent tag with a leading dash (hue varies per card).

### 4. Cryptographic Chain of Custody (`§ 02`)

Two-column grid (1fr 1.05fr):

- **Left — chain canvas**: 560px min-height. A full-pane particle animation: 3 wavy spines (violet, cyan, amber) with 80 glowing particles streaming through. Adds a corner label "Provenance Stream · RFC 8785 · SHA-256" and a legend at the bottom (Encode/Recall/Etch).
- **Right — chain steps**: 5 rows i–v, each with a serif italic numeral, h4 + monospace caption, and a drifting 12-char amber hash on the right.

Below: **Console** (2-column glass grid):
- **Cell A**: "Last canonical digest" + live sha256: + merkle: hash lines, each drifting deterministically every 220ms.
- **Cell B**: "Resonance · cosine similarity" + live ISO timestamp, two animated bars (resonance, eudaimonic) with values that fluctuate within plausible ranges (0.985–0.999 / 0.965–0.995).

### 5. Deterministic Benchmarks (`§ 03`)

Top: 4 metric cards (`<50ms`, `22.7K req/s`, `99.99%`, `<128MB`) each with a live sparkline (data shifts left every ~18 frames, last point glows amber).

Below: a full-width glass `perf-table` with 8 rows + header (4 columns: Operation, Latency, Throughput, Δ load). The "Full pipeline" row is highlighted in amber with a gradient bar.

### 6. Universal Adapter Protocol (`§ 04`)

Single full-width glass card split 1fr 1.2fr:

- **Left**: heading "Every adapter call lands in the *same Merkle root.*" + table of 7 providers (name, protocol, "Active" status with glowing cyan dot).
- **Right**: `orbit-canvas` — a shimmering radial-gradient core (violet/cyan), concentric rings, 7 orbiting beads with connecting filaments and a sweeping radar arc. 6 floating pin labels positioned around the canvas: OpenAI · GPT (top), Claude (top-right), Gemini (bottom-right), Grok · xAI (bottom), Ollama (bottom-left), Groq · Together (top-left).

### 7. Comparison Table (`§ 05`)

Single glass card. 5-column grid: feature / MCOP 2.0 / LangChain / AutoGen / CrewAI. MCOP column header is amber. 11 rows of capabilities; `✓` is amber, `~` is violet, `—` is muted.

### 8. Quick Start (`§ 06`)

Two-column glass grid (1.15fr 1fr):
- **Left — code card**: 4 tabs (bash, typescript, python, docker). Each pane is a `<pre>` with syntax highlight classes (`c-com`, `c-prompt`, `c-key`, `c-str`, `c-name`). Each pane has a top-right "copy" button that clipboards the snippet.
- **Right — install-prose**: serif h3, two paragraphs about cross-runtime parity, and a chips list (Next.js 15.5, TypeScript 5, Node 22.22.2, pnpm 9.15.0, Python 3.12, Docker, Jest 96.6%, ESLint strict, CodeQL, SBOM, OIDC publish).

### 9. Outro

Centered glass panel, padding 80×60. Iridescent serif headline "Determinism is a *design choice.*" + lede + three buttons (primary GitHub, outline docs, outline architecture).

### 10. Footer

Single row, justify-between. Left: project line + author link. Right: legal chips (BUSL 1.1, → MIT 2030-04-26, SHA-256 sealed, RFC 8785).

---

## Interactions & Behavior

### Header

- Fixed pill-shaped glass header at `top: 18px`, `left/right: 18px`, `border-radius: 999px`, `backdrop-filter: blur(22px)`. Stays at the top throughout scroll.
- Nav links have an underline that scales in from the left on hover (`transform: scaleX(0→1)`).
- GitHub CTA: `→` arrow translates 3px right on hover; button lifts 1px.

### Scroll reveals

- IntersectionObserver with `threshold: .12, rootMargin: '0px 0px -10% 0px'`. Elements with `[data-reveal]` start with `opacity: 0; translateY(36px)` and animate to identity over 1s with `cubic-bezier(.2,.7,.2,1)`.

### Counters

- Any `[data-count]` element animates from 0 to the target over 1600ms with ease-out-cubic when scrolled into view. `data-decimals` controls precision.

### Hash drift

- Every 220ms, replace ~15% of characters in any `[data-hashdrift]` element with random hex. Gives a "live cryptographic ledger" feel without being chaotic.
- Hero hash regenerates 16 hex chars every tick.

### Live resonance

- Every 1200ms: resonance value drifts in 0.985–0.999, eudaimonic in 0.965–0.995, bars scale to match, ISO timestamp updates to `new Date().toISOString()`.

### Code tabs / copy

- Clicking a tab toggles `is-active` on the tab + matching `<pre>`.
- Copy button uses `navigator.clipboard.writeText(btn.dataset.copy)`, shows "copied" with amber border for 1400ms.

### Canvases

All canvases:
- Use `dprFit()` to fit `devicePixelRatio` (sets `canvas.width = clientWidth * ratio`, applies `setTransform`).
- Pause animation when scrolled out via IntersectionObserver (`threshold: .05`).
- Resize listener re-fits on window resize.

Per-canvas frame logic is fully spelled out in the source script block at the bottom of `index.html` (~250 lines). Port to React with `useRef` + `useEffect` cleanup, or wrap in a custom `useCanvasLoop(draw, dependencies)` hook.

---

## State Management

The prototype is largely stateless / driven by `setInterval` + `requestAnimationFrame`. In React:

- `useState` for: active code tab.
- `useEffect` for: scroll-reveal observer, counter observer, hash drift interval, resonance interval, each canvas RAF loop.
- No external data fetching is needed for the homepage itself. All numbers are pulled from the repo's documented baselines.

---

## Design Tokens

### Colors

```
--bg            #06060b   (page bg)
--bg-deep       #030308   (atmosphere base)
--ink           #f5f1e8   (primary text — warm bone-white)
--ink-soft      rgba(245,241,232,.72)
--ink-mute      rgba(245,241,232,.46)
--ink-faint     rgba(245,241,232,.18)
--rule          rgba(245,241,232,.10)
--rule-strong   rgba(245,241,232,.22)

--glass-bg      rgba(20,20,30,.36)
--glass-edge    rgba(255,255,255,.10)
--glass-glint   rgba(255,255,255,.06)

--aurora-1      oklch(0.74 0.18 280)   violet   (#b39bff approx)
--aurora-2      oklch(0.78 0.16 220)   cyan     (#9bd6ff approx)
--aurora-3      oklch(0.84 0.14 70)    amber    (#e8c98a approx)
--aurora-4      oklch(0.70 0.20 330)   magenta
```

All accent gradients are mixed with `color-mix(in oklch, var(--aurora-N) <pct>%, transparent)` to keep chroma harmonious.

### Typography

```
--serif   'Instrument Serif', 'Times New Roman', serif   (display, italic)
--sans    'Geist', system-ui, sans-serif                  (body)
--mono    'JetBrains Mono', ui-monospace, monospace       (metadata, code)
```

| Use | Font | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| H1 (hero) | serif | clamp(56px, 10.5vw, 178px) | 400 | 0.92 | -0.025em |
| H2 (section) | serif | clamp(42px, 6vw, 86px) | 400 | 1 | -0.02em |
| H3 (card) | serif | 34–42px | 400 | 1.05 | -0.01em |
| Lede | serif | clamp(20px, 1.6vw, 26px) | 400 | 1.35 | — |
| Body | sans | 14–15px | 400 | 1.55–1.6 | — |
| Eyebrow / mono labels | mono | 10–11px | 400 | — | 0.22em UPPERCASE |
| Buttons | mono | 11px | 400 | — | 0.22em UPPERCASE |

Load via Google Fonts: `Instrument+Serif:ital@0;1`, `Geist:wght@300;400;500;600`, `JetBrains+Mono:wght@300;400;500`.

### Spacing

- Section padding: `140px 32px`. Adjacent sections collapse top padding to 0 with `section + section { padding-top: 0 }`.
- Card gaps: 18–32px depending on density.
- Inner card padding: 22–38px.
- Shell max-width: 1380px, `padding: 0 32px`.

### Border radius

- Glass surfaces: `18px`.
- Pills (header, buttons, chips): `999px`.
- Flat utility surfaces: `0` (sharp).

### Shadows

```
glass-shadow:
  inset 0 1px 0 rgba(255,255,255,.10),
  inset 0 -1px 0 rgba(0,0,0,.30),
  0 30px 80px -30px rgba(0,0,0,.60),
  0 1px 0 rgba(255,255,255,.04)
```

### Glass surface recipe

```css
background: rgba(20,20,30,.36);
backdrop-filter: blur(28px) saturate(160%);
border: 1px solid rgba(255,255,255,.10);
border-radius: 18px;
box-shadow: <glass-shadow>;

/* ::before — top sheen */
background:
  linear-gradient(180deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 30%, transparent 100%),
  radial-gradient(60% 80% at 20% 0%, rgba(255,255,255,.10), transparent 60%);

/* ::after — slow gossamer light-sweep, 14s ease-in-out infinite */
background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.07) 50%, transparent 70%);
animation: gossamer 14s ease-in-out infinite;
```

### Atmosphere recipe

Fixed full-viewport layer at `z-index: 0`, composed of:
1. 3 stacked radial gradients (violet top-left, cyan top-right, magenta bottom) over `--bg-deep`.
2. Two conic-gradient "veils" (filter: blur(80px) saturate(140%)) rotating 38s and 54s in opposite directions.
3. SVG turbulence grain (mix-blend overlay, opacity .45).
4. Repeating-linear scan lines (1px / 3px, mix-blend overlay, opacity .5).

---

## Assets

No external image assets are required by the homepage. Everything is rendered via CSS, SVG (inline brand mark), and Canvas 2D. The brand mark in the header is an inline SVG diamond with the same aurora gradient.

The repo already contains:
- `public/mcop-hero-banner.svg` — referenced from README as a poster image (optional on the homepage)
- `public/showcase/` — existing Three.js cinematic showcase (a separate destination linked from the new homepage)

If you want a richer hero, you could optionally overlay the existing Three.js scene from `/showcase/scene.js` into the hero canvas, but the prototype's CSS-only aurora + glass is already complete.

---

## Files

- `index.html` — full single-file prototype (~1800 lines including style + script). Open directly in any modern browser; no build step.
- `PROJECT_README.md` — the revised repository README that links to the new homepage and the existing Three.js showcase.
- `screenshots/` — reference renders of each section, in scroll order:
  - `01-hero.png` — hero h1 tail, lede, CTA card + 3 metric cards (4.4 ms / 96.6% / BUSL 1.1)
  - `02-triad.png` — close-up of the HolographicEtch card with its append-only strata canvas
  - `03-chain-of-custody.png` — provenance stream canvas with three flowing particle spines (violet / cyan / amber)
  - `04-benchmarks.png` — 4 metric cards with live sparklines
  - `05-adapters.png` — adapter table with status pills (note: the source HTML has an extra `margin-bottom: 22px` on the orbit-side `<h3>` that this screenshot was captured *before* — the live `index.html` renders cleanly with the gap)
  - `06-comparison.png` — comparison table headers + first rows
  - `07-install.png` — bash tab of the install code card with tokenized syntax
  - `08-outro.png` — closing iridescent "design choice." panel
- `README.md` — this handoff document.

---

## Implementation checklist for the developer

- [ ] Decide whether to lift this into the existing Next.js `src/app/page.tsx` or scope to a marketing route (`src/app/(marketing)/page.tsx`).
- [ ] Split sections into React components: `<Hero/>`, `<Ticker/>`, `<Triad/>`, `<ChainOfCustody/>`, `<Benchmarks/>`, `<Adapters/>`, `<Compare/>`, `<Install/>`, `<Outro/>`, `<SiteHeader/>`, `<SiteFooter/>`.
- [ ] Move all `<style>` content into either CSS Modules per-component or a single `homepage.css` imported in the layout. Tokens to `:root`.
- [ ] Lift inline scripts into hooks: `useScrollReveal`, `useCountUp`, `useHashDrift`, `useResonanceTick`, plus per-canvas hooks.
- [ ] Verify Google Fonts are loaded in `app/layout.tsx` `<head>` (Instrument Serif, Geist, JetBrains Mono).
- [ ] Make sure the `data-screen-label` attributes are preserved on the rendered `<section>` elements.
- [ ] Add `prefers-reduced-motion` guards: skip the gossamer sweep, atmosphere drift, hash drift, and canvas animations when the user opts out.
- [ ] Lighthouse / a11y pass: hero `<h1>` is already the page heading; sections have proper landmarks; all interactive elements have visible focus states (extend `nav a::after` + `.btn` focus rings using `--aurora-2`).
