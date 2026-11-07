"""Generate the portrait + depth map used by the hero point cloud.

Usage (from the repo root):

    python3 -m venv tools/depth/.venv
    tools/depth/.venv/bin/pip install -r tools/depth/requirements.txt
    tools/depth/.venv/bin/python tools/depth/estimate.py path/to/photo.jpg --size 512

Writes public/assets/selfie.webp and public/assets/selfie-depth.webp.
Depth is estimated with Depth Anything V2 (relative depth, near = white).
The background is pushed to black so the point sampler can cull it; for a
cleaner silhouette, pass a photo with a plain or already-removed background.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from transformers import pipeline

MODEL = "depth-anything/Depth-Anything-V2-Small-hf"


def center_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(w, h)
    return img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo", type=Path)
    ap.add_argument("--size", type=int, default=512, help="output edge length in px")
    ap.add_argument("--out", type=Path, default=Path("public/assets"))
    ap.add_argument("--model", default=MODEL)
    ap.add_argument(
        "--background",
        type=float,
        default=0.35,
        help="normalized depth below which pixels count as background (0..1)",
    )
    args = ap.parse_args()

    photo = center_square(Image.open(args.photo).convert("RGB")).resize(
        (args.size, args.size), Image.LANCZOS
    )
    estimator = pipeline("depth-estimation", model=args.model)
    depth = estimator(photo)["predicted_depth"].squeeze().cpu().numpy()

    d = (depth - depth.min()) / max(1e-6, depth.max() - depth.min())
    # Remap so the subject spans the range and the background goes to 0.
    d = np.clip((d - args.background) / (1 - args.background), 0, 1)
    depth_img = Image.fromarray((d * 255).astype(np.uint8)).resize(
        (args.size, args.size), Image.BICUBIC
    )
    depth_img = depth_img.filter(ImageFilter.GaussianBlur(1))

    args.out.mkdir(parents=True, exist_ok=True)
    photo.save(args.out / "selfie.webp", quality=90)
    depth_img.save(args.out / "selfie-depth.webp", quality=95)
    print(f"wrote {args.out / 'selfie.webp'} and {args.out / 'selfie-depth.webp'}")


if __name__ == "__main__":
    main()
