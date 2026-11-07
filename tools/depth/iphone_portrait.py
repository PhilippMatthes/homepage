"""Turn an iPhone Portrait-mode HEIC into the hero assets, using the depth the phone captured.

Usage (macOS, from the repo root):

    python3 tools/depth/iphone_portrait.py ~/Pictures/IMG_0201.heic [--top 0.07] [--size 1024]

Writes public/assets/selfie.webp, selfie-depth.webp (person only) and selfie-scene-depth.webp
(whole scene, for the background point cloud). No EXIF/GPS metadata.
Needs: Xcode command line tools (swift), Pillow, numpy, cwebp is not required.

Depth: the phone's disparity map (near = high), normalized over the person and multiplied
by the Portrait Effects Matte, so the background is 0 and the silhouette is clean.
For photos without depth data, use estimate.py (Depth Anything V2) instead.
"""

import argparse
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("heic", type=Path)
    ap.add_argument("--out", type=Path, default=Path("public/assets"))
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--top", type=float, default=0.07,
                    help="space above the top of the head, as a fraction of the crop")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(["swift", str(HERE / "iphone_extract.swift"), str(args.heic), str(tmp)], check=True)
        photo = Image.open(tmp / "photo.png").convert("RGB")
        matte = Image.open(tmp / "matte.png").convert("L")
        raw = next(tmp.glob("disparity_*.f32"))
        dw, dh = (int(v) for v in raw.stem.split("_")[1].split("x"))
        disp = np.fromfile(raw, dtype=np.float32).reshape(dh, dw)

    W, H = photo.size
    side = min(W, H)
    # Place the square so the top of the head sits `--top` below the crop's upper edge.
    m = np.asarray(matte.resize((W, H), Image.BILINEAR), dtype=np.float32) / 255.0
    rows = np.where(m.max(axis=1) > 0.5)[0]
    head_top = int(rows.min()) if len(rows) else 0
    y0 = int(np.clip(head_top - args.top * side, 0, H - side))
    x0 = (W - side) // 2
    box = (x0, y0, x0 + side, y0 + side)

    size = args.size
    photo_sq = photo.crop(box).resize((size, size), Image.LANCZOS)
    matte_sq = np.asarray(matte.resize((W, H), Image.BILINEAR).crop(box).resize((size, size), Image.BILINEAR),
                          dtype=np.float32) / 255.0
    disp_img = Image.fromarray(disp).resize((W, H), Image.BICUBIC).crop(box).resize((size, size), Image.BICUBIC)
    d = np.asarray(disp_img, dtype=np.float32)

    person = matte_sq > 0.6
    lo, hi = np.percentile(d[person], [1.0, 99.7])
    dn = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)
    # Subject spans 0.3..1 so it clears the page's background cutoff; background → 0 via the matte.
    depth = (0.3 + 0.7 * dn) * np.clip(matte_sq, 0, 1) ** 1.5
    depth_img = Image.fromarray((depth * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))

    # Whole-scene depth (no matte), normalized over the full frame: drives the background point cloud.
    slo, shi = np.percentile(d, [0.5, 99.5])
    scene = np.clip((d - slo) / max(1e-6, shi - slo), 0, 1)
    scene_img = Image.fromarray((scene * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))

    args.out.mkdir(parents=True, exist_ok=True)
    scene_img.save(args.out / "selfie-scene-depth.webp", quality=92, method=6)
    photo_sq.save(args.out / "selfie.webp", quality=88, method=6)
    depth_img.save(args.out / "selfie-depth.webp", quality=95, method=6)
    print(f"crop {box} of {W}x{H}; disparity {lo:.3f}..{hi:.3f}")
    print(f"wrote {args.out / 'selfie.webp'} and {args.out / 'selfie-depth.webp'} ({size}x{size})")


if __name__ == "__main__":
    main()
