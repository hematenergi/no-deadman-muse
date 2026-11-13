# NoDeadman Muse — FINAL Logo: Watchkeeper's Lantern

**Brief history:** the Watchkeeper's Lantern direction was chosen on 13 Nov 2026 after exploring typography and symbols; the final form prioritizes symmetry and clean lines.

## Concept

A night watchkeeper's lantern: in the Middle Ages, gatekeepers lit lanterns, kept watch all night, and testified that all was safe — exactly this supervisor's job for agent runs: registration, watchkeeping, and evidence-based alarms. Its flame is gold and never goes out; there is no imagery of death anywhere. The absurdity is subtle: the ceremony of guarding a city is used to guard processes with no bodies.

## Form discipline (response to the "messy" correction)

- All coordinates derive from ONE central axis (cx=60); the right half of every curve is the arithmetic mirror of the left half. Mirror check on the final render: 0,000% of pixels differ outside the curves' antialias edges.
- One stroke weight (6 units) for the hanging ring + glass chamber frame.
- Fixed proportion ladder: ring ⌀18 · domed crown · glass chamber width 56 · flame at the chamber's center · stepped base 66/48.

## Final files

| File | Contents |
|---|---|
| `lockup-light.svg` / `lockup-light.png` (2200px) | Ink lantern + ink wordmark lockup, transparent — light README |
| `lockup-dark.svg` / `lockup-dark.png` (2200px) | Paper lantern + paper wordmark lockup, transparent — dark README |
| `mark.svg` / `mark.png` (1024×1024) | Ink lantern alone, transparent |
| `mark-dark.svg` / `mark-dark.png` (1024×1024) | Paper lantern alone, transparent |
| `context-readme-light.png` / `context-readme-dark.png` (generator outputs, not included) | Context proof: wide lockup displayed at EXACTLY 520px in a simulated README header |
| `proof-sheet.png` (generator output, not included) | Mark at 256/64/32/16 on both backgrounds |
| `build-logo.py` | Optional asset generator (see prerequisites below) |

Wordmark: "NoDeadman Muse" Noto Serif Display Black, one complete name in one color. Tokens: ink `#11181D` · paper `#F7F5F0` · gold flame `#C9A227`.

**Rendering:** SVG is the full vector master — true Bézier paths, wordmark transforms baked into coordinates, all numbers plain decimals without exponent notation to maintain SVG parser compatibility. All PNGs are rasterized FROM the SVG master using resvg (a real vector rasterizer) at 2× and then downsampled once — not PIL sampled polygons (the cause of "jagged" edges in the first delivery) and not the ffmpeg SVG route (which silently upscales a 100px raster).

## Installation

Lockup file names are the same as before — the existing `#gh-light-mode-only` / `#gh-dark-mode-only` markers select the variant. Asset changes should undergo visual review before publication.


## Optional regeneration

SVG/PNG assets are ready to use from the checkout; logo regeneration is not an installation step for the `ndm` CLI. The generator requires Python 3, the `fontTools`, `Pillow`, `numpy` packages, the [resvg](https://github.com/linebender/resvg) binary, and Noto Serif Display Black and Inter Regular font files supplied by the operator. Font paths are selected via `--serif-font` and `--tag-font`; `--resvg` can point to an executable outside PATH. No folder from the original machine/agent is required.

Template (replace example paths with existing local files):

```sh
python3 assets/build-logo.py --serif-font /example/fonts/NotoSerifDisplay-Black.ttf \
  --tag-font /example/fonts/Inter-Regular.ttf
```

The generator overwrites SVG/PNG files in the script directory and produces additional proof sheets. Run it in a copy of the checkout if you only want to try it; results depend on font and renderer versions. Do not regenerate just to use the CLI. Argument validation test without graphics dependencies: `python3 test/logo-generator.test.py`.
