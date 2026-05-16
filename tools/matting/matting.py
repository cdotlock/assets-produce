#!/usr/bin/env python3
"""
matting.py — MODNet portrait alpha matting + green-screen unmix + alpha sharpen.

Pipeline (per character / sprite):
  1. MODNet inference → soft alpha mask (0–255)
  2. Green-screen unmix: head_color = (observed - greenscreen × (1−α)) / α
     This recovers the true RGB of edge pixels that were polluted by
     #00FF00 background bleed during chromakey rendering.
  3. Alpha sharpen via linear remap (lo=32, hi=192) — pulls "near-solid"
     alpha to 255 so hair body is opaque while keeping a thin gradient at
     the actual hair tip. Removes the speckle-noise feel of raw ML matting.

Why MODNet:
  - Apache 2.0, commercial-friendly
  - 26 MB ckpt, ~1s inference per image on M2 Pro CPU
  - portrait+hair-specialised; in our A/B test gave more solid alpha
    (200K @255 vs BiRefNet's 142K) and cleaner hair edges on illustration
    style after unmix+sharpen post-pass

Migrated 2026-05-16 from moonshort-backend/generate-upscale-matting/matting.py.
Original marked DEPRECATED there.

Install (one-time):
  git clone https://github.com/ZHKKKe/MODNet.git ~/modnet
  cd ~/modnet && mkdir -p pretrained && \\
  pip install gdown && \\
  gdown 'https://drive.google.com/uc?id=1mcr7ALciuAsHCpLnrtG_eop5-EYhbCmz' \\
        -O pretrained/modnet_photographic_portrait_matting.ckpt

  Override repo path: export MODNET_REPO_PATH=/path/to/modnet

Usage:
  # JSON entry (preferred)
  python3 matting.py --input fixtures/matting-mock.json
  cat fixtures/matting-mock.json | python3 matting.py --input -

  # standalone legacy CLI (single file)
  python3 matting.py --src input.png --dst output.png

  # batch via to-final.py orchestrator (preferred for legacy)
"""
from __future__ import annotations

import argparse
import os
import pathlib
import sys
import warnings

# ---------------------------------------------------------------------------
# Module-level constants — no torch/cv2 imports at this level.
# Heavy deps (torch, torchvision, cv2, numpy) are imported lazily inside
# load_modnet() and the inference functions so that:
#   (a) the module is importable with no ML stack installed, and
#   (b) --mock runs cleanly on plain python3.
# ---------------------------------------------------------------------------

warnings.filterwarnings("ignore")

# MODNET_REPO_PATH env var overrides the default ~/modnet location.
# This replaces the hardcoded MODNET_REPO = pathlib.Path.home() / "modnet"
# from the original backend file. The sys.path.insert inside load_modnet()
# is preserved — it is MODNet's documented import mechanism.
_MODNET_REPO_PATH_ENV = os.environ.get("MODNET_REPO_PATH", "")
MODNET_REPO: pathlib.Path = (
    pathlib.Path(_MODNET_REPO_PATH_ENV).expanduser().resolve()
    if _MODNET_REPO_PATH_ENV
    else pathlib.Path.home() / "modnet"
)
MODNET_CKPT = MODNET_REPO / "pretrained" / "modnet_photographic_portrait_matting.ckpt"

REF_SIZE = 512  # MODNet's training resolution; image is rescaled before inference

# These constants are used in the post-processing functions.
# numpy is imported lazily, but the constant values are pure Python.
GREEN_SCREEN_RGB = (0.0, 255.0, 0.0)  # stored as tuple; converted inside functions
SHARPEN_LO = 10
SHARPEN_HI = 192

# Hybrid (MODNet ∩ chromakey) BG-mask gate parameters. Used by _matte_array
# to suppress MODNet "negative-space hallucinations" (e.g. between-legs gap
# of an open stance, where MODNet's portrait-trained prior fills in fg).
# Logic: where the raw greenscreen pixel is clearly BG (G dominates R+B by
# `BG_HUE_TOL` AND G is at least `BG_MIN_G`), force alpha=0 regardless of
# what MODNet predicted. Tuned on selena_3da5: at HUE_TOL=30 / MIN_G=100,
# the chromakey green corner (≈4,250,8) trips, while in-fabric green
# (e.g. 32,52,43) does not — fabric fully preserved.
BG_HUE_TOL = 30
BG_MIN_G = 100

WEBP_QUALITY = 90
WEBP_METHOD = 6  # densest encoding, slower but smallest

# v10 pipeline constants
V10_HARD_BG_MIN_G = 240
V10_HARD_BG_MAX_R = 30
V10_HARD_BG_MAX_B = 30

V10_STRICT_EXCESS = 60
V10_STRICT_MIN_G = 180

V10_NOT_GREEN_MAX_G = 80
V10_NOT_GREEN_MAX_EXCESS = 30

V10_SEMI_LO = 32
V10_SEMI_HI = 192

V10_SPILL_LO = 10
V10_SPILL_HI = 250

V10_MIN_FG_AREA = 10000


# ─── MODNet ────────────────────────────────────────────────────────────────

def load_modnet(device: str = "cpu") -> "nn.Module":  # noqa: F821
    """Load MODNet checkpoint. Heavy deps (torch, torchvision) are imported here."""
    import torch
    import torch.nn as nn  # noqa: F401 — imported for type clarity
    if not MODNET_CKPT.exists():
        raise FileNotFoundError(
            f"MODNet ckpt missing: {MODNET_CKPT}\n"
            "  Install:\n"
            "    git clone https://github.com/ZHKKKe/MODNet.git ~/modnet\n"
            "    cd ~/modnet && mkdir -p pretrained\n"
            "    pip install gdown\n"
            "    gdown 'https://drive.google.com/uc?id=1mcr7ALciuAsHCpLnrtG_eop5-EYhbCmz' \\\n"
            "          -O pretrained/modnet_photographic_portrait_matting.ckpt\n"
            f"  Or set MODNET_REPO_PATH env var to override ~/modnet location.\n"
        )
    sys.path.insert(0, str(MODNET_REPO))
    from src.models.modnet import MODNet  # type: ignore[import-not-found]
    import torch.nn as nn
    m = MODNet(backbone_pretrained=False)
    m = nn.DataParallel(m)
    m.load_state_dict(torch.load(str(MODNET_CKPT), map_location=device))
    m.eval()
    return m


def matte_alpha(modnet: "nn.Module", img: "Image.Image", device: str = "cpu") -> "np.ndarray":  # noqa: F821
    """Run MODNet on one image, return alpha (H, W) uint8."""
    import torch
    import torch.nn as nn
    import torchvision.transforms as T
    W, H = img.size
    tf = T.Compose([T.ToTensor(), T.Normalize([0.5] * 3, [0.5] * 3)])
    inp = tf(img).unsqueeze(0).to(device)

    im_h, im_w = inp.shape[-2:]
    if im_w >= im_h:
        rh, rw = REF_SIZE, int(im_w / im_h * REF_SIZE)
    else:
        rw, rh = REF_SIZE, int(im_h / im_w * REF_SIZE)
    rh -= rh % 32
    rw -= rw % 32
    inp = nn.functional.interpolate(inp, size=(rh, rw), mode="area")

    with torch.no_grad():
        _, _, m = modnet(inp, True)
    m = nn.functional.interpolate(m, size=(H, W), mode="area")
    import numpy as np
    return (m[0, 0].cpu().numpy() * 255).clip(0, 255).astype(np.uint8)


# ─── Post-processing ────────────────────────────────────────────────────────

def unmix_against_green(
    rgb: "np.ndarray",
    alpha: "np.ndarray",
    bg: "np.ndarray | None" = None,
) -> "np.ndarray":
    """Recover head color from observed RGB + alpha against a known background,
    with a soft blend that suppresses the magenta-fringe failure mode.

    Premise: observed = head × α + bg × (1 − α).  Solve for head:
      head = (observed − bg × (1 − α)) / α

    Failure mode: at low α (~0.3), the (1/α) factor amplifies R and B channels
    to 255 (clipped) while G stays mid → pixels read as bright magenta. A
    classic green-screen "fringe color shift". Visible as a pink halo around
    hair where the matting alpha goes soft.

    Fix: blend the unmixed RGB with the original observed RGB by a weight
    that ramps in only above α ≥ 0.25 and reaches full unmix by α ≥ 0.75.
    Soft edges stay close to the model's original output (slightly greenish
    is fine — that's the genuine alpha gradient), solid pixels (α ≈ 1) are
    fully unmixed (where the formula degenerates to identity anyway).
    """
    import numpy as np
    if bg is None:
        bg = np.array(GREEN_SCREEN_RGB, dtype=np.float32)
    rgb_f = rgb.astype(np.float32)
    a3 = (alpha.astype(np.float32) / 255.0)[..., None]
    valid = a3 > 0.05
    a_safe = np.where(valid, a3, 1.0)
    unmixed = np.clip((rgb_f - bg * (1.0 - a3)) / a_safe, 0, 255)

    # Blend ramp: weight = clip(2α − 0.5, 0, 1)
    #   α=0.25 → 0   (keep observed)
    #   α=0.50 → 0.5 (half-unmix)
    #   α=0.75 → 1.0 (full unmix)
    blend = np.clip(2.0 * a3 - 0.5, 0.0, 1.0)
    blended = blend * unmixed + (1.0 - blend) * rgb_f

    return np.where(valid, blended, rgb_f).clip(0, 255).astype(np.uint8)


def edge_decontaminate(
    rgb: "np.ndarray",
    alpha: "np.ndarray",
    alpha_low: int = 10,
    alpha_high: int = 240,
) -> "np.ndarray":
    """On the alpha boundary, suppress channel imbalances that are unmix
    overshoot or chromakey spill rather than real character colors.

    Why this exists: even after the soft-blended unmix, edge pixels with
    α in the 0.4-0.6 range still get partial unmix applied, and the
    unmixed RGB has R+B near 255 with G mid — the classic "pink/magenta
    fringe" you see on hair edges against a non-green viewer background.
    Symmetrically, residual green spill from cutout would show as a halo
    if any survived.

    Two checks are applied only where alpha_low ≤ α < alpha_high:
      • magenta:    R > G  AND  B > G  AND  R+B > 2G + 40     → G ← (R+B)/2
      • green halo: G > R  AND  G > B  AND  G > max(R,B) + 20 → G ← max(R,B)

    Solid interior pixels (α ≥ alpha_high) are untouched, which protects:
      - skin (R > G > B, no asymmetry condition met)
      - red lips (R > G ≈ B, no large R+B vs G gap)
      - emerald iris (small region, mostly α=255 anyway)
    """
    import numpy as np
    rgb = rgb.astype(np.int16)
    R = rgb[..., 0]; G = rgb[..., 1]; B = rgb[..., 2]
    edge = (alpha >= alpha_low) & (alpha < alpha_high)

    magenta = edge & (R > G) & (B > G) & (R + B > 2 * G + 40)
    G_new = np.where(magenta, (R + B) // 2, G)

    green_halo = edge & (G > R) & (G > B) & (G > np.maximum(R, B) + 20)
    G_new = np.where(green_halo, np.maximum(R, B), G_new)

    rgb_out = rgb.copy()
    rgb_out[..., 1] = G_new
    return rgb_out.clip(0, 255).astype(np.uint8)


def sharpen_alpha(
    alpha: "np.ndarray",
    lo: int = SHARPEN_LO,
    hi: int = SHARPEN_HI,
) -> "np.ndarray":
    """Linear remap: alpha < lo → 0, alpha > hi → 255, in-between stretched.
    Pulls 'near-solid' raw ML alpha to 255 so hair body becomes opaque,
    leaving a thin gradient at the actual hair tip (lo–hi window)."""
    import numpy as np
    a = alpha.astype(np.int32)
    return np.clip((a - lo) * 255 // (hi - lo), 0, 255).astype(np.uint8)


def chromakey_bg_mask(
    rgb: "np.ndarray",
    hue_tol: int = BG_HUE_TOL,
    min_g: int = BG_MIN_G,
) -> "np.ndarray":
    """Boolean mask of "this pixel is the green chromakey BG" on a raw RGB.

    Used as a hard gate on top of MODNet's alpha to kill the model's
    well-known "fill-in negative space" failure (e.g. open-stance
    between-legs gap, hallucinated body around white objects). Tuned
    so the chromakey green (≈4,250,8) trips but in-fabric dark green
    (32,52,43) does not — see BG_HUE_TOL / BG_MIN_G constants.

    The mask must be evaluated on the **raw greenscreen** image, BEFORE
    unmix_against_green changes the RGB. Caller's responsibility.
    """
    r = rgb[..., 0].astype(int)
    g = rgb[..., 1].astype(int)
    b = rgb[..., 2].astype(int)
    return (g > r + hue_tol) & (g > b + hue_tol) & (g > min_g)


# ─── End-to-end (legacy pipeline) ──────────────────────────────────────────

def _matte_array(
    src_path: pathlib.Path,
    model: "nn.Module",
    device: str = "cpu",
) -> "np.ndarray":
    """MODNet inference + chromakey BG gate + 4-step post-process.

    Returns RGBA uint8 (H, W, 4).

    Pipeline:
      1. load RGB (raw greenscreen)
      2. MODNet alpha
      3. chromakey BG mask gate — force alpha=0 on green-BG pixels
         (kills hallucinations: between-legs negative space, around white
         objects, anywhere MODNet's portrait prior fills in fg)
      4. unmix_against_green (recovers fg RGB at edge α<255)
      5. edge_decontaminate (suppresses magenta fringe + residual green halo
         at edge band, leaves interior fabric color untouched)
      6. sharpen_alpha (pull near-solid alpha to 255)
      7. stack into RGBA

    The BG-gate step (3) makes this the "MODNet ∩ chromakey" hybrid that
    fixes both:
      - MODNet's hallucination failure (e.g. selena_3da5 between-legs blob)
      - rgb_unspill.py over-correction on green fabric (e.g. casual outfit)
    """
    import numpy as np
    from PIL import Image
    img = Image.open(src_path).convert("RGB")
    rgb = np.asarray(img)

    alpha = matte_alpha(model, img, device=device)
    bg_mask = chromakey_bg_mask(rgb)
    alpha = np.where(bg_mask, 0, alpha).astype(np.uint8)

    rgb_unmix = unmix_against_green(rgb, alpha)
    rgb_clean = edge_decontaminate(rgb_unmix, alpha)
    alpha_sharp = sharpen_alpha(alpha)
    return np.dstack([rgb_clean, alpha_sharp])


# ─── v10 pipeline — MODNet + size-filtered CC + hard absolute-bg ───────────
#
# Replaces the v3-era chromakey-hybrid path in `_matte_array` for new
# deployments. Validated 2026-05-12 on 10 representative sprites:
#   - selena black-dress leg-gap pink-ring artifact: ELIMINATED
#   - javier seated chair: PRESERVED (151K px rescued)
#   - selena green dress (dark dye): PRESERVED unchanged
#   - camila chiffon sleeves: 31% of thinnest fabric removed (acceptable;
#     chiffon-class outfits handled via upstream prompt constraint)
# Design + iteration history: _test_runs/2026-05-12_modnet-v10_10samples/
# Windows 5070Ti deploy guide: docs/superpowers/handoffs/2026-05-12-v10-windows-deploy.md


def _v10_filter_large_cc(mask: "np.ndarray", min_area: int) -> "np.ndarray":
    """Return mask with only connected components of size >= min_area."""
    import cv2
    import numpy as np
    num, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    out = np.zeros_like(mask, dtype=bool)
    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            out |= labels == i
    return out


def _v10_split_by_cc_attachment(
    candidate: "np.ndarray",
    anchor: "np.ndarray",
) -> "tuple[np.ndarray, np.ndarray]":
    """Split candidate by whether its CC overlaps anchor. (attached, orphan)."""
    import cv2
    import numpy as np
    unified = (candidate | anchor).astype(np.uint8)
    _, labels = cv2.connectedComponents(unified, connectivity=8)
    trusted = set(np.unique(labels[anchor]).tolist())
    trusted.discard(0)
    if not trusted:
        return np.zeros_like(candidate), candidate.copy()
    trusted_arr = np.array(sorted(trusted), dtype=labels.dtype)
    attached = candidate & np.isin(labels, trusted_arr)
    orphan = candidate & ~attached
    return attached, orphan


def matte_v10(
    rgb: "np.ndarray",
    alpha: "np.ndarray",
) -> "tuple[np.ndarray, np.ndarray]":
    """v10 post-process on a MODNet alpha + greenscreen RGB.

    Args:
        rgb:   uint8 (H, W, 3) — original greenscreen RGB (raw or upscaled)
        alpha: uint8 (H, W)    — MODNet raw alpha

    Returns:
        (rgb_out uint8, alpha_out uint8)

    Pipeline (see module docstring for rationale):
      Step -1: Hard absolute-bg pre-filter
      Step 0a: fg_main = large CCs of (alpha >= SEMI_HI)
      Step 0b: modnet_semi connectivity vs fg_main (orphan → alpha=0)
      Step 1:  Kill bright greenscreen specks + leftover fg_orphan_solid
      Step 2:  Rescue non-green objects connected to fg_main
      Step 3:  1px halo dilation around killed specks
      Step 4:  Edge / semi-trans spill suppression (G = max(R, B))
      Step 5:  Final orphan cleanup safety net
    """
    import numpy as np
    import cv2  # noqa: F401 — used in helpers called below
    rgb = rgb.astype(np.int16)
    alpha = alpha.copy()
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    max_rb = np.maximum(R, B)
    g_excess = G - max_rb

    # Step -1: hard absolute-bg
    hard_bg = (
        (G >= V10_HARD_BG_MIN_G)
        & (R <= V10_HARD_BG_MAX_R)
        & (B <= V10_HARD_BG_MAX_B)
    )
    alpha[hard_bg] = 0

    # Step 0a: fg_main anchor
    fg_solid_raw = alpha >= V10_SEMI_HI
    fg_main = _v10_filter_large_cc(fg_solid_raw, V10_MIN_FG_AREA)

    modnet_semi_all = (alpha > V10_SEMI_LO) & (alpha < V10_SEMI_HI)

    # Step 0b: orphan modnet_semi → bg
    semi_trusted, semi_orphan = _v10_split_by_cc_attachment(modnet_semi_all, fg_main)
    alpha[semi_orphan] = 0

    # Step 1: bright greenscreen specks + remaining fg_orphan_solid
    bright_green = (g_excess >= V10_STRICT_EXCESS) & (G >= V10_STRICT_MIN_G)
    fg_orphan_solid_mask = fg_solid_raw & ~fg_main
    kill_mask = (bright_green & ~semi_trusted) | (fg_orphan_solid_mask & bright_green)
    alpha[kill_mask] = 0
    leftover_orphan_solid = fg_orphan_solid_mask & ~kill_mask
    alpha[leftover_orphan_solid] = 0

    # Step 2: rescue non-green objects (furniture, dark props)
    not_green = (G < V10_NOT_GREEN_MAX_G) & (g_excess < V10_NOT_GREEN_MAX_EXCESS)
    candidate = not_green & (alpha < V10_SEMI_HI)
    rescue_mask, _ = _v10_split_by_cc_attachment(candidate, fg_main)
    alpha[rescue_mask] = 255

    # Step 3: 1px halo around killed specks
    import cv2
    kernel = np.ones((3, 3), np.uint8)
    halo = cv2.dilate(kill_mask.astype(np.uint8), kernel, iterations=1)
    halo_only = halo.astype(bool) & ~kill_mask & ~rescue_mask
    alpha[halo_only] = (alpha[halo_only].astype(np.int16) // 2).astype(np.uint8)

    # Step 4: spill suppression
    spill_band = (alpha > V10_SPILL_LO) & (alpha < V10_SPILL_HI)
    mask_spill = spill_band & (G > max_rb)
    G_new = np.where(mask_spill, max_rb, G)
    rgb_out = np.stack([R, G_new, B], axis=-1).clip(0, 255).astype(np.uint8)

    # Step 5: final orphan cleanup
    any_fg = alpha > 0
    _, orphan_final = _v10_split_by_cc_attachment(any_fg, fg_main)
    alpha[orphan_final] = 0

    return rgb_out, alpha


def _matte_array_v10(
    src_path: pathlib.Path,
    model: "nn.Module",
    device: str = "cpu",
) -> "np.ndarray":
    """v10 drop-in replacement for `_matte_array`. Same signature, same return type.

    Returns RGBA uint8 (H, W, 4).
    """
    import numpy as np
    from PIL import Image
    img = Image.open(src_path).convert("RGB")
    rgb = np.asarray(img)
    alpha = matte_alpha(model, img, device=device)
    rgb_clean, alpha_clean = matte_v10(rgb, alpha)
    return np.dstack([rgb_clean, alpha_clean])


def matte_one_v10(
    src_path: pathlib.Path,
    dst_path: pathlib.Path,
    fmt: str = "webp",
) -> None:
    """v10 drop-in replacement for `matte_one`. Same signature, same I/O."""
    if fmt not in ("webp", "png"):
        raise ValueError(f"fmt must be 'webp' or 'png', got {fmt!r}")
    from PIL import Image
    model = load_modnet()
    rgba = _matte_array_v10(src_path, model)
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    out_img = Image.fromarray(rgba, "RGBA")
    if fmt == "webp":
        out_img.save(dst_path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    else:
        out_img.save(dst_path, "PNG", optimize=True)


# ─── Legacy single-file entry (left for back-compat) ───────────────────────

def matte_one(
    src_path: pathlib.Path,
    dst_path: pathlib.Path,
    fmt: str = "webp",
) -> None:
    """Run MODNet matting + 4-step post-process on a single image; write to dst.

    Args:
        src_path: input PNG (RGB or RGBA — alpha is regenerated)
        dst_path: output path; suffix should match `fmt`
        fmt: "webp" (RGBA, Q90 method=6) or "png" (RGBA, lossless)

    Raises FileNotFoundError if MODNet ckpt is missing. Other failures
    propagate as exceptions — no silent fallback.

    Used by:
      - to-final.py phase 4 (chromakey-hybrid MODNet fallback) → fmt="png"
      - to-final.py default character/sprite path (legacy direct MODNet) → fmt="webp"
        (this path is removed in Task 7; left here in case external callers
        regress)
    """
    if fmt not in ("webp", "png"):
        raise ValueError(f"fmt must be 'webp' or 'png', got {fmt!r}")

    from PIL import Image
    import numpy as np  # noqa: F401 — used inside _matte_array
    model = load_modnet()
    rgba = _matte_array(src_path, model)  # numpy uint8 (H, W, 4)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    out_img = Image.fromarray(rgba, "RGBA")
    if fmt == "webp":
        out_img.save(dst_path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    else:  # png
        out_img.save(dst_path, "PNG", optimize=True)


# ─── Legacy CLI entry ──────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(prog="matting")
    ap.add_argument("--src", required=True, help="single source PNG (RGB, green-screen background)")
    ap.add_argument("--dst", required=True, help="output path (RGBA); suffix should match --fmt")
    ap.add_argument(
        "--fmt",
        choices=("webp", "png"),
        default="webp",
        help="output format; png used for chromakey-hybrid fallback path",
    )
    ap.add_argument(
        "--device",
        default="cpu",
        help="cpu | mps | cuda (currently unused — load_modnet defaults to cpu)",
    )
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    dst = pathlib.Path(args.dst)
    if dst.exists() and not args.overwrite:
        print(f"· {dst}: exists (use --overwrite to replace)")
        return 0

    try:
        matte_one(src, dst, fmt=args.fmt)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"✗ {dst}: {type(e).__name__}: {str(e)[:200]}")
        return 1
    print(f"✓ {dst}: {dst.stat().st_size // 1024} KB")
    return 0


# ─── generic JSON entry (Phase 13) ─────────────────────────────────────────
#
# The legacy main() is tightly coupled to the --src/--dst CLI convention used
# in the moonshort-backend orchestrator. The JSON entry below is
# single-file in / single-file out, which is what the atomic-tool boundary
# expects. This mirrors the Phase-9 pattern from tools/upscale/upscale.py.


def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _write_placeholder_rgba_png(out_path: pathlib.Path) -> None:
    """Write a tiny deterministic valid RGBA PNG (1×1, fully transparent).

    The raw bytes encode a 1×1 RGBA PNG with alpha=0 — a real, parseable
    PNG that downstream tools can open without crashing. Generated with:
        from PIL import Image; import io
        img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        buf = io.BytesIO(); img.save(buf, "PNG"); buf.getvalue().hex()
    """
    png_bytes = bytes.fromhex(
        "89504e470d0a1a0a"          # PNG signature
        "0000000d49484452"          # IHDR chunk length + type
        "00000001"                  # width = 1
        "00000001"                  # height = 1
        "08060000001f15c489"        # bit depth=8, color type=6 (RGBA), ...
        "0000000b4944415478"        # IDAT chunk
        "9c6260000000020001"        # compressed RGBA row: (0,0,0,0)
        "e221bc33"                  # IDAT CRC
        "0000000049454e44ae426082"  # IEND
    )
    out_path.write_bytes(png_bytes)


def _run_json_main(argv: "list[str] | None" = None) -> int:
    """JSON entry — single-image matting.

    Input shape:
        {
            "input_path":  "/abs/in.png",
            "output_path": "/abs/out_matted.png",
            "format":      "webp" | "png"  (optional, default "webp")
            "device":      "cpu"           (optional, default "cpu")
            "overwrite":   bool            (optional, default false)
            "mock":        bool            (optional)
        }

    Output (stdout):
        {
            "output": {"path": "..."},
            "meta": {
                "format": "...",
                "device": "...",
                "latency_ms": int,
                "atomic_tool": "matting",
                "mock": bool
            }
        }

    Errors: stderr `{"error":{"code","message"}}` + nonzero exit.
    Exit codes:
        0  success
        2  INVALID_INPUT  (bad/missing input fields, validation failure)
        4  ATOMIC_TOOL_FAILED  (MODNet repo/ckpt missing, inference error)
        1  INTERNAL  (unexpected exception)
    """
    import argparse as _argparse
    import json as _json
    import time as _time

    ap = _argparse.ArgumentParser(prog="matting.py", add_help=True)
    ap.add_argument("--input", help="Path to JSON input file. '-' or omitted means stdin.")
    ap.add_argument("--mock", action="store_true",
                    help="Skip MODNet; write a 1×1 RGBA placeholder PNG at output_path.")
    ap.add_argument("--json", action="store_true", help="Force JSON entry (no-op, for dispatch).")
    args = ap.parse_args(argv)

    if args.input is None or args.input == "-":
        raw = sys.stdin.read()
    else:
        try:
            with open(args.input, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as e:
            _emit_error("INVALID_INPUT", f"cannot read input file: {e}")
            return 2

    try:
        payload = _json.loads(raw)
    except _json.JSONDecodeError as e:
        _emit_error("INVALID_INPUT", f"input is not valid JSON: {e}")
        return 2

    input_path = payload.get("input_path")
    output_path = payload.get("output_path")
    if not input_path or not output_path:
        _emit_error("INVALID_INPUT", "input.input_path and input.output_path are required")
        return 2

    fmt = payload.get("format", "webp")
    if fmt not in ("webp", "png"):
        _emit_error("INVALID_INPUT", f"format must be 'webp' or 'png', got {fmt!r}")
        return 2

    device = payload.get("device", "cpu")
    overwrite = bool(payload.get("overwrite", False))
    mock = args.mock or bool(payload.get("mock", False))

    src = pathlib.Path(input_path).expanduser().resolve()
    dst = pathlib.Path(output_path).expanduser().resolve()

    if not mock and not src.is_file():
        _emit_error("INVALID_INPUT", f"input_path is not a file: {src}")
        return 2
    if dst.exists() and not overwrite:
        _emit_error("INVALID_INPUT", f"output_path already exists (overwrite=false): {dst}")
        return 2

    dst.parent.mkdir(parents=True, exist_ok=True)
    started = _time.monotonic()

    if mock:
        _write_placeholder_rgba_png(dst)
    else:
        if not MODNET_CKPT.exists():
            _emit_error(
                "ATOMIC_TOOL_FAILED",
                f"MODNet ckpt missing: {MODNET_CKPT}. "
                "Clone https://github.com/ZHKKKe/MODNet.git and download the ckpt, "
                "or set MODNET_REPO_PATH env var.",
            )
            return 4
        try:
            matte_one_v10(src, dst, fmt=fmt)
        except FileNotFoundError as e:
            _emit_error("ATOMIC_TOOL_FAILED", str(e))
            return 4
        except Exception as e:  # noqa: BLE001 — atomic tool boundary
            _emit_error("INTERNAL", f"{type(e).__name__}: {e}")
            return 1

    latency_ms = int((_time.monotonic() - started) * 1000)

    import json as _json
    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "format": fmt,
            "device": device,
            "latency_ms": latency_ms,
            "atomic_tool": "matting",
            "mock": mock,
        },
    }))
    return 0


def _looks_like_json_entry(argv: list[str]) -> bool:
    return any(a in ("--input", "--mock", "--json") for a in argv)


if __name__ == "__main__":
    if _looks_like_json_entry(sys.argv[1:]):
        sys.exit(_run_json_main())
    sys.exit(main())
