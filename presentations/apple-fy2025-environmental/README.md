# Apple FY2025 — Environmental Progress Deck

Board / Executive Sales Leadership strategy presentation: how **Apple 2030** environmental progress supports premium brand positioning, enterprise deals, and supply chain resilience.

This directory is a **static presentation**, not part of the `@cubic-plugin/cubic-plugin` CLI. It is omitted from `package.json` `files`, so `npm publish` does not ship it. There is no CLI command and no Node/TypeScript build for the deck.

## Architecture

A single self-contained file:

| File | Role |
|------|------|
| `index.html` | Markup for 8 slides, inline CSS, inline navigation script |

CSS and JavaScript live in `<style>` / `<script>` inside `index.html`. There is no `styles.css`, `deck.js`, Python exporter, or checked-in `.pptx` on this branch. Do not add a bundler or CLI command unless the code grows one.

The inline script queries `.slide` sections, keeps `index` / `notesOpen`, and wires keyboard, button, and touch handlers. `show(i)` toggles `.active` (CSS opacity / visibility / transform), updates the top progress bar and `#slideCounter`, copies `data-notes` into `#notesText`, and sets `document.title` to `Apple FY2025 — Slide N`. Navigation clamps to `[0, slides.length - 1]`. There is **no hash or query deep-link**.

Fonts load from Google Fonts (`Bricolage Grotesque` + `Figtree`). Everything else is local. Offline / locked-down networks still render with the `sans-serif` fallback.

`html, body { overflow: hidden }` — this is a full-viewport deck, not a scrolling document. `@media (max-width: 860px)` stacks split / bento / chevron layouts and allows vertical scroll on the active slide. There is no `@media print` stylesheet.

## View

No install is required. Opening the file works because assets are inlined:

```bash
# From repo root
npx --yes serve presentations/apple-fy2025-environmental -p 4173
# open http://localhost:4173

# Or any static server from the deck directory
cd presentations/apple-fy2025-environmental && python3 -m http.server 8080
# open http://localhost:8080

# Or open the file directly
open presentations/apple-fy2025-environmental/index.html
```

## Controls

Verified against the inline `<script>` in `index.html`.

| Input | Action |
|-------|--------|
| `→` / `Space` / `PageDown` | Next slide |
| `←` / `PageUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `N` | Toggle speaker notes |
| `F` | Toggle fullscreen (`requestFullscreen` / `exitFullscreen` on `document.documentElement`) |
| Prev / Next / Notes buttons | Same as the matching keys |
| Swipe left / right | Next / previous when horizontal travel exceeds **50px** |

`↑` / `↓` are **not** bound. Space and PageDown call `preventDefault()`, so they will not scroll the notes panel.

Notes state is **sticky**: `notesOpen` survives `show()`. Changing slides refreshes `#notesText` from the new slide’s `data-notes` but does not close the panel. Fullscreen uses optional chaining; if the Fullscreen API is missing, `F` is a no-op. There is no on-screen fullscreen button.

## Slides

| # | Title | Layout |
|---|-------|--------|
| 1 | Environmental Progress as a Business & Sales Driver | Centered title on nature / aluminum atmosphere |
| 2 | FY25 Snapshot — Turning Sustainability into Shareholder Value | 2×2 bento (60% / 30% / 100% / $4.7B) |
| 3 | Progress Toward Total Carbon Neutrality | Split copy + CSS conic progress rings (`--pct: 100` / `60`) |
| 4 | The “Recycled” Advantage | Device callouts + recycled-materials cards |
| 5 | Stewarding Resources to Protect Margins | Three resource icon cards |
| 6 | Targeting Emissions Where They Matter | Donut + legend (53 / 27 / 16 / 4%) |
| 7 | Funding the Transition — ROI | 43M metric tons + $4.7B green-bond graphic |
| 8 | Leveraging FY25 Wins in the Market | Three-step chevron (enterprise / retail / marketing) |

Speaker notes live on each `<section class="slide">` as `data-notes` (not a nested `<aside>`). The chrome footer on every slide is `Confidential \| Board of Directors & Sales Leadership Strategy`.

## Chart entry animations

Rings, the emissions donut, and the funding trendline are keyed to `.slide.active` so they **play on first view and replay when you navigate back** (removing `.active` resets the CSS animation).

| Chart | Selector | Mechanism |
|-------|----------|-----------|
| Carbon rings (slide 3) | `.slide.active .ring` | `@property --ring-pct` + `ringGrow` (1.2s, 0.35s delay). Target fill is `--pct` on the ring. |
| Emissions donut (slide 6) | `.slide.active .donut` | `donutSpinIn` scale/rotate (1.1s). Segment stops are hardcoded in the `conic-gradient`. |
| Funding trendline (slide 7) | `.slide.active .trendline path` | `drawLine` stroke-dashoffset 600 → 0 (1.4s, 0.3s delay). |

Ring fill animation requires CSS `@property` (Chromium, Safari, Firefox 128+). Without it the rings still show `--pct` via the fallback custom property, but they will not count up.

Keep the donut CSS stops and the legend percentages in sync — they are duplicated by hand (53 / 27 / 16 / 4).

## Editing checklist

1. Edit copy, `data-notes`, and metrics in `index.html` only.
2. If a ring value changes, update both the visible text and `--pct`.
3. If emissions mix changes, update both the `.donut` `conic-gradient` stops and the legend.
4. Spot-check in a browser: all 8 slides, notes (`N`) staying open across slides, swipe, `F`, and a narrow viewport (`max-width: 860px`).
5. Revisit slides 3, 6, and 7 to confirm chart entry animations replay.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Cannot jump to slide 5 via URL | No hash routing; use keyboard / `End` or the on-screen buttons. |
| Notes do not appear | Press `N` or **Notes**; the panel stays `visibility: hidden` until `.open`. |
| Notes stay on screen after changing slides | Intended — `notesOpen` is sticky. Press `N` again to hide. |
| `↑` / `↓` do nothing | Only left/right, Space, PageUp/PageDown, Home/End are bound. |
| Fullscreen does nothing | Browser blocked or lacks Fullscreen API (`requestFullscreen?.()`). |
| Rings do not count up | Engine without `@property --ring-pct`; the static fill still uses `--pct`. |
| Charts do not replay on return | `.active` must be removed and re-added. Confirm `show()` toggles `.active` on a single slide. |
| `generate_pptx.py` / `.pptx` missing | This deck has no PowerPoint exporter. Do not look for `deck.js` or `styles.css` either. |
| Fonts look generic offline | Google Fonts failed to load; body falls back to `sans-serif`. |
| Content clipped on a phone | Expected until `max-width: 860px`; then the active slide scrolls vertically. |

## Audience

Confidential — Board of Directors & Sales Leadership Strategy.
