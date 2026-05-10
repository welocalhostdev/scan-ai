# ScanAI — Security Memo PDF Generation Prompt

> Drop this prompt verbatim into your PDF generation codebase.  
> The reference design is an A4 portrait "security memo" — editorial, warm, and opinionated.  
> Do not default to a corporate report aesthetic. Match the reference exactly.

---

## ROLE

You are generating a **ScanAI Security Memo** — a publication-quality, single-target attack surface report  
delivered as an A4 portrait PDF. The tone is a senior security analyst writing directly to a founder or  
CTO, not a compliance officer writing for an audit trail. Every word and visual choice should reflect that.

---

## DESIGN LANGUAGE (reference-exact)

### Canvas
- **Page size:** A4 portrait, 595.28 × 841.89 pt
- **Background:** warm cream `#F2EDE6` — applied full-bleed on every page
- **Margins:** 40pt left/right, 42pt top, 36pt bottom
- **Gutter between two-column layouts:** 20pt

### Color tokens
```
CREAM_BG      = #F2EDE6   ← page background, never white
CREAM_CARD    = #FDFAF6   ← floating card fill (slightly lighter than bg)
CREAM_DARK    = #1A1612   ← near-black for dark cards and cover text overlays
ORANGE        = #E8521A   ← primary accent: badges, bullets, highlights, dots
ORANGE_LIGHT  = #F5C4A8   ← tint for severity halos, decorative circles
ORANGE_MUTED  = #C4622A   ← medium severity badge fill
AMBER         = #D4860A   ← medium severity alternate
BLUE_VIZ      = #3B6FD4   ← chart third color only
TEXT_PRIMARY  = #1A1612   ← headings and body on light bg
TEXT_SECONDARY= #6B5F54   ← captions, labels, metadata
TEXT_ONCARD   = #2C2318   ← body text inside cards
WHITE         = #FFFFFF   ← text on dark cards and dark badges
```

### Typography — this is the most important part of the design
The reference mixes three styles deliberately. Implement all three:

| Role | Font | Size | Weight | Style | Color |
|---|---|---|---|---|---|
| Hero headline (cover, spread openers) | Helvetica-Bold | 44–52pt | Black/900 | Normal | `TEXT_PRIMARY` |
| Hero headline italic accent word | Georgia or Times-Italic | 44–52pt | Regular | Italic | `TEXT_PRIMARY` |
| Section label (e.g. `01 EXPOSURE STORY`) | Helvetica-Bold | 8pt | Bold | Uppercase, tracked +200 | `ORANGE` |
| Card label (e.g. `EXECUTIVE READOUT`) | Helvetica | 7pt | Regular | Uppercase, tracked +150 | `TEXT_SECONDARY` |
| KPI number (large stat) | Helvetica-Bold | 36–40pt | Black | Normal | `TEXT_PRIMARY` or `ORANGE` |
| KPI italic suffix (e.g. `/100`, `real`) | Georgia-Italic | 36–40pt | Regular | Italic | `TEXT_PRIMARY` |
| Body copy | Helvetica | 9.5pt | Regular | Normal, leading 14pt | `TEXT_ONCARD` |
| Remediation step | Helvetica | 9pt | Regular | Normal | `TEXT_ONCARD` |
| Code / evidence block | Courier | 7.5pt | Regular | Normal, leading 11pt | `TEXT_ONCARD` |
| Footer line | Helvetica | 6.5pt | Regular | Uppercase, tracked +100 | `TEXT_SECONDARY` |
| Pill / badge label | Helvetica-Bold | 7pt | Bold | Uppercase, tracked +80 | depends on severity |

**Critical rule:** The hero headline on every spread opener uses a mixed-font treatment.  
Some words are in bold sans (Helvetica-Bold), certain key words break into italic serif (Georgia-Italic).  
This is not optional decoration — it is the primary visual identity of the design.  
Example: `"Findings should read like` *`evidence,`* `not filler."`  
Implement this by splitting the Paragraph into inline runs with different font tags.

---

## PAGE STRUCTURE

The PDF has exactly **4 spreads** in this order. Each spread = one full page.

---

### Spread 01 — Cover / Attack Surface Memo

**Purpose:** First impression. Hook the reader. Show the grade immediately.

**Layout:**
- Top bar (32pt tall): logo text `scanai` left (orange dot prefix `●`, 10pt Helvetica-Bold),  
  nav pills center (`Summary · Visuals · Findings`, 7pt, pill-shaped outlines), domain pill right  
  (`Security Memo · example.com`, 7pt, outlined pill)
- **Decorative bleed element:** Large overlapping circle composition, top-right corner.  
  Draw 3–4 concentric/overlapping circles in `ORANGE`, `ORANGE_LIGHT`, and a warm dark tone.  
  These bleed partially off the right and top edges. They are purely decorative, behind all text.
- **Left column (text zone, x: 28–220pt):**
  - Orange dot + label: `● PUBLIC ATTACK SURFACE MEMO` (8pt, bold, `ORANGE`, tracked)
  - Hero headline: 4-line bold sans, approx 48pt, `TEXT_PRIMARY`  
    e.g. `"What an attacker would notice first."`  
    — the word `would` or key verb switches to Georgia-Italic at same size
  - Body paragraph below: 9.5pt, `TEXT_SECONDARY`, 2–3 lines max
- **Right column (floating cards, x: 230–362pt):**  
  Three vertically stacked white floating cards with soft drop shadow and rounded corners (rx=12):
  1. **EXPOSURE GRADE card** — label `EXPOSURE GRADE` (7pt caps), then `68/100` in mixed fonts  
     (number bold, `/100` italic serif), then 2-line descriptor
  2. **PRIMARY THREAT PATH card** — label + 2–3 line body
  3. **VERIFICATION card** — label + large stat with italic suffix (e.g. `2 real`), then 2-line body
- **Bottom KPI bar** (last 130pt of page):  
  White rounded card, full-width minus margins.  
  4 equal columns separated by subtle vertical dividers:
  - Col 1: `02` (36pt bold) + `VERIFIED FINDINGS` (7pt label, 2 lines, tracked)
  - Col 2: `01` + `HIGH-SEVERITY ITEM`
  - Col 3: `05` + `EXPOSURE SIGNALS REVIEWED`
  - Col 4: `72` (orange) + italic serif `H` (as unit) + `SUGGESTED REMEDIATION WINDOW`
- **Footer:** `SCANAI · SECURITY MEMO · A4 PORTRAIT` left, `01` right — both 6.5pt uppercase, `TEXT_SECONDARY`

---

### Spread 02 — Exposure Story (Executive Summary)

**Purpose:** Give the reader the full picture in one page. Two cards side by side.

**Layout:**
- Top bar: logo left, `● 01 EXPOSURE STORY` section label center (`ORANGE`), date pill right
- **Hero headline:** Mixed-weight, 2 lines  
  e.g. `"The report in one` *`page.`*`"`  
  Body paragraph below: 2 lines, 9.5pt
- Small pill tag top-right of body: `Owner-facing summary` (outlined pill, 7pt)
- **Two-column card zone (below headline, occupies ~60% of page height):**
  - **Left card** (white, rx=12, soft shadow):  
    - Label: `EXECUTIVE READOUT` (7pt caps, `TEXT_SECONDARY`)  
    - Pull quote: 3–4 lines, large bold sans + italic serif mix (~16pt), `TEXT_PRIMARY`  
      e.g. `"This is a contained risk profile with one` *`urgent`* `transport issue..."`
    - Body paragraph: 9pt
    - Numbered remediation steps (3 items): each step has a black circle badge with white number  
      (18pt circle, `CREAM_DARK` fill, `WHITE` text), then 2-line step text beside it
  - **Right card** (dark `CREAM_DARK` fill, white text, rx=12):  
    - Label: `RISK LENS` (7pt caps, `WHITE` at 60% opacity)  
    - Donut chart: centered in card, `ORANGE` fill for exposed portion, dark for remainder,  
      center label `68` (28pt bold white) + `RISK INDEX` (7pt, white muted)
    - 3 metric rows below chart, separated by thin dividers:  
      Each row: bold label (`Exposure quality`, `Exploit effort`, `Business posture`)  
      + 2–3 line descriptor in regular weight, both in white
- **Footer:** `SCANAI · ANALYSIS SPREAD` left, `02` right

---

### Spread 03 — Evidence Visuals (Charts)

**Purpose:** Turn raw scanner numbers into owner-readable visuals. Every chart must carry a decision.

**Layout:**
- Top bar: logo, `● 02 EVIDENCE VISUALS`, date pill
- **Hero headline:** `"Security picture at a` *`glance.`*`"`
- Body line + `Graph-first layout` pill tag (outlined, light fill)
- **4-panel chart grid:**

  **Row 1 — two cards side by side:**
  - **Left: FINDINGS BY SEVERITY** (white card, rx=12)  
    - Label `FINDINGS BY SEVERITY` (7pt caps)
    - Bar chart: 4 bars (Critical, High, Medium, Low)  
      Colors: `#B03030` (critical), `ORANGE` (high), `AMBER` (medium), `ORANGE_LIGHT` (low)  
      Bars have rounded tops. Values labeled above bars.  
      x-axis labels: `CRITICAL · HIGH · MEDIUM · LOW` in 7pt caps
    - Italic caption below: plain-English interpretation of the chart
  - **Right: FINDING MIX** (white card, rx=12)  
    - Label `FINDING MIX`  
    - Donut chart: 3 segments (`ORANGE`, `AMBER`, `BLUE_VIZ`)  
    - Legend below: colored dot + category name + percentage, right-aligned bold %

  **Row 2 — two cards side by side:**
  - **Left: ATTACK SURFACE INVENTORY** (white card)  
    - Bar chart: 4 bars (Hosts, Ports, Pages, TLS)  
      Alternating `CREAM_DARK` and `ORANGE` fills  
    - Italic caption below
  - **Right column (stacked 2 cards):**
    - **MOST EXPOSED ASSETS** (dark `CREAM_DARK` card):  
      3 asset rows, each: monospace URL left, finding count badge right  
      (small pill, `ORANGE` fill, white text)  
      Rows separated by subtle dark dividers
    - **OWNER NOTE** (white card):  
      Label `OWNER NOTE` (7pt caps)  
      Pull quote in large bold sans + italic serif mix (~14pt)  
      Body explanation below (9pt)

- **Footer:** `SCANAI · VISUAL SPREAD` left, `03` right

---

### Spread 04 — Detailed Findings

**Purpose:** Evidence-grade individual findings. Each finding reads like a mini brief, not a form.

**Layout:**
- Top bar: logo, `● 03 DETAILED FINDINGS`, context pill
- **Hero headline:** `"Findings should read like` *`evidence,`* `not filler."`
- Body + `High-confidence narrative` pill tag (orange outline, orange text)
- **Finding cards (one per finding, stacked vertically):**

  **High-severity finding card — split layout (two columns, rx=12):**
  - Left half (white/cream):
    - Severity badge at top: `HIGH SEVERITY` pill, `CREAM_DARK` fill, `WHITE` text, 7pt bold caps
    - Finding title: 3–4 lines, ~18pt bold sans, `TEXT_PRIMARY`
    - Body description: 9pt, `TEXT_SECONDARY`
    - Metadata pills row: `Category · TLS`, `Affected · example.com:443`, `Confidence · verified`  
      (outlined pills, small, 7pt)
    - Evidence block: rounded rect with `#EDE8E0` fill, label `OBSERVED EVIDENCE` (7pt caps, muted),  
      monospace body text, 7.5pt Courier, `TEXT_ONCARD`
  - Right half (`CREAM_DARK` fill, white text):
    - Numbered steps (1, 2, 3): dark circle badges, white number, step text in white 9pt
    - Each step separated by a thin white divider at 20% opacity

  **Medium-severity finding card — split layout:**
  - Left half (white/cream):
    - Severity badge: `MEDIUM SEVERITY`, `AMBER` fill, `WHITE` text
    - Finding title: bold, ~18pt
    - Body, evidence block (same pattern as above)
  - Right half (white/cream — lighter treatment than high):
    - Label `RECOMMENDED OWNER MOVE`
    - Callout headline: large bold sans + italic serif mix (~16pt)
    - Body explanation
    - Action pills: `Add HSTS`, `Add CSP`, `Verify on key routes`  
      (outlined pills, `ORANGE` border + text)

- **Footer:** `SCANAI · FINDINGS SPREAD` left, `04` right

---

## FLOATING CARD SPEC

Every card in this design follows the same rules. Never deviate:

```
background:    CREAM_CARD (#FDFAF6) for light cards, CREAM_DARK (#1A1612) for dark
border-radius: 12pt (rx=12 in canvas terms)
shadow:        simulate with a soft offset rect behind: fill #C8BFB0, opacity 0.4,
               offset (2pt, 3pt), same rx — draw this BEFORE the card rect
padding:       16pt all sides minimum
border:        none — cards float on the cream background, no stroke needed
```

Dark cards (`CREAM_DARK`):
- All text white
- Labels at 60% white opacity
- Dividers at 15% white opacity
- No shadow needed (dark on cream has natural contrast)

---

## DECORATIVE ELEMENTS

### Cover circles (top-right bleed)
Draw a composition of overlapping circles that bleeds off the top-right corner.  
Exact spec: 3 circles minimum:
- Large (r≈150pt): center at ~(340, 180), fill `ORANGE`, opacity 0.85
- Medium (r≈100pt): center at ~(290, 100), fill `ORANGE_LIGHT`, opacity 0.9
- Small inner (r≈60pt): center at ~(320, 190), fill `#C44010`, opacity 0.7

These sit behind ALL text content (z-order: draw first).  
They do NOT appear on any other spread.

### Background geometric ghost circle
On spreads 01 and 03, draw a very large circle (r≈200pt) centered right of page,  
fill none, stroke `ORANGE_LIGHT`, stroke-width 0.5pt, opacity 0.3.  
This is the subtle ring visible in the reference background.

### Orange dot bullets
Every section label and callout label is prefixed with `●` in `ORANGE`.  
Implement as a separate inline Paragraph run, not a unicode character styled differently.

---

## DONUT CHART SPEC

Implement in canvas (not ReportLab graphics charts — canvas gives more control):

```python
def draw_donut(canvas, cx, cy, outer_r, inner_r, segments):
    """
    segments: list of (angle_degrees, hex_color)
    Draws clockwise from 12 o'clock.
    Center label drawn separately after.
    """
```

- Outer radius: 52pt, inner radius (hole): 32pt
- Segment gaps: 2pt visual gap between segments (draw slightly less than full angle)
- No legend inside the chart — legend is a separate text block below

---

## BAR CHART SPEC

Implement in canvas:

```python
def draw_bar_chart(canvas, x, y, width, height, bars):
    """
    bars: list of (label, value, hex_color)
    Rounded tops only (not rounded bottoms — bars sit on a baseline).
    Value label floated above each bar.
    """
```

- Bar width: equal spacing, ~30% of column width per bar
- Rounded top: draw rect + semicircle at top, same fill
- Value label: 8pt bold, centered above bar, `TEXT_PRIMARY`
- Axis label: 7pt, centered below bar, tracked uppercase, `TEXT_SECONDARY`
- No y-axis line, no gridlines — the bars speak for themselves

---

## EVIDENCE BLOCK SPEC

```python
def draw_evidence_block(canvas, x, y, width, text_lines):
    """
    Rounded rect, fill #EDE8E0, rx=8.
    Label 'OBSERVED EVIDENCE' in 7pt Helvetica uppercase, TEXT_SECONDARY.
    Body in Courier 7.5pt, leading 11pt, TEXT_ONCARD.
    """
```

---

## NUMBERED STEP SPEC

```python
def draw_numbered_step(canvas, x, y, number, text, on_dark=False):
    """
    Circle badge: r=9pt, fill CREAM_DARK (or WHITE if on_dark).
    Number inside: 8pt Helvetica-Bold, WHITE (or CREAM_DARK if on_dark).
    Step text: 9pt Helvetica, leading 13pt, starts 22pt right of circle center.
    """
```

---

## PILL / BADGE SPEC

```python
def draw_pill(canvas, x, y, label, style):
    """
    style options:
      'severity-high'   → fill CREAM_DARK, text WHITE
      'severity-medium' → fill AMBER, text WHITE
      'severity-low'    → fill #4A8A3C, text WHITE
      'metadata'        → fill none, stroke TEXT_SECONDARY 0.5pt, text TEXT_SECONDARY
      'action'          → fill none, stroke ORANGE 0.8pt, text ORANGE
      'context'         → fill CREAM_CARD, stroke none, text TEXT_SECONDARY
    Padding: 6pt horizontal, 3pt vertical.
    rx: half of height (true pill shape).
    Font: 7pt Helvetica-Bold, tracked +80, uppercase.
    """
```

---

## FOOTER SPEC

Every page has an identical footer at y=18pt from bottom:
- Left: `SCANAI · [SPREAD NAME]` — 6.5pt Helvetica, uppercase, `TEXT_SECONDARY`
- Right: page number (`01`, `02`, etc.) — same style
- A hairline rule above footer: full page width, 0.3pt, `TEXT_SECONDARY` at 25% opacity

---

## DATA CONTRACT

The generator function must accept this exact structure:

```python
def generate_security_memo(scan_data: dict, output_path: str) -> None:
    """
    scan_data = {
      "meta": {
        "domain": str,           # e.g. "example.com"
        "generated_date": str,   # e.g. "May 05, 2026"
        "exposure_grade": int,   # 0–100
        "grade_descriptor": str, # e.g. "Not catastrophic, but loose enough..."
        "primary_threat_path": str,
        "verified_count": int,
        "high_severity_count": int,
        "signals_reviewed": int,
        "remediation_window": str  # e.g. "72H"
      },
      "executive_summary": {
        "pull_quote": str,
        "body": str,
        "steps": list[str],      # exactly 3 items
        "risk_index": int,
        "risk_lens": {
          "exposure_quality": str,
          "exploit_effort": str,
          "business_posture": str
        }
      },
      "visuals": {
        "severity_counts": {"critical": int, "high": int, "medium": int, "low": int},
        "finding_mix": [          # for donut
          {"label": str, "pct": float, "color": str}
        ],
        "surface_inventory": {    # for bar chart
          "hosts": int, "ports": int, "pages": int, "tls": int
        },
        "most_exposed": [         # list of assets
          {"url": str, "descriptor": str, "count": int}
        ],
        "owner_note": str
      },
      "findings": [
        {
          "severity": str,        # "high" | "medium" | "low" | "critical"
          "title": str,
          "body": str,
          "category": str,
          "affected": str,
          "confidence": str,
          "evidence_text": str,   # raw monospace evidence
          "steps": list[str],     # remediation steps
          "recommended_move": str # optional callout headline
        }
      ]
    }
    """
```

---

## IMPLEMENTATION ORDER

Build and test in this sequence. Do not move to the next step until the current one renders correctly:

1. Set up page canvas (A4 portrait, cream background, footer frame)
2. Implement all primitive drawers: `draw_pill`, `draw_card_bg`, `draw_donut`, `draw_bar_chart`, `draw_evidence_block`, `draw_numbered_step`
3. Build Spread 01 (cover) with hardcoded placeholder data
4. Build Spread 02 (executive summary)
5. Build Spread 03 (visuals) — this is the most complex spread
6. Build Spread 04 (findings) — iterate per finding in `scan_data["findings"]`
7. Wire all spreads to `scan_data` dict
8. Final pass: check spacing, typography mixing, and shadow offsets on all 4 spreads

---

## QUALITY CHECKLIST

Before shipping any output, verify every item:

- [ ] Page size is exactly A4 portrait — not letter, not landscape
- [ ] Background cream `#F2EDE6` applied full-bleed on every page
- [ ] Hero headlines use mixed bold-sans + italic-serif treatment on all 4 spreads
- [ ] Cover circles bleed off top-right corner, appear on cover only
- [ ] All 3 floating cards on cover have soft shadow offset
- [ ] KPI bar at bottom of cover has 4 equal columns with dividers
- [ ] Donut chart renders as a true donut (hollow center), not a pie
- [ ] Bar charts have rounded tops only, no rounded bottoms
- [ ] Evidence blocks use Courier font, rounded rect with `#EDE8E0` fill
- [ ] Numbered steps use circle badges, not plain numbers
- [ ] Dark cards (`CREAM_DARK`) have white text throughout
- [ ] No card bleeds into adjacent card — 12pt minimum gap between cards
- [ ] Footer appears on every page, same position, same style
- [ ] Page numbers are `01`, `02`, `03`, `04` — zero-padded, right-aligned
- [ ] Print-ready A4 margins are applied consistently
- [ ] Section labels are orange, tracked, uppercase — not the same style as body text
- [ ] Mixed-font headline treatment is never replaced with a single-font fallback

---

*This is not a compliance report. It is a security memo. The design should feel like something a founder  
would want to share — not file away. Every visual decision should serve that goal.*
