#!/usr/bin/env python3
"""Clean product photos for GunBroker: upscale, bg remove, tag inpaint, logo watermark."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from rembg import new_session, remove

ASSETS = Path(
    r"C:\Users\micha\.cursor\projects\c-Users-micha-Projects-modular-market-desk\assets"
)
OUT_DIR = Path(__file__).resolve().parent.parent / "output" / "gunbroker-canik-mc9"

PHOTOS = [
    ("SixOH97-0UQTanuEgw7RBuSZ-7d3b4a72-a88f-490f-9f43-0a895e168caf", "01-muzzle-front.jpg"),
    ("Qp2BZ6ktinXZacYUquuTeDWy-f57db40e-c3de-4cd2-abb5-0affefb37a11", "02-left-side.jpg"),
    ("BePCYMZjhplXLbMtCDXBPPzL-3d3dc5d6-6004-4914-8de2-f90f8d9bdf2c", "03-slide-markings.jpg"),
    ("Wty0gC4GONelgIw4x_PBYfAc__1_-4e898afe-9dfa-4608-8459-9d309f27eb85", "04-right-side.jpg"),
]

LOGO = (
    "c__Users_micha_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    "Modular_Gunworks_LLC-f4f00574-f4f9-42ce-9970-89284ed8fd96.png"
)

def resolve_asset(suffix: str) -> Path:
    matches = list(ASSETS.glob(f"*{suffix}*.png"))
    if not matches:
        raise FileNotFoundError(suffix)
    return matches[0]


CANVAS = 1600
BG = (255, 255, 255)
LOGO_WIDTH_RATIO = 0.14
LOGO_MARGIN = 28
LOGO_OPACITY = 0.92
PADDING_RATIO = 0.05
MIN_FOREGROUND_RATIO = 0.12

# Regions (x0,y0,x1,y1) normalized — white tag / string cleanup before bg removal
TAG_REGIONS: dict[str, list[tuple[float, float, float, float]]] = {
    "02-left-side.jpg": [(0.32, 0.42, 0.68, 0.82), (0.15, 0.72, 0.85, 0.98)],
    "04-right-side.jpg": [(0.42, 0.50, 0.62, 0.74)],
    "01-muzzle-front.jpg": [(0.30, 0.35, 0.55, 0.65)],
}


def upscale(img: Image.Image, target: int = CANVAS) -> Image.Image:
    long = max(img.size)
    if long >= target:
        return img
    scale = target / long
    return img.resize(
        (int(img.width * scale), int(img.height * scale)),
        Image.Resampling.LANCZOS,
    )


def pil_to_cv(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def cv_to_pil(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def inpaint_tags(img: Image.Image, regions: list[tuple[float, float, float, float]]) -> Image.Image:
    bgr = pil_to_cv(img)
    h, w = bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    for x0, y0, x1, y1 in regions:
        x0p, y0p, x1p, y1p = int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)
        roi = bgr[y0p:y1p, x0p:x1p]
        if roi.size == 0:
            continue
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        bright = cv2.inRange(hsv, (0, 0, 170), (180, 70, 255))
        mask[y0p:y1p, x0p:x1p] = cv2.bitwise_or(mask[y0p:y1p, x0p:x1p], bright)

    if mask.max() == 0:
        for x0, y0, x1, y1 in regions:
            cv2.rectangle(
                mask,
                (int(x0 * w), int(y0 * h)),
                (int(x1 * w), int(y1 * h)),
                255,
                -1,
            )

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.dilate(mask, kernel, iterations=2)
    cleaned = cv2.inpaint(bgr, mask, 5, cv2.INPAINT_TELEA)
    return cv_to_pil(cleaned)


def remove_background(img: Image.Image, session) -> Image.Image:
    out = remove(img.convert("RGBA"), session=session)
    return out if isinstance(out, Image.Image) else Image.open(out)


def foreground_ratio(cutout: Image.Image) -> float:
    alpha = np.array(cutout.split()[3])
    return float((alpha > 16).sum()) / alpha.size


def content_bbox(cutout: Image.Image) -> tuple[int, int, int, int]:
    alpha = cutout.split()[3]
    return alpha.getbbox() or (0, 0, cutout.width, cutout.height)


def defringe(cutout: Image.Image) -> Image.Image:
    arr = np.array(cutout)
    rgb, a = arr[..., :3], arr[..., 3]
    edge = (a > 0) & (a < 240)
    rgb[edge] = BG
    return Image.fromarray(np.dstack([rgb, a]), "RGBA")


def crop_and_center(cutout: Image.Image, size: int) -> Image.Image:
    bbox = content_bbox(cutout)
    cropped = cutout.crop(bbox)
    pad = int(max(cropped.width, cropped.height) * PADDING_RATIO)
    inner = size - pad * 2
    cropped.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (*BG, 255))
    x = (size - cropped.width) // 2
    y = (size - cropped.height) // 2
    canvas.paste(cropped, (x, y), cropped)
    return canvas


def studio_fallback(img: Image.Image, size: int) -> Image.Image:
    """When AI cutout fails: lighten backdrop, center crop, square canvas."""
    rgb = img.convert("RGB")
    arr = np.array(rgb, dtype=np.float32)
    h, w = arr.shape[:2]
    top = arr[: h // 3].reshape(-1, 3).mean(axis=0)
    bottom = arr[h * 2 // 3 :].reshape(-1, 3).mean(axis=0)
    bg = (top * 0.55 + bottom * 0.45).reshape(1, 1, 3)
    dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    fg = dist > 28
    ys, xs = np.where(fg)
    if len(xs) < 100:
        enhanced = enhance_rgb(rgb)
        canvas = Image.new("RGBA", (size, size), (*BG, 255))
        scaled = enhanced.copy()
        scaled.thumbnail((size, size), Image.Resampling.LANCZOS)
        x = (size - scaled.width) // 2
        y = (size - scaled.height) // 2
        canvas.paste(scaled, (x, y))
        return canvas

    x0, x1 = max(0, xs.min() - 20), min(w, xs.max() + 20)
    y0, y1 = max(0, ys.min() - 20), min(h, ys.max() + 20)
    crop = rgb.crop((x0, y0, x1, y1))
    crop = enhance_rgb(crop)
    pad = int(max(crop.width, crop.height) * PADDING_RATIO)
    inner = size - pad * 2
    crop.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (*BG, 255))
    cx = (size - crop.width) // 2
    cy = (size - crop.height) // 2
    canvas.paste(crop, (cx, cy))
    return canvas


def enhance_rgb(rgb: Image.Image) -> Image.Image:
    rgb = ImageOps.autocontrast(rgb, cutoff=1)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.1)
    rgb = ImageEnhance.Color(rgb).enhance(1.04)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.4)
    return rgb.filter(ImageFilter.UnsharpMask(radius=1.0, percent=90, threshold=3))


def enhance_rgba(img: Image.Image) -> Image.Image:
    rgb = enhance_rgb(img.convert("RGB"))
    out = Image.new("RGBA", rgb.size, (*BG, 255))
    out.paste(rgb, (0, 0))
    if img.mode == "RGBA":
        out.putalpha(img.split()[3])
    return out


def load_logo(path: Path) -> Image.Image:
    logo = Image.open(path).convert("RGBA")
    px = logo.load()
    w, h = logo.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 245 and g > 245 and b > 245:
                px[x, y] = (r, g, b, 0)
    return logo


def apply_watermark(base: Image.Image, logo: Image.Image) -> Image.Image:
    w = int(base.width * LOGO_WIDTH_RATIO)
    h = int(w * logo.height / logo.width)
    mark = logo.resize((w, h), Image.Resampling.LANCZOS)
    if LOGO_OPACITY < 1:
        alpha = mark.split()[3].point(lambda p: int(p * LOGO_OPACITY))
        mark.putalpha(alpha)
    x = base.width - w - LOGO_MARGIN
    y = base.height - h - LOGO_MARGIN
    out = base.copy()
    out.paste(mark, (x, y), mark)
    return out


def process_one(
    src: Path, dst: Path, logo: Image.Image, session, out_name: str
) -> None:
    print(f"  {src.name} -> {dst.name}")
    img = upscale(Image.open(src))
    regions = TAG_REGIONS.get(out_name, [])
    if regions:
        img = inpaint_tags(img, regions)
    cutout = remove_background(img, session)
    ratio = foreground_ratio(cutout)
    if ratio < MIN_FOREGROUND_RATIO:
        print(f"    cutout weak ({ratio:.1%}) — studio fallback")
        framed = studio_fallback(img, CANVAS)
    else:
        cutout = defringe(cutout)
        framed = crop_and_center(cutout, CANVAS)
        framed = enhance_rgba(framed)
    final = apply_watermark(framed, logo)
    dst.parent.mkdir(parents=True, exist_ok=True)
    final.convert("RGB").save(dst, "JPEG", quality=93, optimize=True, subsampling=0)


def main() -> None:
    logo_path = ASSETS / LOGO
    if not logo_path.is_file():
        print(f"Logo not found: {logo_path}", file=sys.stderr)
        sys.exit(1)

    logo = load_logo(logo_path)
    print("Loading rembg session (birefnet-general)...")
    session = new_session("birefnet-general")
    print(f"Output: {OUT_DIR}")

    for suffix, out_name in PHOTOS:
        try:
            src = resolve_asset(suffix)
        except FileNotFoundError:
            print(f"Missing: *{suffix}*", file=sys.stderr)
            continue
        process_one(src, OUT_DIR / out_name, logo, session, out_name)

    print("Done.")


if __name__ == "__main__":
    main()
