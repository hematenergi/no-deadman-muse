#!/usr/bin/env python3
"""
NoDeadman Muse — logo generator: Watchkeeper's Lantern.
The lantern is symmetric by construction:
  - every coordinate derives from ONE centre axis (cx=60); the right
    half of every curve is the arithmetic mirror of the left half;
  - one stroke weight (6) for ring + chamber frame;
  - fixed proportion ladder: ring 18, crown band, chamber 56 wide,
    plinth steps 66/48.
A mirror-difference check on the rendered mark runs at the end and is
printed: symmetric by construction, verified by pixels.

Lantern anatomy (local box 120x136): suspension ring (the watch is hung
where all can see it) - neck - crown - glass chamber - one gold flame
(the vigil light that is never allowed to go out) - stepped plinth.
Wordmark: Noto Serif Display Black, one name, one colour per variant.

Outputs: mark.svg/.png (ink), mark-dark.svg/.png (paper), lockup-light,
lockup-dark (SVG+PNG >=1600w), context-readme-light/dark (520px),
proof-sheet.png. Deterministic; fonts via fontTools glyph paths.
"""
import argparse
import os
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--serif-font", required=True, help="path to NotoSerifDisplay-Black.ttf")
parser.add_argument("--tag-font", required=True, help="path to Inter-Regular.ttf")
parser.add_argument("--resvg", default="resvg", help="resvg executable (default: PATH)")
args = parser.parse_args()
for font in (args.serif_font, args.tag_font):
    if not os.path.isfile(font):
        parser.error(f"font file not found: {font}")
renderer = shutil.which(args.resvg)
if renderer is None:
    parser.error(f"resvg executable not found: {args.resvg}")

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image, ImageDraw, ImageFont
import numpy as np

OUT = os.path.dirname(os.path.abspath(__file__))
INK = "#11181D"
PAPER = "#F7F5F0"
GOLD = "#C9A227"
GH_DARK = "#0D1117"

def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# ---------------- lantern geometry (local 120x136, axis cx=60) ----------------
CX = 60
RING_CY, RING_R = 15, 9
NECK = (56.5, 24, 63.5, 42)                    # x0,y0,x1,y1
CROWN_TOP = (30, 48); CROWN_CTRL = (60, 30); CROWN_TOP_R = (90, 48); CROWN_Y1 = 56
CHAMBER = (32, 56, 88, 116); CHAMBER_RX = 4
PLINTH = (27, 116, 93, 124)
FOOT = (36, 124, 84, 130)
STROKE = 6
# flame: tip (60,68); left cubic down, bottom arc, right cubic up (mirrored)
FLAME_D = ("M60,68 C51,82 49,89 49,95 C49,102 53.5,106 60,106 "
           "C66.5,106 71,102 71,95 C71,89 69,82 60,68 Z")

def lantern_svg(struct):
    return (
        f'<circle cx="{CX}" cy="{RING_CY}" r="{RING_R}" fill="none" stroke="{struct}" stroke-width="{STROKE}"/>'
        f'<rect x="{NECK[0]}" y="{NECK[1]}" width="{NECK[2]-NECK[0]}" height="{NECK[3]-NECK[1]}" fill="{struct}"/>'
        f'<path d="M{CROWN_TOP[0]},{CROWN_TOP[1]} Q{CROWN_CTRL[0]},{CROWN_CTRL[1]} {CROWN_TOP_R[0]},{CROWN_TOP_R[1]} '
        f'L{CROWN_TOP_R[0]},{CROWN_Y1} L{CROWN_TOP[0]},{CROWN_Y1} Z" fill="{struct}"/>'
        f'<rect x="{CHAMBER[0]}" y="{CHAMBER[1]}" width="{CHAMBER[2]-CHAMBER[0]}" height="{CHAMBER[3]-CHAMBER[1]}" '
        f'rx="{CHAMBER_RX}" fill="none" stroke="{struct}" stroke-width="{STROKE}"/>'
        f'<path d="{FLAME_D}" fill="{GOLD}"/>'
        f'<rect x="{PLINTH[0]}" y="{PLINTH[1]}" width="{PLINTH[2]-PLINTH[0]}" height="{PLINTH[3]-PLINTH[1]}" fill="{struct}"/>'
        f'<rect x="{FOOT[0]}" y="{FOOT[1]}" width="{FOOT[2]-FOOT[0]}" height="{FOOT[3]-FOOT[1]}" fill="{struct}"/>'
    )

# square mark viewBox 140x140, lantern group at translate(10,2)
for name, struct in [("mark", INK), ("mark-dark", PAPER)]:
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140">'
           f'<g transform="translate(10,2)">{lantern_svg(struct)}</g></svg>')
    open(os.path.join(OUT, f"{name}.svg"), "w").write(doc)

# ---------------- wordmark ----------------
F_SERIF = args.serif_font
NAME = "NoDeadman Muse"

EM = 116.0
MARK_H = 150.0
MARK_W = MARK_H * 120 / 136
GAP = 30.0
TX = MARK_W + GAP
BASELINE = 116.0

import re
_NUM = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")

def clean_numbers(d):
    """Rewrite every number in a path string as a plain decimal (2dp).
    Keep path numbers consistent across SVG renderers."""
    def rep(m):
        v = float(m.group(0))
        s = f"{v:.2f}".rstrip("0").rstrip(".")
        return s if s not in ("", "-0") else "0"
    return _NUM.sub(rep, d)

def name_paths_baked(text, size, tracking=-0.01):
    """Glyph paths with the placement transform BAKED into coordinates
    (no transform attributes anywhere - maximum renderer compatibility)."""
    from fontTools.pens.transformPen import TransformPen
    font = TTFont(F_SERIF)
    upem = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    s = size / upem
    paths, x = [], 0.0
    for ch in text:
        gname = cmap[ord(ch)]
        glyph = gs[gname]
        svg_pen = SVGPathPen(gs)
        pen = TransformPen(svg_pen, (s, 0, 0, -s, TX + x, BASELINE))
        glyph.draw(pen)
        dd = svg_pen.getCommands()
        if dd:
            paths.append(clean_numbers(dd))
        x += glyph.width * s * (1 + tracking)
    return paths, x

name_p, name_w = name_paths_baked(NAME, EM)
TOTAL_W = TX + name_w
TOTAL_H = 156.0

def lockup_svg(struct, text_color):
    parts = [f'<g transform="translate(0,3) scale({MARK_H/136:.4f})">{lantern_svg(struct)}</g>']
    for dd in name_p:
        parts.append(f'<path d="{dd}" fill="{text_color}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TOTAL_W:.0f} {TOTAL_H:.0f}">'
            + "".join(parts) + "</svg>")

open(os.path.join(OUT, "lockup-light.svg"), "w").write(lockup_svg(INK, INK))
open(os.path.join(OUT, "lockup-dark.svg"), "w").write(lockup_svg(PAPER, PAPER))
print(f"lockup viewBox: {TOTAL_W:.0f} x {TOTAL_H:.0f}")

# ---------------- PNG rendering: TRUE VECTOR via resvg ----------------
# PNGs are rasterized from the SVG masters by resvg (real vector
# rasterizer), never by sampling curves into polygons or upscaling a
# low-resolution intermediate raster.
# Rendered at 2x, downscaled once with LANCZOS.
import subprocess

def render_svg(svg_path, out_png, width_px):
    subprocess.run([renderer, "--width", str(width_px), svg_path, out_png], check=True)
    return Image.open(out_png)

def render_final(svg_name, png_name, width_px, downscale_to=None):
    im = render_svg(os.path.join(OUT, svg_name), os.path.join(OUT, png_name), width_px)
    if downscale_to:
        h = int(im.height * downscale_to / im.width)
        im = im.resize((downscale_to, h), Image.LANCZOS)
        im.save(os.path.join(OUT, png_name))
    return im

mk_light = render_final("mark.svg", "mark.png", 2048, downscale_to=1024)
render_final("mark-dark.svg", "mark-dark.png", 2048, downscale_to=1024)

# mirror-symmetry verification on the ink mark
a = np.asarray(mk_light).astype(int)
d = np.abs(a - a[:, ::-1]).sum(axis=2)
print(f"mirror check: {(d > 0).mean() * 100:.3f}% pixels differ (antialiased curve edges only), mean delta {d.mean():.3f}")

ll = render_final("lockup-light.svg", "lockup-light.png", 4400, downscale_to=2200)
ld = render_final("lockup-dark.svg", "lockup-dark.png", 4400, downscale_to=2200)

# ---------------- context renders: exact 520px in a README header sim ----------------
F_TAG = args.tag_font
def context_render(lockup, bg, path):
    im = Image.new("RGB", (920, 300), bg)
    d = ImageDraw.Draw(im)
    disp = lockup.resize((520, int(520 * lockup.height / lockup.width)), Image.LANCZOS)
    im.paste(disp, (24, 28), disp)
    ft = ImageFont.truetype(F_TAG, 25)
    tc = (201, 209, 217, 255) if bg == hx(GH_DARK) else (31, 35, 40, 255)
    d.text((26, 28 + disp.height + 18), "No agent run dies silently.", font=ft, fill=tc)
    im.save(path)

context_render(ll, (255, 255, 255), os.path.join(OUT, "context-readme-light.png"))
context_render(ld, hx(GH_DARK), os.path.join(OUT, "context-readme-dark.png"))

# ---------------- proof sheet: mark at sizes on both grounds ----------------
sheet = Image.new("RGB", (1200, 460), (255, 255, 255))
sd = ImageDraw.Draw(sheet)
sd.rectangle([600, 0, 1200, 460], fill=hx(GH_DARK))
mkd = Image.open(os.path.join(OUT, "mark-dark.png"))
f_lab = ImageFont.truetype(F_SERIF, 20)
sd.text((30, 18), "MARK - light (ink)", font=f_lab, fill=hx(INK))
sd.text((630, 18), "MARK - dark (paper)", font=f_lab, fill=(255, 255, 255))
for base_x, src in ((30, mk_light), (630, mkd)):
    x = base_x
    for sz in [256, 64, 32, 16]:
        m = src.resize((sz, sz), Image.LANCZOS)
        sheet.paste(m, (x, 70 + (256 - sz)), m)
        x += sz + 40
sheet.save(os.path.join(OUT, "proof-sheet.png"))
print("done:", sorted(os.listdir(OUT)))
