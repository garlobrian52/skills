# Apple FY2025: Environmental Progress Presentation

Board-ready 8-slide deck showing how **Apple 2030** supports premium brand positioning, enterprise deals, and supply chain risk mitigation.

This directory is a **static presentation**, not part of the `@cubic-plugin/cubic-plugin` CLI. It is omitted from `package.json` `files`, so `npm publish` does not ship it.

## Architecture

Two independent artifacts share the same narrative. There is no shared data file and no build step that keeps them in sync.

| Artifact | Source of truth | Runtime |
|----------|-----------------|--------|
| Interactive HTML deck | `index.html` + `styles.css` + `deck.js` | Any modern browser. No bundler, no network calls. |
| PowerPoint export | `generate_pptx.py` | Python 3 + `python-pptx`. Writes `Apple_FY2025_Environmental_Progress.pptx` next to the script. |

`deck.js` is an IIFE that queries `.slide` sections, tracks `current` / `notesVisible`, and wires keyboard, pointer, and touch handlers. Slides are shown by toggling `.active` (CSS opacity/visibility); there is **no hash or query deep-link** to a slide index.

The PPTX generator builds a 13.333″ × 7.5″ (16:9) deck on the blank layout (`slide_layouts[6]`). Output path is hardcoded:

```python
OUTPUT = Path(__file__).parent / "Apple_FY2025_Environmental_Progress.pptx"
```

Regenerating overwrites the checked-in binary. Git will not show a useful PPTX diff — review HTML (and the Python slide functions) for content changes.

## Files

| File | Role |
|------|------|
| `index.html` | Eight `<section class="slide">` elements, speaker notes, control bar |
| `styles.css` | Apple-inspired theme, layouts, `@media (max-width: 900px)`, `@media print` |
| `deck.js` | Navigation, notes toggle, fullscreen |
| `generate_pptx.py` | Regenerates the PPTX (one function per slide + `main()`) |
| `Apple_FY2025_Environmental_Progress.pptx` | Prebuilt export — commit after regenerating |

## Slides

| # | Title | HTML layout |
|---|-------|-------------|
| 1 | Title — Environmental Progress as a Business & Sales Driver | Centered title on nature gradient |
| 2 | FY25 Snapshot — Turning Sustainability into Shareholder Value | 2×2 bento grid |
| 3 | De-risking the Business — Progress Toward Total Carbon Neutrality | Split + SVG progress rings (`--progress: 100` / `60`) |
| 4 | Premium Products, Premium Ethics — The "Recycled" Advantage | Split + exploded-device SVG |
| 5 | Operational Efficiency — Stewarding Resources to Protect Margins | Three icon cards |
| 6 | Targeting Emissions Where They Matter to the Customer | Legend + donut (53 / 27 / 16 / 4%) |
| 7 | Funding the Transition — ROI on Environmental Programs | 43M metric tons + $4.7B green bonds |
| 8 | Leveraging FY25 Wins in the Market (Action Plan) | Three-step timeline |

Speaker notes live in each slide’s `<aside class="speaker-notes">` (HTML) and `add_speaker_notes()` (PPTX). The HTML footer on slide 1 is `Confidential | Board of Directors & Sales Leadership Strategy`.

## View the HTML deck

No install is required. Relative `styles.css` / `deck.js` loads work from `file://` and from a local server:

```bash
# From repo root (Linux)
xdg-open presentations/apple-fy2025-environmental/index.html

# Or serve the directory (avoids some browser file:// restrictions)
cd presentations/apple-fy2025-environmental && python3 -m http.server 8080
# Then open http://localhost:8080
```

`html, body { overflow: hidden }` — this is a full-viewport deck, not a scrolling document.

## Controls

Verified against `deck.js`. Navigation clamps to `[0, slides.length - 1]`.

| Input | Action |
|-------|--------|
| `→` / `↓` / `Space` / `PageDown` | Next slide |
| `←` / `↑` / `PageUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `N` | Toggle speaker notes |
| `F` | Toggle fullscreen (`document.documentElement.requestFullscreen`) |
| Prev / Next / Notes / Fullscreen buttons | Same as the matching keys |
| Swipe left / right | Next / previous when horizontal travel exceeds **50px** |

Notes state is **sticky**: once shown, `notesVisible` stays true and the current slide’s notes get `.visible` on every `showSlide`. Fullscreen uses optional chaining; if the Fullscreen API is missing, `F` is a no-op.

Print (`@media print`) hides `.controls` and `.speaker-notes` and forces every `.slide` visible with `page-break-after: always`.

## Export to PowerPoint

`python-pptx` is **not** an npm dependency. Install it in the Python environment you use for this script:

```bash
pip install python-pptx
python3 presentations/apple-fy2025-environmental/generate_pptx.py
# prints: Generated: .../Apple_FY2025_Environmental_Progress.pptx
```

Constraints:

- Widescreen 16:9 only (`SLIDE_W` / `SLIDE_H` in `generate_pptx.py`).
- PPTX charts are simplified stand-ins (ovals instead of SVG rings, a single-color donut instead of the four-segment HTML chart).
- Edit **both** `index.html` and the matching `slide_*` function when copy changes. The two sources can drift — for example slide 3 HTML says “Alliance for Water Stewardship (AWS) Standard” while the PPTX currently says “AWS Standard”.
- After regenerating, commit the `.pptx` so reviewers who do not run Python still get the export.

## Editing checklist

1. Update copy and notes in `index.html`.
2. Mirror titles, stats, and notes in `generate_pptx.py`.
3. Run the generator and commit the new `.pptx`.
4. Spot-check in a browser: all 8 slides, notes toggle (`N`), swipe, and a narrow viewport (`max-width: 900px` stacks split / bento / timeline).

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Unstyled deck or no navigation | `styles.css` or `deck.js` failed to load. Serve the **directory**, not the repo root, or open `index.html` itself so relative URLs resolve. |
| `ModuleNotFoundError: pptx` | `pip install python-pptx` in the same interpreter you invoke (`python3`). |
| PPTX missing a copy change | Dual source of truth — the HTML was edited but `generate_pptx.py` was not (or the script was not re-run). |
| Cannot jump to slide 5 via URL | No hash routing; use keyboard/`End` or the on-screen buttons. |
| Notes do not appear | Press `N` or the Notes button; the panel is off-screen until `.visible` is applied. |
| Fullscreen does nothing | Browser blocked or lacks Fullscreen API; the click handler uses `requestFullscreen?.()`. |

## Audience

Confidential — Board of Directors & Sales Leadership Strategy.
