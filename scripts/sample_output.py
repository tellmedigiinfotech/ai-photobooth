"""
Generate a sample output from the production /api/generate endpoint, then
apply the same brand overlay client-side JS does (circular logo top-right
+ bilingual tagline plate bottom-center), and save the framed image.

Usage:
    python3 scripts/sample_output.py [presetId] [gender] [faceImagePath]
"""

import sys
import io
import json
import base64
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
LOGO_LEFT  = ASSETS / "brand" / "daams-logo.png"
LOGO_RIGHT = ASSETS / "brand" / "aakhon-dekha-final.png"
OUT_DIR = ROOT / "scripts" / "samples"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PROD = "https://ai-photobooth-zeta.vercel.app/api/generate"

ECZAR_BOLD    = ROOT / "scripts" / "fonts" / "Eczar-Bold.ttf"
ECZAR_REGULAR = ROOT / "scripts" / "fonts" / "Eczar-Regular.ttf"

# Preset id → display caption (mirrors the client-side preset.name)
PRESET_NAMES = {
    1:  "Khajuraho — Kandariya Mahadev",
    2:  "Khajuraho — Lakshmana Temple",
    3:  "Orchha — Jahangir Mahal",
    4:  "Orchha — Jahangir Gate",
    6:  "Maheshwar — Chhatri by the River",
    9:  "Krishnabai Holkar Chhatri",
    10: "Indore — Rajwada Palace",
    11: "Indore — Rajwada Courtyard",
    12: "Kheoni Sanctuary — Wilds of MP",
    13: "Kheoni Sanctuary — Forest Trail",
}


def load_eczar(size: int, *, bold: bool) -> ImageFont.FreeTypeFont:
    path = ECZAR_BOLD if bold else ECZAR_REGULAR
    if path.exists():
        return ImageFont.truetype(str(path), size=size)
    # Fallback chain
    for p in [
        "/System/Library/Fonts/Supplemental/Kohinoor.ttc",
        "/System/Library/Fonts/Kohinoor.ttc",
        "/Library/Fonts/NotoSansDevanagari-Regular.ttf",
    ]:
        if Path(p).exists():
            return ImageFont.truetype(p, size=size)
    return ImageFont.load_default()


def call_generate(face_path: Path, preset_id: int, gender: str) -> Image.Image:
    """Use system curl so we ride macOS' SSL trust store."""
    print(f"→ POST {PROD}  presetId={preset_id}  gender={gender}  face={face_path.name}")
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name
    proc = subprocess.run(
        [
            "curl", "-sS", "--fail-with-body", "--max-time", "120", PROD,
            "-F", f"userImage=@{face_path};type=image/jpeg",
            "-F", f"presetId={preset_id}",
            "-F", f"gender={gender}",
            "-o", tmp_path,
        ],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"curl failed ({proc.returncode}): {proc.stderr}\n{Path(tmp_path).read_text()[:500]}")
    payload = json.loads(Path(tmp_path).read_bytes())
    Path(tmp_path).unlink(missing_ok=True)
    if not payload.get("success"):
        raise RuntimeError(f"Generation failed: {payload}")
    if payload.get("note"):
        print(f"   note: {payload['note']}")
    img_bytes = base64.b64decode(payload["generatedImage"])
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def _draw_text_with_shadow(canvas: Image.Image, xy: tuple[int, int], text: str,
                           font: ImageFont.FreeTypeFont, fill: tuple[int, int, int, int],
                           shadow_blur: int, shadow_offset: int) -> None:
    """Render text with a soft drop shadow, no plate behind."""
    # Build the shadow on its own layer so it can blur cleanly
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.text((xy[0], xy[1] + shadow_offset), text, font=font, fill=(0, 0, 0, 180))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(shadow_blur))
    canvas.alpha_composite(shadow_layer)
    # Then the text on top
    text_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(text_layer).text(xy, text, font=font, fill=fill)
    canvas.alpha_composite(text_layer)


def _draw_circular_logo(canvas: Image.Image, logo_path: Path, cx: int, cy: int, diameter: int) -> None:
    """Clip a circular crop of the logo and paste, plus a soft shadow disc."""
    r = diameter // 2

    # Shadow disc (drawn into a separate layer so it can blur cleanly)
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    offset = round(diameter * 0.025)
    sd.ellipse(
        [cx - r, cy - r + offset, cx + r, cy + r + offset],
        fill=(0, 0, 0, 115),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(round(diameter * 0.06)))
    canvas.alpha_composite(shadow_layer)

    # Logo (clipped to a circle)
    logo = Image.open(logo_path).convert("RGBA").resize((diameter, diameter), Image.LANCZOS)
    mask = Image.new("L", (diameter, diameter), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, diameter, diameter], fill=255)
    canvas.paste(logo, (cx - r, cy - r), mask)


def apply_brand_overlay(photo: Image.Image, location_name: str) -> Image.Image:
    """Two circular logos (DAAMS left, Aakhon Dekha right) + location caption."""
    W, H = photo.size
    out = photo.convert("RGBA")

    # --- Two mirrored circular logo badges --------------------------------
    badge_d = round(W * 0.11)
    badge_r = badge_d // 2
    inset   = round(W * 0.03)
    cy      = round(H * 0.03 + badge_r)
    cx_left  = inset + badge_r
    cx_right = W - inset - badge_r

    _draw_circular_logo(out, LOGO_LEFT,  cx_left,  cy, badge_d)
    _draw_circular_logo(out, LOGO_RIGHT, cx_right, cy, badge_d)

    # --- Bottom gradient + location caption -------------------------------
    caption = (location_name or "").strip()
    if caption:
        # Gradient fade
        grad_h = round(H * 0.18)
        grad_top = H - grad_h
        grad_layer = Image.new("RGBA", (1, grad_h))
        for i in range(grad_h):
            t = i / max(1, grad_h - 1)
            if t < 0.55:
                alpha = round((t / 0.55) * 71)
            else:
                alpha = round(71 + ((t - 0.55) / 0.45) * (140 - 71))
            grad_layer.putpixel((0, i), (0, 0, 0, alpha))
        grad_layer = grad_layer.resize((W, grad_h), Image.BILINEAR)
        full_grad = Image.new("RGBA", out.size, (0, 0, 0, 0))
        full_grad.paste(grad_layer, (0, grad_top))
        out.alpha_composite(full_grad)

        # Caption
        caption_size = max(16, round(H * 0.022))
        font = load_eczar(caption_size, bold=True)
        bbox = font.getbbox(caption)
        cap_w = bbox[2] - bbox[0]
        # Place baseline ~5% from bottom; PIL uses top-left origin so y = bottom - font height
        caption_baseline_from_bottom = round(H * 0.05)
        # font.getbbox returns ink box; we want the visual block height
        cap_top = H - caption_baseline_from_bottom - caption_size
        cap_x = (W - cap_w) // 2

        shadow_blur   = max(3, round(H * 0.009))
        shadow_offset = max(1, round(H * 0.002))
        _draw_text_with_shadow(out, (cap_x, cap_top), caption, font,
                               (255, 255, 255, 255), shadow_blur, shadow_offset)

    return out.convert("RGB")


def main():
    preset_id = int(sys.argv[1]) if len(sys.argv) > 1 else 3   # Orchha — Jahangir Mahal
    gender    = sys.argv[2] if len(sys.argv) > 2 else "male"
    face_path = Path(sys.argv[3]) if len(sys.argv) > 3 else ASSETS / "templates" / f"{preset_id}-{gender}.jpg"

    if not face_path.exists():
        raise SystemExit(f"Face image not found: {face_path}")

    raw = call_generate(face_path, preset_id, gender)
    raw_out = OUT_DIR / f"sample-{preset_id}-{gender}-raw.jpg"
    raw.save(raw_out, "JPEG", quality=92)
    print(f"   raw saved:    {raw_out}")

    location = PRESET_NAMES.get(preset_id, f"Preset {preset_id}")
    branded = apply_brand_overlay(raw, location)
    branded_out = OUT_DIR / f"sample-{preset_id}-{gender}-branded.jpg"
    branded.save(branded_out, "JPEG", quality=92)
    print(f"   branded saved: {branded_out}  ({location})")


if __name__ == "__main__":
    main()
