# Apple FY2025 board & sales PPTX

Eight-slide widescreen PowerPoint for board and sales leadership. It translates Apple 2030 / FY2025 environmental proof points into enterprise sales, premium brand, and supply-chain risk language.

This file is the source of truth for the **sales-driver PPTX**. There is no HTML companion, no `deck.js`, and no generator script in this directory.

## File

```text
deliverables/Apple_FY2025_Environmental_Progress_Business_Sales_Driver.pptx
```

| Property | Value |
| --- | --- |
| Title | Apple FY2025: Environmental Progress as a Business & Sales Driver |
| Creator | Strategy & Sales Leadership |
| Company | Confidential |
| Format | On-screen Show (16:9), 13.333″ × 7.5″ (`sldSz` 12192000 × 6858000 EMU) |
| Application | Microsoft Office PowerPoint 16 |
| Fonts | Arial, Calibri |
| Layouts | `DEFAULT` (title) and `CONTENT` (body), one slide master |
| npm publish | **Not shipped.** `package.json` `files` is `dist/`, `skills/`, `commands/`, `.mcp.json` only |

Audience footer on slides: `CONFIDENTIAL | BOARD OF DIRECTORS & SALES LEADERSHIP STRATEGY`.

## Slide map

| # | On-slide heading | Intent |
| --- | --- | --- |
| 1 | Environmental Progress as a Business & Sales Driver | Title. Growth-vs-emissions framing. Hero image (`ppt/media/image-1-1.png`). |
| 2 | FY25: sustainability is now a shareholder-value lever | Snapshot KPIs: revenue +78% vs 2015, >60% gross emissions cut, 30% recycled/renewable materials, 100% fiber-based packaging, $4.7B green bonds **cumulative**. |
| 3 | De-risking the path to full value-chain carbon neutrality | Corporate footprint vs Scope 3. Two doughnut charts (100% corporate neutrality ring; 60% gross GHG vs 2015). |
| 4 | Premium products, premium ethics: the recycled advantage | Component-qualified recycled cobalt / rare earths / gold+tin; fiber unboxing. |
| 5 | Operational efficiency: stewarding resources to protect margins | 17B gallons saved, 100% final-assembly zero-waste coverage, 55% freshwater replenished. |
| 6 | Targeting emissions where they matter to the customer | Doughnut: manufacturing 53 / product use 27 / transport 16 / other ~4. |
| 7 | Funding the transition: return on environmental programs | 43M tCO₂e avoided estimate; $4.7B green bonds since 2016 (latest 2019). |
| 8 | Leverage FY25 wins in the market | Q3–Q4 action plan: Enterprise / Retail / Marketing plus a board ask for a cross-functional sprint. |

Every slide has a matching notes slide (`ppt/notesSlides/notesSlide1.xml` … `notesSlide8.xml`). Speaker notes include talk track, claim boundaries, and source URLs.

## Architecture

This is a checked-in Office Open XML binary, not a CLI feature.

```text
deliverables/*.pptx          ← edit in PowerPoint / LibreOffice, commit the binary
presentations/apple-fy2025-environmental/
  index.html + styles.css + deck.js + generate_pptx.py
                             ← separate 9-slide HTML deck (see that folder’s README)
```

OOXML layout that operators hit in practice:

- 8 slide parts + 8 notes parts.
- Slide 3 embeds `chart1.xml` and `chart2.xml`; slide 6 embeds `chart3.xml`. Each chart has a matching `ppt/embeddings/Microsoft_Excel_Worksheet*.xlsx`.
- All three charts are doughnut charts. Chart 1 caches `Progress=100` / `Remaining=0.01` so the corporate-neutrality ring draws as full (a `Remaining=0` doughnut often collapses). Chart 2 is `60` / `40`. Chart 3 is `53` / `27` / `16` / `4`.
- Source URLs live in **notes**, not as clickable shapes on the slide canvas:
  - https://www.apple.com/environment/pdf/Apple_Environmental_Progress_Report_2026.pdf
  - https://www.apple.com/newsroom/2026/04/apple-accelerates-progress-with-highest-ever-recycled-material-in-its-products/

## Present / inspect / render

Open in PowerPoint or Keynote (Presenter View for notes), or inspect without Office:

```bash
# Slide + notes counts and 16:9 size (EMU / 914400 = inches)
python3 - <<'PY'
import zipfile, xml.etree.ElementTree as ET
from pathlib import Path
p = Path("deliverables/Apple_FY2025_Environmental_Progress_Business_Sales_Driver.pptx")
z = zipfile.ZipFile(p)
root = ET.fromstring(z.read("ppt/presentation.xml"))
ns = {"p": "http://schemas.openxmlformats.org/presentationml/2006/main"}
sz = root.find("p:sldSz", ns)
print("slides", len(root.find("p:sldIdLst", ns)))
print("notes", sum(1 for n in z.namelist() if n.startswith("ppt/notesSlides/notesSlide")))
print("inches", int(sz.get("cx"))/914400, "x", int(sz.get("cy"))/914400)
PY

# Optional visual pass (if LibreOffice is installed)
soffice --headless --convert-to pdf --outdir /tmp \
  deliverables/Apple_FY2025_Environmental_Progress_Business_Sales_Driver.pptx
```

There is no `npm run` / `node dist/index.js` path for this file. `npm test` does not open it.

## Constraints vs the HTML deck

`presentations/apple-fy2025-environmental/generate_pptx.py` writes **`presentations/apple-fy2025-environmental/Apple_FY2025_Environmental_Progress.pptx`**. It does **not** update this deliverable.

| | This PPTX (`deliverables/`) | HTML deck (`presentations/…`) |
| --- | --- | --- |
| Slides | 8 | 9 (`index.html` includes Merchant Services / iPhone Air) |
| Source of truth | This `.pptx` | `index.html` (+ `styles.css` / `deck.js`); Python export is a second artifact |
| Generator | None | `python3 generate_pptx.py` (`python-pptx` is not an npm dependency) |
| Notes | PowerPoint notes pages | HTML `<aside class="speaker-notes">` |
| Charts | Native OOXML doughnuts + Excel embeddings | CSS/HTML visuals in the browser deck |

Copy will drift. Do not “fix” the HTML deck by overwriting it with this binary, or regenerate this binary from `generate_pptx.py`.

## Claim-governance pitfalls

Speaker notes exist to stop shorthand that overstates Apple’s public reports. Keep these boundaries if you edit slides:

- Corporate carbon neutrality (since 2020, again in 2025) still uses **credits for residual** corporate emissions. Do not say Apple “eliminated direct operational carbon risk.”
- 2030 is a **75% gross reduction before balancing residuals**, not “already carbon-neutral across the value chain.” Slide 3’s >60% figure is vs 2015 gross emissions.
- **$4.7B green bonds are cumulative** (three issuances since 2016; most recent 2019), not an FY2025 issuance, and not proof the whole strategy is self-funded.
- Recycled-content claims are **component-qualified** (Apple-designed batteries / all magnets / Apple-designed PCBs), not “the whole device is 100% recycled minerals.”
- Fiber-based packaging is for packages manufactured today; **inks, coatings, and adhesives are outside** that goal.
- Zero-waste-to-landfill at final assembly follows the cited UL bar (**≥90% diversion other than waste-to-energy**), not literal zero residual waste.
- Slide 6’s **~4% “business ops & other”** groups leftover categories for readability; Apple reports several of those slices as each less than 1%.
- Slide 5 margin language is directional. Notes say quantify internally before presenting realized savings.
- Slide 7 cost-of-capital claims need Treasury analysis; the public report alone does not establish a lower WACC.
- Slide 8 actions are strategy recommendations, not Apple-published mandates.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `generate_pptx.py` “didn’t update the sales deck” | It writes a different filename under `presentations/`. Edit and commit this `.pptx` instead. |
| Missing Merchant Services / iPhone Air slide | That slide is only in the nine-slide HTML deck. This PPTX is eight slides by design. |
| Full-ring chart on slide 3 looks empty after an edit | Chart 1 uses `Remaining=0.01`, not `0`. |
| Notes / sources missing after a re-export | Each slide has a notes part; a “flatten” or screenshot export drops them. |
| npm package missing the deck | Expected. Do not add `deliverables/` to `files` unless you intend to publish a 2.5MB binary. |
| Git diffs are unreadable | Normal for PPTX. Unzip and diff `ppt/slides/slideN.xml` / `ppt/notesSlides/notesSlideN.xml`, or compare a PDF render. |
