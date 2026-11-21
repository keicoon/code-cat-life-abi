#!/usr/bin/env python3

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "sprites"
TMP = ROOT / ".tmp-preview"
OUTPUT = ROOT / "media" / "code-cat-life-abi-preview.gif"

CANVAS_W = 720
CANVAS_H = 360


def render_svg(svg_path: Path, size: int = 256, tint: str = "#ff00ff") -> Path:
    TMP.mkdir(parents=True, exist_ok=True)
    tinted_svg = TMP / f"{svg_path.stem}-{tint.lstrip('#')}.svg"
    svg_text = svg_path.read_text(encoding="utf-8")
    tinted_svg.write_text(
        re.sub(r'fill="[^"]+"', f'fill="{tint}"', svg_text),
        encoding="utf-8",
    )
    subprocess.run(
        ["qlmanage", "-t", "-s", str(size), "-o", str(TMP), str(tinted_svg)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return TMP / f"{tinted_svg.name}.png"


def restore_alpha(image: Image.Image, tint_rgb: tuple[int, int, int], final_rgb: tuple[int, int, int]) -> Image.Image:
    restored = Image.new("RGBA", image.size, (0, 0, 0, 0))
    source = image.convert("RGBA")
    restored_data = []
    zero_channels = [idx for idx, value in enumerate(tint_rgb) if value == 0]

    for r, g, b, _ in source.getdata():
        channels = [r, g, b]
        alpha = 255 if not zero_channels else int(sum(255 - channels[idx] for idx in zero_channels) / len(zero_channels))
        alpha = max(0, min(255, alpha))
        restored_data.append((*final_rgb, alpha))

    restored.putdata(restored_data)
    return restored


def load_sprite(
    filename: str,
    target_height: int,
    tint: str,
    tint_rgb: tuple[int, int, int],
    final_rgb: tuple[int, int, int],
) -> Image.Image:
    rendered = render_svg(SPRITES / filename, tint=tint)
    image = restore_alpha(Image.open(rendered), tint_rgb, final_rgb)
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    ratio = target_height / image.height
    target_width = max(1, int(image.width * ratio))
    return image.resize((target_width, target_height), Image.Resampling.LANCZOS)


def get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Supplemental/Menlo.ttc",
    ]:
        font_path = Path(path)
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size=size)
    return ImageFont.load_default()


def draw_editor_background(draw: ImageDraw.ImageDraw, font: ImageFont.ImageFont) -> None:
    draw.rounded_rectangle((18, 18, CANVAS_W - 18, CANVAS_H - 18), radius=18, fill="#111827", outline="#334155", width=2)
    draw.rounded_rectangle((18, 18, CANVAS_W - 18, 54), radius=18, fill="#0f172a")
    draw.text((36, 28), "code-cat-life-abi / src / cat-state-machine.ts", font=font, fill="#94a3b8")

    lines = [
        ("function chaseFish() {", 62, 94, "#e2e8f0"),
        ("  return cat.jump().eat(fish);", 112, 150, "#cbd5e1"),
        ("const nap = cat.sleep(sleepTime);", 40, 236, "#cbd5e1"),
    ]
    for text, x, y, color in lines:
        draw.text((x, y), text, font=font, fill=color)

    for x0, y0, x1 in [
        (58, 126, 304),
        (110, 182, 486),
        (38, 268, 422),
    ]:
        draw.line((x0, y0, x1, y0), fill="#38bdf8", width=2)


def compose_frame(
    cat: Image.Image,
    cat_xy: tuple[int, int],
    fish: Image.Image | None = None,
    fish_xy: tuple[int, int] | None = None,
) -> Image.Image:
    frame = Image.new("RGBA", (CANVAS_W, CANVAS_H), "#0b1120")
    draw = ImageDraw.Draw(frame)
    draw_editor_background(draw, get_font(22))

    if fish and fish_xy:
        frame.alpha_composite(fish, fish_xy)
    frame.alpha_composite(cat, cat_xy)
    return frame


def main() -> None:
    fish = load_sprite("fish.svg", 28, "#00ffff", (0, 255, 255), (250, 204, 21))
    sprites = {
        "surprise": load_sprite("cat_surprise_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "run0": load_sprite("cat_0_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "run1": load_sprite("cat_1_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "run2": load_sprite("cat_2_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "run3": load_sprite("cat_3_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "run4": load_sprite("cat_4_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "jump": load_sprite("cat_jump_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "eat0": load_sprite("cat_eat_0_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "eat1": load_sprite("cat_eat_1_right.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
        "sleep": load_sprite("cat_sleep.svg", 72, "#ff00ff", (255, 0, 255), (255, 255, 255)),
    }

    timeline = [
        ("surprise", (54, 203), (442, 154), 120),
        ("run0", (72, 203), (442, 154), 80),
        ("run1", (106, 203), (442, 154), 80),
        ("run2", (140, 203), (442, 154), 80),
        ("run3", (174, 203), (442, 154), 80),
        ("run4", (208, 203), (442, 154), 80),
        ("jump", (248, 180), (442, 154), 80),
        ("jump", (292, 148), (442, 154), 80),
        ("jump", (338, 126), (442, 154), 80),
        ("eat0", (366, 115), (442, 154), 120),
        ("eat1", (366, 115), None, 120),
        ("eat1", (366, 115), None, 120),
        ("sleep", (380, 115), None, 180),
        ("sleep", (380, 115), None, 180),
        ("sleep", (380, 115), None, 240),
    ]

    frames: list[Image.Image] = []
    durations: list[int] = []
    for key, cat_xy, fish_xy, duration in timeline:
        fish_image = fish if fish_xy else None
        frames.append(compose_frame(sprites[key], cat_xy, fish_image, fish_xy))
        durations.append(duration)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=True,
    )
    shutil.rmtree(TMP, ignore_errors=True)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
