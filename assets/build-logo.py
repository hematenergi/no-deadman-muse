#!/usr/bin/env python3
"""
NoDeadman Muse — logo generator (Minji, 13 Nov 2026).
Deterministic: same inputs -> same outputs. No network, no AI generation.

Concept: ONE unbroken stroke. A run's baseline goes flat, spikes once
(the heartbeat), and the spike's fall lands exactly in the valley of a
checkmark whose long arm finishes high: the pulse, watched to a verified
end. No death imagery; the line never breaks and never flatlines.

Outputs (this folder):
  mark.svg / mark.png (1024)          - pulse-check mark, transparent
  lockup-light.svg / .png (>=1600w)   - ink wordmark, for light backgrounds
  lockup-dark.svg  / .png (>=1600w)   - white wordmark, for dark backgrounds
  proof-sheet.png                     - verification board (not for install)
"""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------- tokens ----------
GREEN_CANDIDATES = ["#22C55E", "#16A34A", "#1FA855", "#2FBF71"]
INK = "#11181D"        # wordmark on light
PAPER = "#FFFFFF"      # wordmark on dark
GH_DARK = "#0D1117"    # GitHub dark background (proof surface)

def lum(rgb):
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def contrast(h1, h2):
    l1, l2 = lum(hx(h1)), lum(hx(h2))
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

print("== green candidates: contrast on white / on GitHub dark ==")
for g in GREEN_CANDIDATES:
    print(f"  {g}: white {contrast(g, '#FFFFFF'):.2f}:1 | dark {contrast(g, GH_DARK):.2f}:1")
GREEN = "#16A34A"  # deepest candidate: strongest on white (3.30) while 5.74 on dark
assert contrast(GREEN, "#FFFFFF") >= 3.0 and contrast(GREEN, GH_DARK) >= 3.0, "green fails"
print(f"GREEN locked: {GREEN} (white {contrast(GREEN,'#FFFFFF'):.2f}, dark {contrast(GREEN,GH_DARK):.2f})")
print(f"INK on white: {contrast(INK, '#FFFFFF'):.2f}:1 | PAPER on dark: {contrast(PAPER, GH_DARK):.2f}:1")

# ---------- mark geometry (grid 0..100) ----------
STROKE = 11.5
POINTS = [(8, 57), (28, 57), (39, 30), (50, 68), (92, 26)]
pts_str = " ".join(f"{x},{y}" for x, y in POINTS)

def mark_svg(color, vb_pad=0):
    return (f'<polyline points="{pts_str}" fill="none" stroke="{color}" '
            f'stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round"/>')

# standalone mark svg
mark_svg_doc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
                f'{mark_svg(GREEN)}</svg>')
open(os.path.join(OUT, "mark.svg"), "w").write(mark_svg_doc)

# ---------- wordmark via fontTools glyph paths ----------
F_MED = os.path.expanduser("~/.fonts/inter/Inter-SemiBold.ttf")
F_XBD = os.path.expanduser("~/.fonts/inter/Inter-ExtraBold.ttf")

def word_paths(font_path, text, size, tracking=-0.015):
    """Return (svg_path_d_list, total_advance) in units where em = size."""
    font = TTFont(font_path)
    upem = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / upem
    paths, x = [], 0.0
    for ch in text:
        gname = cmap[ord(ch)]
        glyph = gs[gname]
        pen = SVGPathPen(gs)
        glyph.draw(pen)
        d = pen.getCommands()
        if d:
            paths.append((d, x))
        x += glyph.width * scale * (1 + tracking)
    return paths, x

EM = 120.0  # wordmark em size in lockup units
TRK = -0.015
p1, w1 = word_paths(F_MED, "NoDeadman", EM, TRK)
p2, w2 = word_paths(F_XBD, "Muse", EM, TRK)
_, wsp = word_paths(F_MED, " ", EM, TRK)

MARK_BOX = 200.0     # lockup: mark occupies 200x200 (grid x2)
GAP = 34.0
TX = MARK_BOX + GAP
BASELINE = 138.0     # text baseline y in lockup units (mark content centre ~ (58+132)/2=95 vs cap centre)
TOTAL_W = TX + w1 + wsp + w2
TOTAL_H = 200.0

def glyph_group(paths, x0, color):
    parts = []
    for d, gx in paths:
        parts.append(f'<path d="{d}" transform="translate({x0 + gx:.2f},{BASELINE}) scale(1,-1)" fill="{color}"/>')
    return "".join(parts)

def lockup_svg(text_color):
    inner = (f'<g transform="translate(0,0) scale(2,2)">{mark_svg(GREEN)}</g>'
             + glyph_group(p1, TX, text_color)
             + glyph_group(p2, TX + w1 + wsp, GREEN))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TOTAL_W:.0f} {TOTAL_H:.0f}">'
            f'{inner}</svg>')

open(os.path.join(OUT, "lockup-light.svg"), "w").write(lockup_svg(INK))
open(os.path.join(OUT, "lockup-dark.svg"), "w").write(lockup_svg(PAPER))
print(f"lockup viewBox: {TOTAL_W:.0f} x {TOTAL_H:.0f}")

# ---------- PNG rendering via PIL (mirrors the SVG layout) ----------
def draw_mark(draw, ox, oy, scale, color, stroke_units=STROKE):
    pts = [(ox + x * scale, oy + y * scale) for x, y in POINTS]
    w = stroke_units * scale
    draw.line(pts, fill=color, width=int(round(w)), joint="curve")
    r = w / 2
    for (x, y) in (pts[0], pts[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)

def render_mark_png(path, px=1024):
    im = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    draw_mark(d, 0, 0, px / 100.0, hx(GREEN) + (255,))
    im.save(path)

render_mark_png(os.path.join(OUT, "mark.png"))

def render_lockup_png(path, text_color, target_w=2200):
    s = target_w / TOTAL_W
    W, H = int(target_w), int(TOTAL_H * s)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    draw_mark(d, 0, 0, 2 * s, hx(GREEN) + (255,))
    f1 = ImageFont.truetype(F_MED, int(EM * s))
    f2 = ImageFont.truetype(F_XBD, int(EM * s))
    # PIL text origin is top-of-em box; convert baseline: y_top = BASELINE*s - ascent
    asc1, _ = f1.getmetrics()
    y_top = BASELINE * s - asc1
    d.text((TX * s, y_top), "NoDeadman", font=f1, fill=hx(text_color) + (255,))
    # advance for word1 measured with PIL to place word2 (tracking ignored in PNG, negligible)
    w1_px = d.textlength("NoDeadman ", font=f1)
    d.text((TX * s + w1_px, y_top), "Muse", font=f2, fill=hx(GREEN) + (255,))
    im.save(path)

render_lockup_png(os.path.join(OUT, "lockup-light.png"), INK)
render_lockup_png(os.path.join(OUT, "lockup-dark.png"), PAPER)

# ---------- proof sheet ----------
def paste_fit(base, img, box):
    x, y, w, h = box
    r = min(w / img.width, h / img.height)
    ni = img.resize((int(img.width * r), int(img.height * r)), Image.LANCZOS)
    base.paste(ni, (int(x + (w - ni.width) / 2), int(y + (h - ni.height) / 2)), ni)

sheet = Image.new("RGB", (1500, 1120), (255, 255, 255))
sd = ImageDraw.Draw(sheet)
ll = Image.open(os.path.join(OUT, "lockup-light.png"))
ld = Image.open(os.path.join(OUT, "lockup-dark.png"))
mk = Image.open(os.path.join(OUT, "mark.png"))
f_lab = ImageFont.truetype(F_MED, 26)
# top: lockups (light left on white, dark right on GH dark panel)
sd.rectangle([750, 0, 1500, 400], fill=hx(GH_DARK))
paste_fit(sheet, ll, (30, 70, 690, 300))
paste_fit(sheet, ld, (780, 70, 690, 300))
sd.text((40, 20), "LOCKUP - light bg (ink)", font=f_lab, fill=hx(INK))
sd.text((790, 20), "LOCKUP - dark bg (white)", font=f_lab, fill=hx(PAPER))
# bottom: mark sizes, light row then dark row (panel drawn BEFORE pasting)
sd.rectangle([0, 760, 1500, 1120], fill=hx(GH_DARK))
sd.text((40, 420), "MARK 256 / 64 / 32 / 16 - light", font=f_lab, fill=hx(INK))
sd.text((40, 770), "MARK 256 / 64 / 32 / 16 - dark", font=f_lab, fill=hx(PAPER))
for row, y in enumerate([460, 820]):
    x = 40
    for sz in [256, 64, 32, 16]:
        m = mk.resize((sz, sz), Image.LANCZOS)
        sheet.paste(m, (x, y + (256 - sz)), m)
        x += sz + 60
sheet.save(os.path.join(OUT, "proof-sheet.png"))
print("done:", sorted(os.listdir(OUT)))
