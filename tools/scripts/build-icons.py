#!/usr/bin/env python3
"""
Build the full Atlas icon set from a single source image.

Reads a source image (PNG or JPG; JPG with checkerboard background is
auto-cleaned via corner flood-fill), produces:

  - ui/desktop/src/images/icon.png       (1024 master)
  - ui/desktop/src/images/icon@2x.png    (1024)
  - ui/desktop/src/images/icon-512.png   (512)
  - ui/desktop/src/images/icon.ico       (multi-size Windows)
  - ui/desktop/src/images/icon.icns      (multi-resolution macOS, via iconutil)
  - ui/desktop/src/images/iconTemplate.png + @2x.png   (macOS tray silhouette)

Tasks: T021 (app icon), T022 (splash deferred), T023 (tray icon).

Usage:
    python3 tools/scripts/build-icons.py <source-image-path>

Requires Pillow (`python3 -m pip install pillow`) and macOS `iconutil`
(only for the .icns; if absent the .iconset directory is preserved for
manual conversion on a Mac).
"""

from __future__ import annotations
import os
import sys
import subprocess
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps, ImageFilter


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = REPO_ROOT / "ui" / "desktop" / "src" / "images"

# Background-matte tolerance (per-channel max abs diff). A pixel is considered
# part of the checkerboard background if it matches one of the sampled
# background colours (light or dark cell) within this tolerance.
MATTE_TOLERANCE = 22

# Pragmatic fallback: when the source image is a JPG with a checkerboard
# preview baked in (common from AI image gens), the logo's metallic greys
# often overlap the checkerboard palette so heavily that clean keying is
# unreliable. In that case we crop tight to the visible logo subject and
# composite onto a solid brand-coloured background.
BRAND_BG_COLOR = (11, 31, 58)  # NET Group navy, from branding/colors.ts secondary
CROP_FRACTION = 0.55  # keep the central <fraction> of width and 0.9*height


def open_rgba(path: Path) -> Image.Image:
    img = Image.open(path)
    return img.convert("RGBA")


def remove_checkerboard_background(img: Image.Image) -> Image.Image:
    """Color-match + connected-component matte.

    1. Sample the OUTERMOST edge ring (where the logo is guaranteed not to
       reach) to learn the two checkerboard shades.
    2. Build a binary candidate mask of pixels matching either shade within
       a narrow tolerance.
    3. Flood-fill the mask from every border candidate so only border-
       connected candidates remain. Isolated candidates inside the logo
       silhouette (logo greys that happened to match) are kept opaque.
    4. Apply the refined mask as alpha=0.
    """
    import numpy as np  # local — keeps the import cost off the no-bg-removal path

    img = img.copy().convert("RGBA")
    w, h = img.size
    arr = np.array(img)
    rgb = arr[..., :3].astype(np.int16)

    # Sample only the 4 corner regions (2px-thick strips along each edge).
    # These are guaranteed-checkerboard since the logo sits in the centre.
    strip = 4
    edge_samples = np.concatenate([
        rgb[:strip, :, :].reshape(-1, 3),
        rgb[-strip:, :, :].reshape(-1, 3),
        rgb[:, :strip, :].reshape(-1, 3),
        rgb[:, -strip:, :].reshape(-1, 3),
    ], axis=0)

    # Split by luminance — pivot at the median.
    lum = (0.299 * edge_samples[:, 0] + 0.587 * edge_samples[:, 1]
           + 0.114 * edge_samples[:, 2])
    pivot = np.median(lum)
    light = edge_samples[lum >= pivot].mean(axis=0).astype(np.int16)
    dark = edge_samples[lum < pivot].mean(axis=0).astype(np.int16)
    print(f"  matte targets — light: {tuple(light)}  dark: {tuple(dark)}")

    # Narrow per-channel tolerance to avoid grabbing logo greys.
    tol = MATTE_TOLERANCE
    def matches(target):
        return ((np.abs(rgb[..., 0] - target[0]) <= tol) &
                (np.abs(rgb[..., 1] - target[1]) <= tol) &
                (np.abs(rgb[..., 2] - target[2]) <= tol))
    candidate = matches(light) | matches(dark)
    print(f"  candidate pixels: {int(candidate.sum())} / {w * h}")

    # Connected-component refinement via Pillow flood-fill on a single-band mask.
    # 255 = candidate, 0 = non-candidate. Flood from every border candidate,
    # changing 255 → 128. Surviving 255s are isolated logo greys.
    mask = Image.fromarray((candidate * 255).astype(np.uint8), mode="L")
    mpx = mask.load()
    for x in range(w):
        for yy in (0, h - 1):
            if mpx[x, yy] == 255:
                ImageDraw.floodfill(mask, (x, yy), 128, thresh=0)
    for yy in range(h):
        for x in (0, w - 1):
            if mpx[x, yy] == 255:
                ImageDraw.floodfill(mask, (x, yy), 128, thresh=0)

    background = (np.array(mask) == 128)
    print(f"  border-connected background pixels: {int(background.sum())} "
          f"(spared isolated logo greys: {int(candidate.sum() - background.sum())})")

    alpha = arr[..., 3]
    alpha[background] = 0
    arr[..., 3] = alpha
    return Image.fromarray(arr, mode="RGBA")


def square_pad_to_bbox(img: Image.Image, padding_frac: float = 0.08) -> Image.Image:
    """Crop to alpha bounding box, then pad into a square with a margin."""
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if bbox is None:
        return img
    cropped = img.crop(bbox)
    cw, ch = cropped.size
    side = max(cw, ch)
    pad = int(side * padding_frac)
    canvas_side = side + 2 * pad
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    offset = ((canvas_side - cw) // 2, (canvas_side - ch) // 2)
    canvas.paste(cropped, offset, cropped)
    return canvas


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def make_tray_template(img: Image.Image, size: int = 22) -> Image.Image:
    """macOS tray-template image: monochrome silhouette with alpha.

    Take the alpha channel as a soft mask, threshold + smooth, then output
    as black-on-transparent. This is what macOS's template-image API expects.
    """
    alpha = img.split()[-1]
    # Threshold the alpha to get a clean silhouette (>~50% opaque becomes
    # part of the silhouette). 1.5x supersample then resize for smoother edge.
    big = alpha.resize((size * 4, size * 4), Image.Resampling.LANCZOS)
    big = big.point(lambda v: 255 if v > 96 else 0)
    big = big.filter(ImageFilter.GaussianBlur(0.6))
    small = big.resize((size, size), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Black pixels where the silhouette is opaque.
    black = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    out.paste(black, mask=small)
    return out


def write_icns(base_1024: Image.Image, out_path: Path) -> bool:
    """Build a multi-resolution .icns via `iconutil`. Returns True on success."""
    iconset_dir = out_path.with_suffix(".iconset")
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir(parents=True, exist_ok=True)

    sizes = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]
    for name, px in sizes:
        resize(base_1024, px).save(iconset_dir / name, "PNG")

    if shutil.which("iconutil"):
        result = subprocess.run(
            ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(out_path)],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            shutil.rmtree(iconset_dir)
            return True
        print(f"  iconutil failed: {result.stderr}", file=sys.stderr)
        return False
    print("  iconutil not available; .iconset directory preserved at", iconset_dir)
    return False


def central_crop_on_brand_bg(img: Image.Image,
                              crop_frac: float = CROP_FRACTION,
                              bg: tuple[int, int, int] = BRAND_BG_COLOR) -> Image.Image:
    """Crop the central region of the image and composite onto a solid brand bg.

    The crop is sized to grab the logo subject while excluding most of the
    surrounding checkerboard. Any residual checkerboard around the logo is
    overwritten by the solid background.
    """
    img = img.convert("RGB")
    w, h = img.size
    crop_w = int(w * crop_frac)
    crop_h = int(h * 0.92)
    left = (w - crop_w) // 2
    top = (h - crop_h) // 2
    cropped = img.crop((left, top, left + crop_w, top + crop_h))

    # Composite: detect checkerboard pixels by their narrow palette, replace
    # with the brand background. Logo greys that happen to fall in the same
    # palette are accepted as a small visual cost.
    import numpy as np
    arr = np.array(cropped).astype(np.int16)
    rgb = arr[..., :3]
    # Sample the cropped image's edge ring (4-pixel strip) for the dominant
    # background palette in the cropped region.
    strip = 4
    edge = np.concatenate([
        rgb[:strip, :, :].reshape(-1, 3),
        rgb[-strip:, :, :].reshape(-1, 3),
        rgb[:, :strip, :].reshape(-1, 3),
        rgb[:, -strip:, :].reshape(-1, 3),
    ], axis=0)
    lum = 0.299 * edge[:, 0] + 0.587 * edge[:, 1] + 0.114 * edge[:, 2]
    pivot = np.median(lum)
    light = edge[lum >= pivot].mean(axis=0).astype(np.int16)
    dark = edge[lum < pivot].mean(axis=0).astype(np.int16)
    tol = MATTE_TOLERANCE
    def matches(t):
        return ((np.abs(rgb[..., 0] - t[0]) <= tol)
                & (np.abs(rgb[..., 1] - t[1]) <= tol)
                & (np.abs(rgb[..., 2] - t[2]) <= tol))
    bg_mask = matches(light) | matches(dark)
    arr_u8 = arr.astype(np.uint8)
    arr_u8[bg_mask] = list(bg)
    out_rgb = Image.fromarray(arr_u8, mode="RGB")

    # Now pad to square on the brand background.
    cw, ch = out_rgb.size
    side = max(cw, ch)
    pad = int(side * 0.08)
    canvas_side = side + 2 * pad
    canvas = Image.new("RGB", (canvas_side, canvas_side), bg)
    canvas.paste(out_rgb, ((canvas_side - cw) // 2, (canvas_side - ch) // 2))
    return canvas.convert("RGBA")


def main():
    if len(sys.argv) < 2:
        print("usage: build-icons.py <source-image>", file=sys.stderr)
        sys.exit(2)
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"source not found: {src}", file=sys.stderr)
        sys.exit(2)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Loading source: {src}")
    raw = open_rgba(src)
    print(f"  source dims: {raw.size}")

    # Pragmatic path: when source is a JPG with baked-in checkerboard preview,
    # clean transparency keying is unreliable; composite on brand background.
    print(f"Cropping central {int(CROP_FRACTION*100)}%-width region and compositing on brand bg {BRAND_BG_COLOR}…")
    squared = central_crop_on_brand_bg(raw)
    print(f"  squared dims: {squared.size}")

    print("Resizing to 1024 master…")
    master = resize(squared, 1024)

    # PNGs
    targets = [
        ("icon.png", 1024),
        ("icon@2x.png", 1024),
        ("icon-512.png", 512),
    ]
    for name, px in targets:
        path = OUT_DIR / name
        resize(master, px).save(path, "PNG")
        print(f"  wrote {path.relative_to(REPO_ROOT)} ({px}×{px})")

    # Multi-size .ico for Windows
    ico_path = OUT_DIR / "icon.ico"
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"  wrote {ico_path.relative_to(REPO_ROOT)} (sizes: {ico_sizes})")

    # macOS .icns
    icns_path = OUT_DIR / "icon.icns"
    if write_icns(master, icns_path):
        print(f"  wrote {icns_path.relative_to(REPO_ROOT)} (multi-resolution)")
    else:
        print(f"  .iconset directory left at {icns_path.with_suffix('.iconset')}")

    # macOS tray template (monochrome silhouette)
    tray = make_tray_template(squared, size=22)
    tray2x = make_tray_template(squared, size=44)
    tray.save(OUT_DIR / "iconTemplate.png", "PNG")
    tray2x.save(OUT_DIR / "iconTemplate@2x.png", "PNG")
    print(f"  wrote iconTemplate.png (22×22) and iconTemplate@2x.png (44×44)")

    print("Done.")


if __name__ == "__main__":
    main()
