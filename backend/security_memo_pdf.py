"""
ScanAI Security Memo PDF generator.

Revamped for robust layout safety:
- Strict A4 portrait output for print-ready reports
- Strict text measurement + wrapping with ellipsis
- Conservative typography and spacing
- Cleaner chart geometry
- Dynamic page count for findings
"""

from __future__ import annotations

from typing import Iterable

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, portrait
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen.canvas import Canvas

PAGE_SIZE = portrait(A4)
PAGE_W, PAGE_H = PAGE_SIZE
MARGIN_X = 40
MARGIN_TOP = 42
MARGIN_BOTTOM = 36
GUTTER = 20

PAGE_BG = HexColor("#FFFFFF")
CARD_BG = HexColor("#FFFFFF")
CARD_MUTED = HexColor("#F6F7F4")
INK = HexColor("#080909")
INK_SOFT = HexColor("#151819")
TEAL = HexColor("#4FA5B6")
TEAL_DARK = HexColor("#123F4D")
ORANGE = HexColor("#EF5A2A")
ORANGE_LIGHT = HexColor("#FFE7DC")
AMBER = HexColor("#D4860A")
BLUE_VIZ = TEAL
BORDER = HexColor("#D7D8D4")
GRID = HexColor("#ECEDEA")
TEXT_PRIMARY = HexColor("#090909")
TEXT_SECONDARY = HexColor("#666B68")
WHITE = HexColor("#FFFFFF")

# Backward-compatible aliases used by the older drawing helpers below.
CREAM_BG = PAGE_BG
CREAM_CARD = CARD_BG
CREAM_DARK = INK

FONT_SANS = "Helvetica"
FONT_SANS_BOLD = "Helvetica-Bold"
FONT_SERIF_ITALIC = "Helvetica-Bold"
FONT_CODE = "Courier"


def _alpha(color: Color, a: float) -> Color:
    return Color(color.red, color.green, color.blue, alpha=a)


def _mix(a: Color, b: Color, t: float) -> Color:
    t = max(0.0, min(1.0, t))
    return Color(
        a.red + (b.red - a.red) * t,
        a.green + (b.green - a.green) * t,
        a.blue + (b.blue - a.blue) * t,
    )


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except Exception:
        return default


def _full_bg(c: Canvas) -> None:
    c.saveState()
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setStrokeColor(_alpha(GRID, 0.72))
    c.setLineWidth(0.35)
    for x in range(0, int(PAGE_W) + 1, 39):
        c.line(x, 0, x, PAGE_H)
    for y in range(82, int(PAGE_H), 82):
        c.line(0, y, PAGE_W, y)
    c.restoreState()


def _landing_gradient_bg(c: Canvas) -> None:
    c.saveState()
    c.setFillColor(INK)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    bands = 24
    band_w = PAGE_W / bands
    for i in range(bands):
        t = i / max(1, bands - 1)
        if t < 0.44:
            col = _mix(TEAL_DARK, INK, t / 0.44)
        else:
            col = _mix(INK, ORANGE, (t - 0.44) / 0.56)
        c.setFillColor(_alpha(col, 0.92))
        c.rect(i * band_w, 0, band_w + 1, PAGE_H, stroke=0, fill=1)
    c.setFillColor(_alpha(INK, 0.44))
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setStrokeColor(_alpha(WHITE, 0.12))
    c.setLineWidth(0.45)
    for x in range(0, int(PAGE_W) + 1, 39):
        c.line(x, 0, x, PAGE_H)
    for y in range(86, int(PAGE_H), 86):
        c.line(0, y, PAGE_W, y)
    c.setFillColor(_alpha(INK, 0.54))
    c.rect(0, 0, PAGE_W, 270, stroke=0, fill=1)
    c.restoreState()


def _text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def _wrap(text: str, font: str, size: float, max_w: float, max_lines: int) -> list[str]:
    words = (text or "").replace("\n", " ").split()
    if not words:
        return []
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        # Handle pathological single-word overflow (e.g., huge URL/token).
        if not cur and _text_width(w, font, size) > max_w:
            w = _fit(w, font, size, max_w)
        probe = (" ".join(cur + [w])).strip()
        if _text_width(probe, font, size) <= max_w or not cur:
            cur.append(w)
        else:
            lines.append(" ".join(cur))
            cur = [w]
        if len(lines) >= max_lines:
            break
    if cur and len(lines) < max_lines:
        lines.append(" ".join(cur))
    if len(lines) == max_lines and len(words) > sum(len(line.split()) for line in lines):
        last = lines[-1]
        while last and _text_width(last + "…", font, size) > max_w:
            last = last[:-1]
        lines[-1] = (last.rstrip() + "…") if last else "…"
    # Final safety: ensure every produced line fits.
    lines = [_fit(line, font, size, max_w) for line in lines]
    return lines


def _draw_lines(c: Canvas, x: float, y: float, lines: Iterable[str], font: str, size: float, leading: float, color: Color) -> float:
    c.saveState()
    c.setFont(font, size)
    c.setFillColor(color)
    used = 0.0
    for i, line in enumerate(lines):
        c.drawString(x, y - i * leading, line)
        used = (i + 1) * leading
    c.restoreState()
    return used


def _tracked(c: Canvas, x: float, y: float, text: str, font: str, size: float, color: Color, track: float) -> None:
    c.saveState()
    c.setFillColor(color)
    c.setFont(font, size)
    cx = x
    for ch in (text or "").upper():
        c.drawString(cx, y, ch)
        cx += _text_width(ch, font, size) + track
    c.restoreState()


def _card(c: Canvas, x: float, y: float, w: float, h: float, dark: bool = False, shadow: bool = True, radius: float = 4) -> None:
    c.saveState()
    c.setFillColor(INK_SOFT if dark else CARD_BG)
    c.setStrokeColor(_alpha(WHITE, 0.16) if dark else BORDER)
    c.setLineWidth(0.65)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)
    c.restoreState()


def _fit(text: str, font: str, size: float, max_w: float) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    if _text_width(text, font, size) <= max_w:
        return text
    # Always leave room for ellipsis.
    ell = "…"
    if _text_width(ell, font, size) > max_w:
        return ""
    out = text
    while out and _text_width(out + ell, font, size) > max_w:
        out = out[:-1]
    return out.rstrip() + ell


def _pill(c: Canvas, x: float, y: float, label: str, kind: str, *, max_w: float | None = None) -> float:
    font, size = FONT_SANS_BOLD, 7
    text = (label or "").upper()
    if max_w is not None:
        # Keep pill inside bounds; account for padding.
        text = _fit(text, font, size, max(0.0, max_w - 12))
    tw = _text_width(text, font, size)
    h = 13
    w = tw + 12
    rx = 2
    fill = None
    stroke = _alpha(TEXT_SECONDARY, 0.55)
    color = TEXT_SECONDARY
    lw = 0.5
    if kind == "high":
        fill, stroke, color, lw = INK, None, WHITE, 0
    elif kind == "medium":
        fill, stroke, color, lw = ORANGE, None, WHITE, 0
    elif kind == "action":
        stroke, color, lw = ORANGE, ORANGE, 0.8
    elif kind == "context":
        fill, stroke, color, lw = CARD_MUTED, None, TEXT_SECONDARY, 0
    c.saveState()
    if fill is not None:
        c.setFillColor(fill)
        c.roundRect(x, y, w, h, rx, stroke=0, fill=1)
    if stroke is not None and lw > 0:
        c.setStrokeColor(stroke)
        c.setLineWidth(lw)
        c.roundRect(x, y, w, h, rx, stroke=1, fill=0)
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x + 6, y + 3, text)
    c.restoreState()
    return w


def _footer(c: Canvas, label: str, page_no: int) -> None:
    y = 18
    c.saveState()
    c.setStrokeColor(_alpha(TEXT_PRIMARY, 0.16))
    c.setLineWidth(0.3)
    c.line(0, y + 10, PAGE_W, y + 10)
    c.setFillColor(TEXT_SECONDARY)
    c.setFont(FONT_SANS, 6.5)
    c.drawString(MARGIN_X, y, f"SCANAI | {label}".upper())
    pn = f"{page_no:02d}"
    c.drawString(PAGE_W - MARGIN_X - _text_width(pn, FONT_SANS, 6.5), y, pn)
    c.restoreState()


def _topbar(c: Canvas, center_label: str, right_label: str, cover: bool = False) -> None:
    c.saveState()
    c.setFillColor(INK)
    c.rect(0, PAGE_H - 68, PAGE_W, 68, stroke=0, fill=1)
    c.setStrokeColor(_alpha(WHITE, 0.16))
    c.setLineWidth(0.5)
    c.line(0, PAGE_H - 68, PAGE_W, PAGE_H - 68)
    c.restoreState()
    y = PAGE_H - 43
    c.saveState()
    c.setFillColor(WHITE)
    c.rect(MARGIN_X, y - 2, 8, 8, stroke=0, fill=1)
    c.setStrokeColor(INK)
    c.setLineWidth(1.3)
    c.line(MARGIN_X + 2, y - 1, MARGIN_X + 6, y + 7)
    c.line(MARGIN_X + 5, y - 1, MARGIN_X + 9, y + 7)
    c.setFont(FONT_SANS_BOLD, 10)
    c.setFillColor(WHITE)
    c.drawString(MARGIN_X + 12, y, "ScanAI")
    if cover:
        nav = "Summary  Visuals  Findings"
        nw = _text_width(nav, FONT_SANS, 7)
        nx = PAGE_W / 2 - (nw + 16) / 2
        c.setStrokeColor(_alpha(WHITE, 0.16))
        c.setFillColor(_alpha(WHITE, 0.04))
        c.roundRect(nx, y - 5, nw + 16, 16, 2, stroke=1, fill=1)
        c.setFillColor(_alpha(WHITE, 0.76))
        c.setFont(FONT_SANS, 7)
        c.drawString(nx + 8, y + 1, nav)
    else:
        _tracked(c, PAGE_W / 2 - 74, y, center_label, FONT_SANS_BOLD, 7.4, _alpha(WHITE, 0.7), 0.8)
    rw = _text_width(right_label, FONT_SANS, 7)
    rx = PAGE_W - MARGIN_X - rw - 16
    c.setFillColor(WHITE)
    c.roundRect(rx, y - 5, rw + 16, 17, 1, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont(FONT_SANS, 7)
    c.drawString(rx + 8, y + 1, right_label)
    c.restoreState()


def _headline(c: Canvas, x: float, y: float, l1: str, l2: str, size: float = 34) -> None:
    c.saveState()
    c.setFillColor(TEXT_PRIMARY)
    c.setFont(FONT_SANS_BOLD, size)
    c.drawString(x, y, l1)
    c.setFont(FONT_SANS_BOLD, size)
    c.drawString(x, y - (size + 2), l2)
    c.restoreState()

def _headline_wrapped(
    c: Canvas,
    x: float,
    y: float,
    max_w: float,
    l1: str,
    l2: str,
    *,
    size: float = 34,
    leading: float | None = None,
    l1_lines: int = 2,
    l2_lines: int = 2,
) -> float:
    """
    Draw a mixed-font headline that never exceeds max_w.
    Returns total height used.
    """
    leading = leading or (size + 2)
    h = 0.0
    l1w = _wrap(l1, FONT_SANS_BOLD, size, max_w, l1_lines)
    h += _draw_lines(c, x, y, l1w, FONT_SANS_BOLD, size, leading, TEXT_PRIMARY)
    l2w = _wrap(l2, FONT_SANS_BOLD, size, max_w, l2_lines)
    h += _draw_lines(c, x, y - h, l2w, FONT_SANS_BOLD, size, leading, TEXT_PRIMARY)
    return h


def _draw_donut(c: Canvas, cx: float, cy: float, r_out: float, r_in: float, segments: list[tuple[float, Color]], hole_color: Color) -> None:
    c.saveState()
    start = 90.0
    for angle, color in segments:
        sweep = max(0.0, angle - 1.5)
        if sweep <= 0:
            continue
        c.setFillColor(color)
        c.wedge(cx - r_out, cy - r_out, cx + r_out, cy + r_out, start, start - sweep, stroke=0, fill=1)
        start -= angle
    c.setFillColor(hole_color)
    c.circle(cx, cy, r_in, stroke=0, fill=1)
    c.restoreState()


def _draw_bar_chart(c: Canvas, x: float, y: float, w: float, h: float, bars: list[tuple[str, int, Color]]) -> None:
    c.saveState()
    vmax = max([v for _, v, _ in bars] + [1])
    cols = len(bars)
    col_w = w / max(cols, 1)
    bar_w = col_w * 0.52
    for i, (label, value, color) in enumerate(bars):
        value = max(0, int(value))
        bh = (value / vmax) * (h - 24)
        bx = x + i * col_w + (col_w - bar_w) / 2
        by = y + 16
        r = min(6, bar_w / 2)
        c.setFillColor(color)
        c.rect(bx, by, bar_w, max(0, bh - r), stroke=0, fill=1)
        c.roundRect(bx, by + max(0, bh - r), bar_w, r, r, stroke=0, fill=1)
        val = str(value)
        c.setFillColor(TEXT_PRIMARY)
        c.setFont(FONT_SANS_BOLD, 8)
        c.drawString(bx + bar_w / 2 - _text_width(val, FONT_SANS_BOLD, 8) / 2, by + bh + 3, val)
        _tracked(c, bx + bar_w / 2 - _text_width(label.upper(), FONT_SANS_BOLD, 7) / 2, y, label, FONT_SANS_BOLD, 7, TEXT_SECONDARY, 0.6)
    c.restoreState()


def _cover(c: Canvas, scan_data: dict) -> None:
    meta = scan_data.get("meta", {}) if isinstance(scan_data.get("meta"), dict) else {}
    domain = str(meta.get("domain") or "example.com")
    grade = max(0, min(100, _safe_int(meta.get("exposure_grade"), 68)))
    descriptor = str(meta.get("grade_descriptor") or "Moderate exposure profile with actionable cleanup.")
    path = str(meta.get("primary_threat_path") or "Transport + browser hardening gaps.")
    verified = _safe_int(meta.get("verified_count"), 2)
    high = _safe_int(meta.get("high_severity_count"), 1)
    signals = _safe_int(meta.get("signals_reviewed"), 5)
    window = str(meta.get("remediation_window") or "72H")

    _landing_gradient_bg(c)
    _topbar(c, "", f"Report | {domain}", cover=True)

    c.saveState()
    _tracked(c, MARGIN_X, PAGE_H - 112, "Public attack surface report", FONT_SANS_BOLD, 7.5, _alpha(WHITE, 0.72), 0.9)
    title_y = PAGE_H - 160
    title_lines = _wrap("Attack surface report.", FONT_SANS_BOLD, 43, PAGE_W - 2 * MARGIN_X, 2)
    title_h = _draw_lines(c, MARGIN_X, title_y, title_lines, FONT_SANS_BOLD, 43, 45, WHITE)
    subtitle_lines = _wrap("Evidence that ships.", FONT_SANS_BOLD, 43, PAGE_W - 2 * MARGIN_X, 2)
    subtitle_h = _draw_lines(c, MARGIN_X, title_y - title_h, subtitle_lines, FONT_SANS_BOLD, 43, 45, WHITE)
    body_y = title_y - title_h - subtitle_h - 22
    _draw_lines(
        c,
        MARGIN_X,
        body_y,
        _wrap(
            f"A concise B2B security readout for {domain}: externally visible risk, verified evidence, and owner-ready remediation.",
            FONT_SANS,
            10,
            PAGE_W - 2 * MARGIN_X,
            4,
        ),
        FONT_SANS,
        10,
        15,
        _alpha(WHITE, 0.82),
    )

    # Landing-style certificate grid.
    gx, gy, gw, gh = MARGIN_X + 118, 272, PAGE_W - MARGIN_X * 2 - 118, 176
    c.setStrokeColor(_alpha(WHITE, 0.15))
    c.setLineWidth(0.55)
    for col in range(4):
        for row in range(3):
            c.rect(gx + col * (gw / 4), gy + row * (gh / 3), gw / 4, gh / 3, stroke=1, fill=0)
    grid_items = [("TLS", 0, 2), ("API", 2, 2), ("CVE", 1, 1), ("AUTH", 3, 1), ("CSP", 2, 0)]
    c.setFont(FONT_SANS_BOLD, 8)
    for label, col, row in grid_items:
        tx = gx + col * (gw / 4) + 10
        ty = gy + row * (gh / 3) + 21
        c.setFillColor(_alpha(WHITE, 0.72))
        c.drawString(tx, ty, label)

    # Three sharp readout cards echo the landing page report preview.
    card_y = 148
    card_h = 72
    card_w = (PAGE_W - 2 * MARGIN_X - 18) / 3
    readouts = [
        (f"{grade}", "risk score", ORANGE),
        (f"{verified}", "verified", WHITE),
        (window, "fix window", TEAL),
    ]
    for i, (value, label, color) in enumerate(readouts):
        x = MARGIN_X + i * (card_w + 9)
        c.setFillColor(_alpha(WHITE, 0.07))
        c.setStrokeColor(_alpha(WHITE, 0.18))
        c.setLineWidth(0.7)
        c.roundRect(x, card_y, card_w, card_h, 2, stroke=1, fill=1)
        c.setFillColor(color)
        c.setFont(FONT_SANS_BOLD, 24)
        c.drawString(x + 12, card_y + 35, _fit(value, FONT_SANS_BOLD, 24, card_w - 24))
        _tracked(c, x + 12, card_y + 15, label, FONT_SANS_BOLD, 6.2, _alpha(WHITE, 0.58), 0.5)

    detail_y = 82
    c.setStrokeColor(_alpha(WHITE, 0.18))
    c.setLineWidth(0.6)
    c.line(MARGIN_X, detail_y + 34, PAGE_W - MARGIN_X, detail_y + 34)
    _draw_lines(c, MARGIN_X, detail_y + 20, _wrap(descriptor, FONT_SANS, 8.2, 150, 2), FONT_SANS, 8.2, 11, _alpha(WHITE, 0.7))
    _draw_lines(c, MARGIN_X + 174, detail_y + 20, _wrap(path, FONT_SANS, 8.2, 160, 2), FONT_SANS, 8.2, 11, _alpha(WHITE, 0.7))
    c.restoreState()
    _footer(c, "ScanAI security report", 1)


def _summary(c: Canvas, scan_data: dict) -> None:
    meta = scan_data.get("meta", {}) if isinstance(scan_data.get("meta"), dict) else {}
    ex = scan_data.get("executive_summary", {}) if isinstance(scan_data.get("executive_summary"), dict) else {}
    date = str(meta.get("generated_date") or "May 05, 2026")
    quote = str(ex.get("pull_quote") or "Contained risk profile with one urgent transport issue.")
    body = str(ex.get("body") or "The scan surfaced preventable gaps that are easy for external scanners to keep probing.")
    steps = ex.get("steps") if isinstance(ex.get("steps"), list) else []
    steps = [str(s).strip() for s in steps if str(s).strip()][:3]
    while len(steps) < 3:
        steps.append("Re-run validation after remediation.")
    risk = max(0, min(100, _safe_int(ex.get("risk_index"), _safe_int(meta.get("exposure_grade"), 68))))
    lens = ex.get("risk_lens", {}) if isinstance(ex.get("risk_lens"), dict) else {}

    _full_bg(c)
    _topbar(c, "01 exposure story", f"Generated | {date}")
    title_top_y = PAGE_H - MARGIN_TOP - 70
    title_h = _headline_wrapped(
        c,
        MARGIN_X,
        title_top_y,
        PAGE_W - 2 * MARGIN_X - 110,
        "The report in one",
        "page.",
        size=32,
        l1_lines=2,
        l2_lines=1,
    )
    summary_top_y = title_top_y - title_h - 14
    summary_h = _draw_lines(
        c,
        MARGIN_X,
        summary_top_y,
        _wrap(body, FONT_SANS, 9, PAGE_W - 2 * MARGIN_X - 118, 4),
        FONT_SANS,
        9,
        13,
        TEXT_SECONDARY,
    )
    _pill(c, PAGE_W - MARGIN_X - 120, summary_top_y - summary_h - 10, "Owner-facing summary", "context")

    left_w = (PAGE_W - 2 * MARGIN_X - GUTTER) / 2
    right_w = left_w
    y = summary_top_y - summary_h - 42 - 388
    h = 388
    lx = MARGIN_X
    rx = lx + left_w + GUTTER
    _card(c, lx, y, left_w, h)
    _tracked(c, lx + 14, y + h - 22, "Executive readout", FONT_SANS, 7, TEXT_SECONDARY, 0.8)
    _draw_lines(c, lx + 14, y + h - 44, _wrap(f'"{quote}"', FONT_SANS_BOLD, 14, left_w - 28, 3), FONT_SANS_BOLD, 14, 16, TEXT_PRIMARY)
    _draw_lines(c, lx + 14, y + h - 112, _wrap(body, FONT_SANS, 8.5, left_w - 28, 4), FONT_SANS, 8.5, 12, TEXT_SECONDARY)
    sy = y + 32
    for i, step in enumerate(steps, 1):
        cy = sy + (3 - i) * 50
        c.setFillColor(CREAM_DARK)
        c.circle(lx + 22, cy + 8, 8, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_SANS_BOLD, 8)
        c.drawString(lx + 20, cy + 5, str(i))
        _draw_lines(c, lx + 38, cy + 10, _wrap(step, FONT_SANS, 8.5, left_w - 52, 2), FONT_SANS, 8.5, 11, TEXT_PRIMARY)

    _card(c, rx, y, right_w, h, dark=True, shadow=False)
    _tracked(c, rx + 14, y + h - 22, "Risk lens", FONT_SANS, 7, _alpha(WHITE, 0.6), 0.8)
    donut_cx, donut_cy = rx + right_w / 2, y + h - 118
    ang = (risk / 100) * 360
    _draw_donut(c, donut_cx, donut_cy, 50, 30, [(ang, ORANGE), (360 - ang, _alpha(WHITE, 0.12))], CREAM_DARK)
    c.setFillColor(WHITE)
    c.setFont(FONT_SANS_BOLD, 24)
    rv = str(risk)
    c.drawString(donut_cx - _text_width(rv, FONT_SANS_BOLD, 24) / 2, donut_cy - 8, rv)
    _tracked(c, donut_cx - 28, donut_cy - 28, "Risk index", FONT_SANS, 7, _alpha(WHITE, 0.6), 0.7)
    rows = [
        ("Exposure quality", str(lens.get("exposure_quality") or "Externally visible and repeatable.")),
        ("Exploit effort", str(lens.get("exploit_effort") or "Low effort for commodity scanners.")),
        ("Business posture", str(lens.get("business_posture") or "Owner action is needed in the next cycle.")),
    ]
    ry = y + h - 220
    for i, (k, v) in enumerate(rows):
        yy = ry - i * 60
        if i:
            c.setStrokeColor(_alpha(WHITE, 0.16))
            c.setLineWidth(0.5)
            c.line(rx + 14, yy + 54, rx + right_w - 14, yy + 54)
        c.setFillColor(WHITE)
        c.setFont(FONT_SANS_BOLD, 9)
        c.drawString(rx + 14, yy + 36, k)
        _draw_lines(c, rx + 14, yy + 22, _wrap(v, FONT_SANS, 8.2, right_w - 28, 2), FONT_SANS, 8.2, 11, _alpha(WHITE, 0.82))
    _footer(c, "Analysis spread", 2)


def _visuals(c: Canvas, scan_data: dict) -> None:
    meta = scan_data.get("meta", {}) if isinstance(scan_data.get("meta"), dict) else {}
    v = scan_data.get("visuals", {}) if isinstance(scan_data.get("visuals"), dict) else {}
    date = str(meta.get("generated_date") or "May 05, 2026")
    _full_bg(c)
    c.saveState()
    c.setStrokeColor(_alpha(ORANGE_LIGHT, 0.32))
    c.setLineWidth(0.5)
    c.circle(PAGE_W + 34, PAGE_H / 2 + 12, 196, stroke=1, fill=0)
    c.restoreState()
    _topbar(c, "02 evidence visuals", date)
    _headline(c, MARGIN_X, PAGE_H - MARGIN_TOP - 70, "Security picture at a", "glance.", size=32)
    _draw_lines(
        c,
        MARGIN_X,
        PAGE_H - MARGIN_TOP - 136,
        _wrap("Graph-first summary of severity, mix, and surface inventory.", FONT_SANS, 9, PAGE_W - 2 * MARGIN_X - 110, 3),
        FONT_SANS,
        9,
        13,
        TEXT_SECONDARY,
    )
    _pill(c, PAGE_W - MARGIN_X - 102, PAGE_H - MARGIN_TOP - 144, "Graph-first layout", "context")

    left_w = (PAGE_W - 2 * MARGIN_X - GUTTER) / 2
    right_w = left_w
    top_y = PAGE_H - MARGIN_TOP - 406
    h1 = 250
    h2 = 244
    lx = MARGIN_X
    rx = lx + left_w + GUTTER

    sev = v.get("severity_counts", {}) if isinstance(v.get("severity_counts"), dict) else {}
    _card(c, lx, top_y, left_w, h1)
    _tracked(c, lx + 14, top_y + h1 - 22, "Findings by severity", FONT_SANS, 7, TEXT_SECONDARY, 0.8)
    _draw_bar_chart(
        c,
        lx + 10,
        top_y + 34,
        left_w - 20,
        146,
        [
            ("Critical", _safe_int(sev.get("critical"), 0), HexColor("#B03030")),
            ("High", _safe_int(sev.get("high"), 0), ORANGE),
            ("Medium", _safe_int(sev.get("medium"), 0), AMBER),
            ("Low", _safe_int(sev.get("low"), 0), ORANGE_LIGHT),
        ],
    )
    _draw_lines(c, lx + 14, top_y + 14, _wrap("Severity shape shows owner priority at a glance.", FONT_SANS, 8, left_w - 28, 2), FONT_SANS, 8, 10, TEXT_SECONDARY)

    mix = v.get("finding_mix", []) if isinstance(v.get("finding_mix"), list) else []
    mix = [m for m in mix if isinstance(m, dict)]
    if not mix:
        mix = [
            {"label": "Transport", "pct": 50.0, "color": "#E8521A"},
            {"label": "Headers", "pct": 30.0, "color": "#D4860A"},
            {"label": "Surface", "pct": 20.0, "color": "#3B6FD4"},
        ]
    total = sum(float(m.get("pct") or 0.0) for m in mix) or 1.0
    segs = []
    for item in mix[:3]:
        segs.append(((float(item.get("pct") or 0.0) / total) * 360, HexColor(str(item.get("color") or "#E8521A"))))
    _card(c, rx, top_y, right_w, h1)
    _tracked(c, rx + 14, top_y + h1 - 22, "Finding mix", FONT_SANS, 7, TEXT_SECONDARY, 0.8)
    cx, cy = rx + right_w / 2, top_y + 132
    _draw_donut(c, cx, cy, 50, 30, segs, CREAM_CARD)
    for i, item in enumerate(mix[:3]):
        yy = top_y + 30 + (2 - i) * 14
        col = HexColor(str(item.get("color") or "#E8521A"))
        c.setFillColor(col)
        c.circle(rx + 16, yy + 4, 3, stroke=0, fill=1)
        c.setFillColor(TEXT_SECONDARY)
        c.setFont(FONT_SANS, 8)
        c.drawString(rx + 24, yy, str(item.get("label") or "Category")[:18])
        pct = f"{float(item.get('pct') or 0):.0f}%"
        c.setFillColor(TEXT_PRIMARY)
        c.setFont(FONT_SANS_BOLD, 8)
        c.drawString(rx + right_w - 14 - _text_width(pct, FONT_SANS_BOLD, 8), yy, pct)

    by = top_y - 14 - h2
    _card(c, lx, by, left_w, h2)
    _tracked(c, lx + 14, by + h2 - 22, "Attack surface inventory", FONT_SANS, 7, TEXT_SECONDARY, 0.8)
    inv = v.get("surface_inventory", {}) if isinstance(v.get("surface_inventory"), dict) else {}
    _draw_bar_chart(
        c,
        lx + 10,
        by + 48,
        left_w - 20,
        128,
        [
            ("Hosts", _safe_int(inv.get("hosts"), 0), CREAM_DARK),
            ("Ports", _safe_int(inv.get("ports"), 0), ORANGE),
            ("Pages", _safe_int(inv.get("pages"), 0), CREAM_DARK),
            ("TLS", _safe_int(inv.get("tls"), 0), ORANGE),
        ],
    )
    _draw_lines(c, lx + 14, by + 16, _wrap("Surface inventory shows breadth versus concentration.", FONT_SANS, 8, left_w - 28, 2), FONT_SANS, 8, 10, TEXT_SECONDARY)

    dark_h = 136
    note_h = h2 - dark_h - 14
    dy = by + h2 - dark_h
    _card(c, rx, dy, right_w, dark_h, dark=True, shadow=False)
    _tracked(c, rx + 14, dy + dark_h - 22, "Most exposed assets", FONT_SANS, 7, _alpha(WHITE, 0.6), 0.8)
    assets = v.get("most_exposed", []) if isinstance(v.get("most_exposed"), list) else []
    assets = [a for a in assets if isinstance(a, dict)][:3]
    if not assets:
        assets = [{"url": "https://example.com", "count": 2}]
    for i, item in enumerate(assets[:3]):
        yy = dy + dark_h - 46 - i * 30
        if i:
            c.setStrokeColor(_alpha(WHITE, 0.16))
            c.setLineWidth(0.4)
            c.line(rx + 14, yy + 16, rx + right_w - 14, yy + 16)
        c.setFillColor(_alpha(WHITE, 0.9))
        c.setFont(FONT_CODE, 7.4)
        c.drawString(rx + 14, yy + 6, str(item.get("url") or "")[:30])
        badge = str(_safe_int(item.get("count"), 0))
        bw = _text_width(badge, FONT_SANS_BOLD, 7) + 10
        bx = rx + right_w - 14 - bw
        c.setFillColor(ORANGE)
        c.roundRect(bx, yy + 1, bw, 12, 6, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_SANS_BOLD, 7)
        c.drawString(bx + 5, yy + 4, badge)

    ny = by
    _card(c, rx, ny, right_w, note_h)
    _tracked(c, rx + 14, ny + note_h - 22, "Owner note", FONT_SANS, 7, TEXT_SECONDARY, 0.8)
    note = str(v.get("owner_note") or "Keep each chart tied to a decision.")
    _draw_lines(c, rx + 14, ny + note_h - 44, _wrap('"Keep each chart tied to a decision."', FONT_SANS_BOLD, 12, right_w - 28, 2), FONT_SANS_BOLD, 12, 14, TEXT_PRIMARY)
    # Clamp note lines to available height so it never bleeds below the card.
    available_lines = max(1, int((note_h - 92) / 12))
    _draw_lines(c, rx + 14, ny + note_h - 78, _wrap(note, FONT_SANS, 8.5, right_w - 28, min(available_lines, 4)), FONT_SANS, 8.5, 12, TEXT_SECONDARY)
    _footer(c, "Visual spread", 3)


def _finding_card_height(c: Canvas, finding: dict, width: float) -> float:
    pad = 14
    title = _wrap(str(finding.get("title") or "Untitled"), FONT_SANS_BOLD, 12.5, width - pad * 2, 2)
    body = _wrap(str(finding.get("body") or ""), FONT_SANS, 8.5, width - pad * 2, 4)
    steps = finding.get("steps") if isinstance(finding.get("steps"), list) else []
    steps = [str(s).strip() for s in steps if str(s).strip()][:3]
    # Match the actual drawing layout conservatively so cards paginate before
    # they can spill below the page bottom.
    pill_block = 28
    title_block = len(title) * 14
    title_gap = 8
    body_block = len(body) * 11
    body_gap = 18
    meta_pill_row = 18
    evidence_block = 48
    evidence_gap = 14
    steps_block = max(1, len(steps)) * 18
    bottom_padding = 24
    return (
        pill_block
        + title_block
        + title_gap
        + body_block
        + body_gap
        + meta_pill_row
        + evidence_block
        + evidence_gap
        + steps_block
        + bottom_padding
    )


def _draw_finding_card(c: Canvas, x: float, y: float, w: float, h: float, finding: dict) -> None:
    pad = 14
    _card(c, x, y, w, h)
    sev = str(finding.get("severity") or "low").lower()
    _pill(
        c,
        x + pad,
        y + h - 22,
        f"{sev.upper()} SEVERITY",
        "high" if sev in {"critical", "high"} else ("medium" if sev == "medium" else "context"),
        max_w=w - pad * 2,
    )

    ty = y + h - 42
    title = _wrap(str(finding.get("title") or "Untitled finding"), FONT_SANS_BOLD, 12.5, w - pad * 2, 2)
    _draw_lines(c, x + pad, ty, title, FONT_SANS_BOLD, 12.5, 14, TEXT_PRIMARY)
    by = ty - len(title) * 14 - 4
    body = _wrap(str(finding.get("body") or ""), FONT_SANS, 8.5, w - pad * 2, 4)
    _draw_lines(c, x + pad, by, body, FONT_SANS, 8.5, 11, TEXT_SECONDARY)

    my = by - len(body) * 11 - 10
    mx = x + pad
    for label in (
        f"Category / {finding.get('category') or 'Other'}",
        f"Affected / {finding.get('affected') or 'Unknown'}",
        f"Confidence / {finding.get('confidence') or 'unknown'}",
    ):
        pw = _pill(c, mx, my, label, "context", max_w=(x + w - pad) - mx)
        mx += pw + 5
        if mx > x + w - 80:
            break

    ev_y = my - 42
    c.saveState()
    c.setFillColor(CARD_MUTED)
    c.roundRect(x + pad, ev_y, w - 2 * pad, 36, 8, stroke=0, fill=1)
    _tracked(c, x + pad + 8, ev_y + 24, "Observed evidence", FONT_SANS, 7, TEXT_SECONDARY, 0.6)
    c.setFillColor(TEXT_PRIMARY)
    c.setFont(FONT_CODE, 7.2)
    ev = " ".join((str(finding.get("evidence_text") or "No evidence provided.").replace("\n", " ").split()))
    ev_line = _wrap(ev, FONT_CODE, 7.2, w - 2 * pad - 16, 1)
    c.drawString(x + pad + 8, ev_y + 10, ev_line[0] if ev_line else "")
    c.restoreState()

    steps = finding.get("steps") if isinstance(finding.get("steps"), list) else []
    steps = [str(s).strip() for s in steps if str(s).strip()][:3]
    if not steps:
        steps = ["Review and remediate, then re-scan for closure."]
    sy = y + 14
    for i, step in enumerate(steps[:3], 1):
        yy = sy + (len(steps[:3]) - i) * 18
        c.setFillColor(CREAM_DARK)
        c.circle(x + pad + 7, yy + 6, 6.5, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_SANS_BOLD, 7)
        c.drawString(x + pad + 5.2, yy + 3.6, str(i))
        _draw_lines(
            c,
            x + pad + 16,
            yy + 8,
            _wrap(step, FONT_SANS, 8.2, w - pad * 2 - 24, 1),
            FONT_SANS,
            8.2,
            10,
            TEXT_PRIMARY,
        )


def _findings_pages(c: Canvas, scan_data: dict, start_page_no: int) -> int:
    meta = scan_data.get("meta", {}) if isinstance(scan_data.get("meta"), dict) else {}
    domain = str(meta.get("domain") or "example.com")
    findings = scan_data.get("findings", []) if isinstance(scan_data.get("findings"), list) else []
    findings = [f for f in findings if isinstance(f, dict)]
    if not findings:
        findings = [{
            "severity": "low",
            "title": "No major externally verified findings in this run.",
            "body": "Continue routine monitoring and re-run after meaningful infrastructure or application changes.",
            "category": "General",
            "affected": domain,
            "confidence": "verified",
            "evidence_text": "No high-confidence finding records supplied.",
            "steps": ["Keep baseline scans scheduled.", "Re-run after major releases."],
        }]

    page_no = start_page_no
    idx = 0
    while idx < len(findings):
        _full_bg(c)
        _topbar(c, "03 detailed findings", f"Security Report | {domain}")
        headline_top = PAGE_H - MARGIN_TOP - 70
        headline_h = _headline_wrapped(
            c,
            MARGIN_X,
            headline_top,
            PAGE_W - 2 * MARGIN_X,
            "Verified findings.",
            "Ready for remediation.",
            size=28,
            l1_lines=1,
            l2_lines=2,
        )
        summary_y = headline_top - headline_h - 10
        _draw_lines(
            c,
            MARGIN_X,
            summary_y,
            _wrap("Each item is compact, evidence-first, and bounded for clean review handoff.", FONT_SANS, 8.8, PAGE_W - 2 * MARGIN_X - 126, 2),
            FONT_SANS,
            8.8,
            12,
            TEXT_SECONDARY,
        )
        _pill(c, PAGE_W - MARGIN_X - 126, summary_y - 4, "High-confidence narrative", "action")

        content_top = summary_y - 42
        content_bottom = MARGIN_BOTTOM + 26
        cursor_y = content_top
        card_w = PAGE_W - 2 * MARGIN_X
        gap = 12
        while idx < len(findings):
            fh = _finding_card_height(c, findings[idx], card_w)
            if cursor_y - fh < content_bottom:
                break
            _draw_finding_card(c, MARGIN_X, cursor_y - fh, card_w, fh, findings[idx])
            cursor_y -= fh + gap
            idx += 1

        _footer(c, "Findings spread", page_no)
        page_no += 1
        c.showPage()
    return page_no


def generate_security_memo(scan_data: dict, output_path: str) -> None:
    c = Canvas(output_path, pagesize=(PAGE_W, PAGE_H))
    meta = scan_data.get("meta", {}) if isinstance(scan_data.get("meta"), dict) else {}
    domain = str(meta.get("domain") or "security scan").strip() or "security scan"
    c.setTitle(f"ScanAI Security Report - {domain}")
    c.setAuthor("ScanAI")
    c.setSubject(f"Security assessment report for {domain}")
    c.setCreator("ScanAI")
    _cover(c, scan_data)
    c.showPage()
    _summary(c, scan_data)
    c.showPage()
    _visuals(c, scan_data)
    c.showPage()
    _findings_pages(c, scan_data, start_page_no=4)
    c.save()
