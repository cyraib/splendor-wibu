#!/usr/bin/env python3
"""Generate a complete custom Splendor-style deck from local artwork.

The script never modifies source artwork or Minecraft material files. Generated
data and images are written below Assets/_created only.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageOps


# ---------------------------------------------------------------------------
# Reusable layout constants
# ---------------------------------------------------------------------------

CARD_WIDTH = 1024
CARD_HEIGHT = 1024
CORNER_RADIUS = 46

NAME_STRIP_X = 34
NAME_STRIP_Y = 43
NAME_STRIP_WIDTH = 56
NAME_STRIP_HEIGHT = 938

POINT_X = 104
POINT_Y = 42
POINT_BUBBLE_WIDTH = 112
POINT_BUBBLE_HEIGHT = 116

BONUS_X = 846
BONUS_Y = 42
BONUS_BUBBLE_SIZE = 136
BONUS_ICON_SIZE = 108

COST_X = 104
COST_BOTTOM_Y = 976
COST_SPACING = 109
COST_BUBBLE_WIDTH = 198
COST_BUBBLE_HEIGHT = 94
COST_ICON_SIZE = 70

NOBLE_REQ_X = 104
NOBLE_REQ_BOTTOM_Y = 976
NOBLE_REQ_SPACING = 122
NOBLE_REQ_BUBBLE_WIDTH = 202
NOBLE_REQ_BUBBLE_HEIGHT = 106
NOBLE_MINI_CARD_WIDTH = 64
NOBLE_MINI_CARD_HEIGHT = 82

BORDER_WIDTH = 5
ARTWORK_CENTERING = (0.5, 0.14)

GLASS_STYLES = {
    "A": {"fill_alpha": 70, "border_alpha": 142, "highlight_alpha": 165, "blur": 12},
    "B": {"fill_alpha": 46, "border_alpha": 208, "highlight_alpha": 224, "blur": 9},
}
DEFAULT_GLASS_STYLE = "B"

FRAME_PALETTES = {
    "tier1": {
        "shadow": (42, 22, 12, 225),
        "base": (112, 65, 34, 245),
        "mid": (169, 104, 55, 242),
        "light": (225, 166, 94, 220),
        "spark": (247, 208, 144, 205),
    },
    "tier2": {
        "shadow": (64, 73, 82, 225),
        "base": (151, 166, 179, 245),
        "mid": (211, 222, 229, 245),
        "light": (247, 252, 255, 235),
        "spark": (193, 231, 246, 220),
    },
    "tier3": {
        "shadow": (102, 56, 10, 232),
        "base": (190, 119, 19, 248),
        "mid": (239, 184, 48, 248),
        "light": (255, 232, 139, 238),
        "spark": (255, 249, 204, 228),
    },
    "noble": {
        "shadow": (48, 78, 102, 225),
        "base": (123, 203, 225, 242),
        "mid": (208, 242, 250, 248),
        "light": (252, 255, 255, 248),
        "spark": (255, 255, 255, 245),
    },
}


ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = ROOT / "Assets" / "Assets"
MATERIAL_ROOT = ROOT / "Assets đá"
OUTPUT_ROOT = ROOT / "Assets" / "_created"
DATASET_PATH = ROOT / "splendor_base_cards_nobles_codex.txt"

OUTPUT_DIRS = {
    "preview": OUTPUT_ROOT / "Preview",
    "preview_ui": OUTPUT_ROOT / "Preview_UI",
    "preview_covers": OUTPUT_ROOT / "Preview_Covers",
    "tier1": OUTPUT_ROOT / "Tier1",
    "tier2": OUTPUT_ROOT / "Tier2",
    "tier3": OUTPUT_ROOT / "Tier3",
    "nobles": OUTPUT_ROOT / "Nobles",
    "unassigned": OUTPUT_ROOT / "Unassigned",
}

CARD_CSV = OUTPUT_ROOT / "card_data.csv"
NOBLE_CSV = OUTPUT_ROOT / "nobles_data.csv"
VALIDATION_REPORT = OUTPUT_ROOT / "validation_report.txt"

CARD_HEADERS = [
    "id",
    "source_image",
    "tier",
    "points",
    "bonus",
    "quartz_cost",
    "diamond_cost",
    "emerald_cost",
    "gold_cost",
    "netherite_cost",
]
NOBLE_HEADERS = [
    "id",
    "source_image",
    "points",
    "quartz_req",
    "diamond_req",
    "emerald_req",
    "gold_req",
    "netherite_req",
]

ORIGINAL_TO_CUSTOM = {
    "white": "quartz",
    "blue": "diamond",
    "green": "emerald",
    "red": "gold",
    "black": "netherite",
}
CUSTOM_COLORS = ("quartz", "diamond", "emerald", "gold", "netherite")

MATERIAL_FILES = {
    "quartz": "Nether_Quartz_JE2_BE2.webp",
    "diamond": "Diamond_JE2_BE2.webp",
    "emerald": "Emerald_JE3_BE3.webp",
    "gold": "Gold_Ingot_JE4_BE2.webp",
    "netherite": "Netherite_Ingot_JE1_BE2.webp",
}

MINI_CARD_COLORS = {
    "quartz": (235, 231, 215, 255),
    "diamond": (40, 145, 206, 255),
    "emerald": (31, 151, 91, 255),
    "gold": (218, 155, 32, 255),
    "netherite": (42, 40, 47, 255),
}

DATASET_REFERENCE = (
    "Local: splendor_base_cards_nobles_codex.txt; exact row-by-row match "
    "verified 2026-09-23 against https://github.com/boardgamers/splendor/"
    "blob/main/packages/engine/src/data.ts (which documents cross-checks against "
    "bouk/splendimax and seal256/splendor)."
)


class ValidationError(RuntimeError):
    """Raised when a required validation gate fails."""


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)]


def image_files(folder: Path) -> list[Path]:
    suffixes = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
    return sorted(
        (p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in suffixes),
        key=natural_key,
    )


def relative_string(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def ensure_output_structure() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    for folder in OUTPUT_DIRS.values():
        folder.mkdir(parents=True, exist_ok=True)


def load_dataset() -> dict[str, Any]:
    try:
        return json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"Cannot load canonical dataset: {exc}") from exc


def source_folders() -> dict[int | str, Path]:
    return {
        1: SOURCE_ROOT / "Tier 1",
        2: SOURCE_ROOT / "Tier 2",
        3: SOURCE_ROOT / "Tier 3",
        "nobles": SOURCE_ROOT / "Nobles",
    }


def build_expected_rows(dataset: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    folders = source_folders()
    expected_counts = {1: 40, 2: 30, 3: 20, "nobles": 10}
    problems: list[str] = []
    artwork: dict[int | str, list[Path]] = {}

    for key, folder in folders.items():
        if not folder.is_dir():
            problems.append(f"Missing source folder: {folder}")
            artwork[key] = []
            continue
        artwork[key] = image_files(folder)
        if len(artwork[key]) != expected_counts[key]:
            problems.append(
                f"Artwork count mismatch in {folder}: {len(artwork[key])} / {expected_counts[key]}"
            )

    cards = dataset.get("development_cards", [])
    nobles = dataset.get("nobles", [])
    if len(cards) != 90:
        problems.append(f"Dataset development count: {len(cards)} / 90")
    if len(nobles) != 10:
        problems.append(f"Dataset noble count: {len(nobles)} / 10")
    if problems:
        raise ValidationError("; ".join(problems))

    card_rows: list[dict[str, Any]] = []
    for tier in (1, 2, 3):
        tier_cards = [card for card in cards if int(card["tier"]) == tier]
        if len(tier_cards) != len(artwork[tier]):
            raise ValidationError(f"Tier {tier} dataset/artwork mapping is not 1-to-1")
        for card, art in zip(tier_cards, artwork[tier], strict=True):
            cost = card["cost"]
            card_rows.append(
                {
                    "id": card["id"],
                    "source_image": relative_string(art),
                    "tier": tier,
                    "points": int(card["points"]),
                    "bonus": ORIGINAL_TO_CUSTOM[card["bonus"]],
                    "quartz_cost": int(cost["white"]),
                    "diamond_cost": int(cost["blue"]),
                    "emerald_cost": int(cost["green"]),
                    "gold_cost": int(cost["red"]),
                    "netherite_cost": int(cost["black"]),
                }
            )

    noble_rows: list[dict[str, Any]] = []
    if len(nobles) != len(artwork["nobles"]):
        raise ValidationError("Noble dataset/artwork mapping is not 1-to-1")
    for noble, art in zip(nobles, artwork["nobles"], strict=True):
        req = noble["requirement"]
        noble_rows.append(
            {
                "id": noble["id"],
                "source_image": relative_string(art),
                "points": int(noble["points"]),
                "quartz_req": int(req["white"]),
                "diamond_req": int(req["blue"]),
                "emerald_req": int(req["green"]),
                "gold_req": int(req["red"]),
                "netherite_req": int(req["black"]),
            }
        )
    return card_rows, noble_rows


def write_csv_if_allowed(
    path: Path,
    headers: list[str],
    rows: list[dict[str, Any]],
    overwrite: bool,
) -> None:
    if path.exists() and not overwrite:
        return
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def normalized_rows(rows: Iterable[dict[str, Any]], headers: list[str]) -> list[dict[str, str]]:
    return [{header: str(row[header]) for header in headers} for row in rows]


def inspect_image(path: Path) -> tuple[int, int, str, bool]:
    with Image.open(path) as image:
        alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
        return image.width, image.height, image.format or "unknown", alpha


def validate_all(
    expected_cards: list[dict[str, Any]],
    expected_nobles: list[dict[str, Any]],
) -> tuple[bool, list[str], list[str], dict[str, Any]]:
    errors: list[str] = []
    warnings: list[str] = []
    details: dict[str, Any] = {}

    for color, filename in MATERIAL_FILES.items():
        path = MATERIAL_ROOT / filename
        if not path.is_file():
            errors.append(f"Missing material asset for {color}: {path}")
            continue
        try:
            width, height, fmt, alpha = inspect_image(path)
            details.setdefault("materials", []).append((color, path, width, height, fmt, alpha))
            if not alpha:
                warnings.append(f"Material asset has no transparency: {path}")
            if min(width, height) < COST_ICON_SIZE:
                warnings.append(f"Material asset may be too small: {path} ({width}x{height})")
        except OSError as exc:
            errors.append(f"Unreadable material asset {path}: {exc}")

    source_details = []
    for row in [*expected_cards, *expected_nobles]:
        path = ROOT / row["source_image"]
        if not path.is_file():
            errors.append(f"Missing source artwork: {path}")
            continue
        try:
            width, height, fmt, alpha = inspect_image(path)
            source_details.append((path, width, height, fmt, alpha))
            if width < CARD_WIDTH or height < CARD_HEIGHT:
                warnings.append(f"Source artwork requires upscaling: {path} ({width}x{height})")
        except OSError as exc:
            errors.append(f"Unreadable source artwork {path}: {exc}")
    details["sources"] = source_details

    tier_counts = Counter(int(row["tier"]) for row in expected_cards)
    if len(expected_cards) != 90:
        errors.append(f"Development total is {len(expected_cards)}, expected 90")
    for tier, expected in ((1, 40), (2, 30), (3, 20)):
        if tier_counts[tier] != expected:
            errors.append(f"Tier {tier} count is {tier_counts[tier]}, expected {expected}")
    if len(expected_nobles) != 10:
        errors.append(f"Noble count is {len(expected_nobles)}, expected 10")

    bonus_by_tier: dict[int, Counter[str]] = {}
    for tier, expected_per_color in ((1, 8), (2, 6), (3, 4)):
        counter = Counter(row["bonus"] for row in expected_cards if int(row["tier"]) == tier)
        bonus_by_tier[tier] = counter
        for color in CUSTOM_COLORS:
            if counter[color] != expected_per_color:
                errors.append(
                    f"Tier {tier} {color} bonus count is {counter[color]}, expected {expected_per_color}"
                )
    total_bonus = Counter(row["bonus"] for row in expected_cards)
    for color in CUSTOM_COLORS:
        if total_bonus[color] != 18:
            errors.append(f"Total {color} bonus count is {total_bonus[color]}, expected 18")

    valid_point_ranges = {1: range(0, 2), 2: range(1, 4), 3: range(3, 6)}
    for row in expected_cards:
        tier = int(row["tier"])
        if int(row["points"]) not in valid_point_ranges[tier]:
            errors.append(f"Invalid points for {row['id']}: {row['points']}")
        costs = [int(row[f"{color}_cost"]) for color in CUSTOM_COLORS]
        if any(value < 0 for value in costs) or not any(value > 0 for value in costs):
            errors.append(f"Invalid costs for {row['id']}: {costs}")
    for row in expected_nobles:
        reqs = [int(row[f"{color}_req"]) for color in CUSTOM_COLORS]
        if int(row["points"]) != 3:
            errors.append(f"Noble {row['id']} does not have 3 points")
        nonzero = [value for value in reqs if value]
        if sorted(nonzero) not in ([4, 4], [3, 3, 3]):
            errors.append(f"Invalid noble pattern for {row['id']}: {reqs}")

    if not CARD_CSV.is_file():
        errors.append(f"Missing {CARD_CSV}")
    else:
        actual_cards = read_csv(CARD_CSV)
        if actual_cards != normalized_rows(expected_cards, CARD_HEADERS):
            errors.append("card_data.csv does not exactly match the verified local dataset/mapping")
    if not NOBLE_CSV.is_file():
        errors.append(f"Missing {NOBLE_CSV}")
    else:
        actual_nobles = read_csv(NOBLE_CSV)
        if actual_nobles != normalized_rows(expected_nobles, NOBLE_HEADERS):
            errors.append("nobles_data.csv does not exactly match the verified local dataset/mapping")

    details["tier_counts"] = tier_counts
    details["bonus_by_tier"] = bonus_by_tier
    details["total_bonus"] = total_bonus
    return not errors, errors, warnings, details


PIXEL_GLYPHS = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "10010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "00110", "00110"),
    "'": ("00100", "00100", "00000", "00000", "00000", "00000", "00000"),
    "?": ("01110", "10001", "00001", "00010", "00100", "00000", "00100"),
}


GLASS_TINTS = {
    "neutral": (226, 236, 242),
    "quartz": (236, 239, 235),
    "diamond": (120, 220, 242),
    "emerald": (111, 211, 158),
    "gold": (242, 203, 108),
    "netherite": (101, 103, 112),
}


def ascii_pixel_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).upper()


def pixel_text_image(
    value: str,
    scale: int,
    fill: tuple[int, int, int, int] = (255, 252, 238, 255),
    outline: tuple[int, int, int, int] = (12, 15, 19, 230),
    outline_width: int = 2,
) -> Image.Image:
    text_value = ascii_pixel_text(value)
    widths = [3 if ch == " " else 5 for ch in text_value]
    width = max(1, sum(widths) * scale + max(0, len(widths) - 1) * scale + outline_width * 2)
    height = 7 * scale + outline_width * 2
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    cursor = outline_width
    for ch, glyph_width in zip(text_value, widths, strict=True):
        if ch != " ":
            glyph = PIXEL_GLYPHS.get(ch, PIXEL_GLYPHS["?"])
            for gy, line in enumerate(glyph):
                for gx, bit in enumerate(line):
                    if bit != "1":
                        continue
                    x0 = cursor + gx * scale
                    y0 = outline_width + gy * scale
                    draw.rectangle(
                        (x0 - outline_width, y0 - outline_width, x0 + scale - 1 + outline_width, y0 + scale - 1 + outline_width),
                        fill=outline,
                    )
            for gy, line in enumerate(glyph):
                for gx, bit in enumerate(line):
                    if bit == "1":
                        x0 = cursor + gx * scale
                        y0 = outline_width + gy * scale
                        draw.rectangle((x0, y0, x0 + scale - 1, y0 + scale - 1), fill=fill)
        cursor += (glyph_width + 1) * scale
    return layer


def paste_centered(card: Image.Image, layer: Image.Image, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    card.alpha_composite(layer, (left + (right - left - layer.width) // 2, top + (bottom - top - layer.height) // 2))


def crop_transparent(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    return rgba.crop(bbox) if bbox else rgba


def contain_icon(image: Image.Image, size: int) -> Image.Image:
    icon = crop_transparent(image)
    icon.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(icon, ((size - icon.width) // 2, (size - icon.height) // 2))
    return canvas


def load_material_icons() -> dict[str, Image.Image]:
    icons: dict[str, Image.Image] = {}
    for color, filename in MATERIAL_FILES.items():
        with Image.open(MATERIAL_ROOT / filename) as image:
            icons[color] = image.convert("RGBA").copy()
    return icons


def cover_artwork(path: Path) -> Image.Image:
    with Image.open(path) as source:
        rgb = source.convert("RGB")
        return ImageOps.fit(
            rgb,
            (CARD_WIDTH, CARD_HEIGHT),
            method=Image.Resampling.LANCZOS,
            centering=ARTWORK_CENTERING,
        ).convert("RGBA")


def apply_glass(
    card: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    tint_name: str = "neutral",
    style_name: str = DEFAULT_GLASS_STYLE,
) -> None:
    """Apply true backdrop-blurred glass within a rounded mask."""
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    style = GLASS_STYLES[style_name]
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)

    full_mask = Image.new("L", card.size, 0)
    full_mask.paste(mask, (left, top))
    shadow_alpha = full_mask.filter(ImageFilter.GaussianBlur(12)).point(lambda p: p * 42 // 255)
    shadow = Image.new("RGBA", card.size, (5, 8, 12, 0))
    shadow.putalpha(shadow_alpha)
    shifted = Image.new("RGBA", card.size, (0, 0, 0, 0))
    shifted.alpha_composite(shadow, (3, 5))
    card.alpha_composite(shifted)

    region = card.crop(box).filter(ImageFilter.GaussianBlur(style["blur"]))
    tint = GLASS_TINTS[tint_name]
    tint_layer = Image.new("RGBA", region.size, (*tint, style["fill_alpha"]))
    region = Image.alpha_composite(region, tint_layer)
    card.paste(region, (left, top), mask)

    draw = ImageDraw.Draw(card, "RGBA")
    draw.rounded_rectangle(
        (left, top, right - 1, bottom - 1),
        radius=radius,
        outline=(255, 250, 236, style["border_alpha"]),
        width=2,
    )


def paste_with_shadow(card: Image.Image, icon: Image.Image, xy: tuple[int, int], blur: int = 8) -> None:
    shadow = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    shadow.putalpha(icon.getchannel("A").filter(ImageFilter.GaussianBlur(blur)))
    dark = Image.new("RGBA", icon.size, (0, 0, 0, 155))
    dark.putalpha(shadow.getchannel("A"))
    card.alpha_composite(dark, (xy[0] + 4, xy[1] + 5))
    card.alpha_composite(icon, xy)


def character_name(source: str) -> str:
    stem = Path(source).stem
    while Path(stem).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
        stem = Path(stem).stem
    # Ignore only the ordering prefix; keep meaningful names such as 2B.
    stem = re.sub(r"^\d+[ _-]+", "", stem, count=1)
    stem = re.sub(r"[ _-]+redrawn$", "", stem, flags=re.IGNORECASE)
    stem = re.sub(r"[_-]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return ascii_pixel_text(stem)


def draw_name_strip(card: Image.Image, source: str, style_name: str) -> None:
    box = (
        NAME_STRIP_X,
        NAME_STRIP_Y,
        NAME_STRIP_X + NAME_STRIP_WIDTH,
        NAME_STRIP_Y + NAME_STRIP_HEIGHT,
    )
    apply_glass(card, box, radius=28, style_name=style_name)
    name = character_name(source)
    max_length = NAME_STRIP_HEIGHT - 88
    scale = 5
    text_layer = pixel_text_image(name, scale=scale, outline_width=1)
    while text_layer.width > max_length and scale > 2:
        scale -= 1
        text_layer = pixel_text_image(name, scale=scale, outline_width=1)
    vertical = text_layer.rotate(90, expand=True, resample=Image.Resampling.NEAREST)
    paste_centered(card, vertical, box)


def draw_point(card: Image.Image, value: int, style_name: str) -> None:
    if value <= 0:
        return
    box = (POINT_X, POINT_Y, POINT_X + POINT_BUBBLE_WIDTH, POINT_Y + POINT_BUBBLE_HEIGHT)
    apply_glass(card, box, radius=35, style_name=style_name)
    paste_centered(card, pixel_text_image(str(value), scale=12, outline_width=3), box)


def draw_bonus(card: Image.Image, color: str, icons: dict[str, Image.Image], style_name: str) -> None:
    box = (BONUS_X, BONUS_Y, BONUS_X + BONUS_BUBBLE_SIZE, BONUS_Y + BONUS_BUBBLE_SIZE)
    apply_glass(card, box, radius=38, tint_name=color, style_name=style_name)
    icon_x = BONUS_X + (BONUS_BUBBLE_SIZE - BONUS_ICON_SIZE) // 2
    icon_y = BONUS_Y + (BONUS_BUBBLE_SIZE - BONUS_ICON_SIZE) // 2
    paste_with_shadow(card, contain_icon(icons[color], BONUS_ICON_SIZE), (icon_x, icon_y), blur=7)


def draw_costs(card: Image.Image, row: dict[str, Any], icons: dict[str, Image.Image], style_name: str) -> None:
    active = [(color, int(row[f"{color}_cost"])) for color in CUSTOM_COLORS if int(row[f"{color}_cost"]) > 0]
    start_y = COST_BOTTOM_Y - len(active) * COST_SPACING
    for index, (color, value) in enumerate(active):
        y = start_y + index * COST_SPACING
        box = (COST_X, y, COST_X + COST_BUBBLE_WIDTH, y + COST_BUBBLE_HEIGHT)
        apply_glass(card, box, radius=38, tint_name=color, style_name=style_name)
        icon_y = y + (COST_BUBBLE_HEIGHT - COST_ICON_SIZE) // 2
        paste_with_shadow(card, contain_icon(icons[color], COST_ICON_SIZE), (COST_X + 17, icon_y), blur=5)
        number_box = (COST_X + 111, y, COST_X + COST_BUBBLE_WIDTH - 8, y + COST_BUBBLE_HEIGHT)
        paste_centered(card, pixel_text_image(str(value), scale=7, outline_width=2), number_box)


def draw_mini_card(card: Image.Image, color: str, xy: tuple[int, int]) -> None:
    x, y = xy
    draw = ImageDraw.Draw(card, "RGBA")
    fill = MINI_CARD_COLORS[color]
    border = (249, 241, 215, 225) if color != "quartz" else (87, 82, 71, 230)
    draw.rounded_rectangle(
        (x, y, x + NOBLE_MINI_CARD_WIDTH, y + NOBLE_MINI_CARD_HEIGHT),
        radius=11,
        fill=(7, 9, 12, 110),
    )
    draw.rounded_rectangle(
        (x + 3, y + 2, x + NOBLE_MINI_CARD_WIDTH - 4, y + NOBLE_MINI_CARD_HEIGHT - 5),
        radius=9,
        fill=fill,
        outline=border,
        width=3,
    )
    # A restrained card-face inset makes the symbol read as a card, never a gem/token.
    inset = 10
    draw.rounded_rectangle(
        (x + inset, y + 13, x + NOBLE_MINI_CARD_WIDTH - inset, y + NOBLE_MINI_CARD_HEIGHT - 14),
        radius=6,
        outline=(255, 255, 255, 85) if color != "quartz" else (90, 84, 72, 70),
        width=2,
    )
    draw.line(
        (x + 13, y + 28, x + NOBLE_MINI_CARD_WIDTH - 13, y + 28),
        fill=(255, 255, 255, 105) if color != "quartz" else (90, 84, 72, 85),
        width=3,
    )


def draw_noble_requirements(card: Image.Image, row: dict[str, Any], style_name: str) -> None:
    active = [(color, int(row[f"{color}_req"])) for color in CUSTOM_COLORS if int(row[f"{color}_req"]) > 0]
    start_y = NOBLE_REQ_BOTTOM_Y - len(active) * NOBLE_REQ_SPACING
    for index, (color, value) in enumerate(active):
        y = start_y + index * NOBLE_REQ_SPACING
        box = (NOBLE_REQ_X, y, NOBLE_REQ_X + NOBLE_REQ_BUBBLE_WIDTH, y + NOBLE_REQ_BUBBLE_HEIGHT)
        apply_glass(card, box, radius=38, tint_name=color, style_name=style_name)
        mini_y = y + (NOBLE_REQ_BUBBLE_HEIGHT - NOBLE_MINI_CARD_HEIGHT) // 2
        draw_mini_card(card, color, (NOBLE_REQ_X + 17, mini_y))
        number_box = (NOBLE_REQ_X + 111, y, NOBLE_REQ_X + NOBLE_REQ_BUBBLE_WIDTH - 8, y + NOBLE_REQ_BUBBLE_HEIGHT)
        paste_centered(card, pixel_text_image(str(value), scale=7, outline_width=2), number_box)


def draw_diamond_ornament(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    radius_x: int,
    radius_y: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int],
) -> None:
    x, y = center
    points = [(x, y - radius_y), (x + radius_x, y), (x, y + radius_y), (x - radius_x, y)]
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=outline, width=2, joint="curve")


def draw_crystal_gem(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    size: int,
    palette: dict[str, tuple[int, int, int, int]],
) -> None:
    x, y = center
    outer = [(x, y - size), (x + size, y), (x, y + size), (x - size, y)]
    draw.polygon(outer, fill=(201, 238, 255, 245), outline=palette["light"])
    draw.polygon([(x, y - size), (x + size, y), (x, y)], fill=(242, 213, 255, 220))
    draw.polygon([(x + size, y), (x, y + size), (x, y)], fill=(116, 208, 251, 225))
    draw.polygon([(x, y + size), (x - size, y), (x, y)], fill=(169, 245, 235, 220))
    draw.polygon([(x - size, y), (x, y - size), (x, y)], fill=(253, 250, 255, 235))
    draw.line(outer + [outer[0]], fill=(255, 255, 255, 255), width=3, joint="curve")
    draw.line((x, y - size + 3, x, y + size - 3), fill=(255, 255, 255, 170), width=2)


def make_corner_ornament(
    frame_kind: str,
    palette: dict[str, tuple[int, int, int, int]],
    size: int = 124,
) -> Image.Image:
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile, "RGBA")

    # A corner plate tied into both rails gives the frame the carved reference silhouette.
    draw.polygon([(4, 4), (112, 4), (89, 20), (38, 24), (24, 39), (20, 90), (4, 112)], fill=palette["shadow"])
    draw.line((7, 10, 105, 10, 82, 22, 37, 27, 27, 38, 22, 84, 10, 105), fill=palette["mid"], width=5, joint="curve")
    draw.line((12, 15, 98, 15, 78, 26, 40, 31, 31, 41, 26, 78, 15, 98), fill=palette["light"], width=2, joint="curve")

    if frame_kind == "noble":
        draw_crystal_gem(draw, (31, 31), 24, palette)
        draw.arc((42, 8, 108, 52), 200, 340, fill=palette["light"], width=3)
        draw.arc((8, 42, 52, 108), 110, 250, fill=palette["light"], width=3)
        for cx, cy in ((67, 18), (94, 13), (18, 67), (13, 94)):
            draw_diamond_ornament(draw, (cx, cy), 5, 8, palette["mid"], palette["spark"])
    elif frame_kind == "tier3":
        # Royal scrollwork and a three-leaf crest.
        draw.arc((14, 14, 78, 78), 184, 344, fill=palette["light"], width=5)
        draw.arc((27, 27, 92, 92), 184, 344, fill=palette["mid"], width=3)
        draw.ellipse((22, 22, 40, 55), fill=palette["light"], outline=palette["spark"], width=2)
        draw.polygon([(39, 18), (51, 36), (39, 56), (29, 36)], fill=palette["mid"], outline=palette["light"])
        draw.ellipse((40, 22, 59, 55), fill=palette["light"], outline=palette["spark"], width=2)
    elif frame_kind == "tier2":
        draw.arc((13, 13, 81, 81), 180, 348, fill=palette["light"], width=4)
        draw.arc((28, 28, 96, 96), 180, 348, fill=palette["mid"], width=3)
        draw_diamond_ornament(draw, (32, 32), 15, 20, palette["base"], palette["light"])
        draw_diamond_ornament(draw, (32, 32), 6, 9, palette["light"], palette["spark"])
    else:
        # Warm carved wood with restrained green vine leaves.
        green_dark = (52, 85, 42, 240)
        green_light = (105, 139, 70, 235)
        draw.arc((16, 15, 91, 91), 180, 350, fill=palette["light"], width=4)
        draw.line((23, 78, 31, 59, 49, 42, 75, 28), fill=green_dark, width=4)
        leaves = (
            [(20, 73), (27, 61), (39, 62), (34, 73), (27, 78)],
            [(32, 57), (41, 46), (54, 49), (47, 59), (39, 64)],
            [(51, 42), (61, 30), (75, 33), (68, 44), (59, 49)],
            [(68, 30), (79, 18), (92, 22), (85, 33), (76, 38)],
        )
        for leaf in leaves:
            draw.polygon(leaf, fill=green_light, outline=green_dark)
        draw_diamond_ornament(draw, (31, 31), 11, 16, palette["mid"], palette["light"])
    return tile


def make_center_ornament(
    frame_kind: str,
    palette: dict[str, tuple[int, int, int, int]],
) -> Image.Image:
    tile = Image.new("RGBA", (120, 62), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile, "RGBA")
    if frame_kind == "noble":
        draw.line((3, 31, 42, 31), fill=palette["mid"], width=4)
        draw.line((78, 31, 117, 31), fill=palette["mid"], width=4)
        draw_crystal_gem(draw, (60, 31), 22, palette)
    elif frame_kind == "tier3":
        draw.arc((4, 11, 58, 53), 190, 340, fill=palette["light"], width=4)
        draw.arc((62, 11, 116, 53), 200, 350, fill=palette["light"], width=4)
        draw.polygon([(60, 5), (70, 22), (60, 55), (50, 22)], fill=palette["mid"], outline=palette["spark"])
        draw.polygon([(60, 22), (79, 17), (68, 34)], fill=palette["light"])
        draw.polygon([(60, 22), (41, 17), (52, 34)], fill=palette["light"])
    elif frame_kind == "tier2":
        draw.arc((5, 11, 56, 52), 190, 345, fill=palette["light"], width=3)
        draw.arc((64, 11, 115, 52), 195, 350, fill=palette["light"], width=3)
        draw_diamond_ornament(draw, (60, 31), 16, 23, palette["base"], palette["light"])
        draw_diamond_ornament(draw, (60, 31), 6, 9, palette["light"], palette["spark"])
    else:
        green_dark = (52, 85, 42, 240)
        green_light = (105, 139, 70, 235)
        draw.line((5, 31, 48, 31, 60, 18, 72, 31, 115, 31), fill=palette["light"], width=4)
        draw.polygon([(29, 27), (37, 15), (54, 19), (47, 30), (37, 34)], fill=green_light, outline=green_dark)
        draw.polygon([(66, 19), (83, 15), (91, 27), (82, 34), (72, 30)], fill=green_light, outline=green_dark)
        draw_diamond_ornament(draw, (60, 31), 10, 15, palette["mid"], palette["light"])
    return tile


def draw_tier_frame(card: Image.Image, frame_kind: str) -> None:
    palette = FRAME_PALETTES[frame_kind]
    overlay = Image.new("RGBA", card.size, (0, 0, 0, 0))

    glow_mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(glow_mask).rounded_rectangle(
        (4, 4, CARD_WIDTH - 5, CARD_HEIGHT - 5),
        radius=CORNER_RADIUS - 2,
        outline=145 if frame_kind != "noble" else 215,
        width=28,
    )
    glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(12 if frame_kind != "noble" else 17))
    glow = Image.new("RGBA", card.size, (*palette["spark"][:3], 0))
    glow.putalpha(glow_mask)
    overlay.alpha_composite(glow)

    draw = ImageDraw.Draw(overlay, "RGBA")
    draw.rounded_rectangle(
        (2, 2, CARD_WIDTH - 3, CARD_HEIGHT - 3),
        radius=CORNER_RADIUS,
        outline=palette["shadow"],
        width=34,
    )
    draw.rounded_rectangle(
        (5, 5, CARD_WIDTH - 6, CARD_HEIGHT - 6),
        radius=CORNER_RADIUS - 2,
        outline=palette["base"],
        width=25,
    )
    draw.rounded_rectangle(
        (11, 11, CARD_WIDTH - 12, CARD_HEIGHT - 12),
        radius=CORNER_RADIUS - 6,
        outline=palette["mid"],
        width=11,
    )
    draw.rounded_rectangle(
        (19, 19, CARD_WIDTH - 20, CARD_HEIGHT - 20),
        radius=CORNER_RADIUS - 10,
        outline=palette["light"],
        width=4,
    )
    draw.rounded_rectangle(
        (29, 29, CARD_WIDTH - 30, CARD_HEIGHT - 30),
        radius=CORNER_RADIUS - 14,
        outline=(*palette["shadow"][:3], 135),
        width=3,
    )

    # Engraved rail rhythm: wood grain, polished metal scrolls, or prismatic crystal facets.
    for pos in range(132, CARD_WIDTH - 112, 92):
        if frame_kind == "tier1":
            draw.line((pos - 30, 13, pos + 27, 20), fill=(*palette["light"][:3], 125), width=2)
            draw.line((pos - 25, CARD_HEIGHT - 14, pos + 31, CARD_HEIGHT - 21), fill=(*palette["shadow"][:3], 165), width=3)
        elif frame_kind == "noble":
            facet = (190, 237, 255, 118) if (pos // 92) % 2 else (239, 205, 255, 104)
            draw.polygon([(pos - 19, 9), (pos - 4, 9), (pos + 13, 24), (pos - 3, 24)], fill=facet)
            draw.polygon([(pos + 3, 9), (pos + 19, 9), (pos + 4, 24), (pos - 12, 24)], fill=(*palette["light"][:3], 82))
            draw.polygon(
                [(pos - 19, CARD_HEIGHT - 10), (pos - 4, CARD_HEIGHT - 10), (pos + 13, CARD_HEIGHT - 25), (pos - 3, CARD_HEIGHT - 25)],
                fill=facet,
            )
            draw.polygon(
                [(pos + 3, CARD_HEIGHT - 10), (pos + 19, CARD_HEIGHT - 10), (pos + 4, CARD_HEIGHT - 25), (pos - 12, CARD_HEIGHT - 25)],
                fill=(*palette["light"][:3], 82),
            )
        else:
            draw.arc((pos - 39, 5, pos + 7, 31), 190, 350, fill=(*palette["light"][:3], 155), width=3)
            draw.arc((pos - 7, 5, pos + 39, 31), 190, 350, fill=(*palette["mid"][:3], 150), width=3)
            draw.arc((pos - 39, CARD_HEIGHT - 32, pos + 7, CARD_HEIGHT - 6), 10, 170, fill=(*palette["light"][:3], 155), width=3)
            draw.arc((pos - 7, CARD_HEIGHT - 32, pos + 39, CARD_HEIGHT - 6), 10, 170, fill=(*palette["mid"][:3], 150), width=3)

    corner = make_corner_ornament(frame_kind, palette)
    overlay.alpha_composite(corner, (0, 0))
    overlay.alpha_composite(corner.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (CARD_WIDTH - corner.width, 0))
    overlay.alpha_composite(corner.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, CARD_HEIGHT - corner.height))
    overlay.alpha_composite(corner.rotate(180), (CARD_WIDTH - corner.width, CARD_HEIGHT - corner.height))

    center = make_center_ornament(frame_kind, palette)
    overlay.alpha_composite(center, ((CARD_WIDTH - center.width) // 2, 0))
    overlay.alpha_composite(center.transpose(Image.Transpose.FLIP_TOP_BOTTOM), ((CARD_WIDTH - center.width) // 2, CARD_HEIGHT - center.height))
    side_center = center.rotate(90, expand=True)
    overlay.alpha_composite(side_center, (0, (CARD_HEIGHT - side_center.height) // 2))
    overlay.alpha_composite(side_center.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (CARD_WIDTH - side_center.width, (CARD_HEIGHT - side_center.height) // 2))

    if frame_kind == "noble":
        for x, y in ((79, 79), (CARD_WIDTH - 80, 79), (79, CARD_HEIGHT - 80), (CARD_WIDTH - 80, CARD_HEIGHT - 80)):
            draw.line((x - 13, y, x + 13, y), fill=palette["spark"], width=3)
            draw.line((x, y - 13, x, y + 13), fill=palette["spark"], width=3)

    card.alpha_composite(overlay)


def finish_card(card: Image.Image, frame_kind: str) -> Image.Image:
    draw_tier_frame(card, frame_kind)
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, CARD_WIDTH - 1, CARD_HEIGHT - 1), radius=CORNER_RADIUS, fill=255)
    card.putalpha(mask)
    return card


def render_development(
    row: dict[str, Any],
    destination: Path,
    icons: dict[str, Image.Image],
    style_name: str = DEFAULT_GLASS_STYLE,
    frame_kind: str | None = None,
) -> None:
    card = cover_artwork(ROOT / row["source_image"])
    draw_name_strip(card, str(row["source_image"]), style_name)
    draw_point(card, int(row["points"]), style_name)
    draw_bonus(card, str(row["bonus"]), icons, style_name)
    draw_costs(card, row, icons, style_name)
    selected_frame = frame_kind or f"tier{int(row['tier'])}"
    finish_card(card, selected_frame).save(destination, format="PNG", optimize=True)


def render_noble(
    row: dict[str, Any],
    destination: Path,
    style_name: str = DEFAULT_GLASS_STYLE,
    frame_kind: str = "noble",
) -> None:
    card = cover_artwork(ROOT / row["source_image"])
    draw_name_strip(card, str(row["source_image"]), style_name)
    draw_point(card, int(row["points"]), style_name)
    draw_noble_requirements(card, row, style_name)
    finish_card(card, frame_kind).save(destination, format="PNG", optimize=True)


def clean_stem(source: str) -> str:
    stem = Path(source).stem
    while Path(stem).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
        stem = Path(stem).stem
    return re.sub(r"[^\w.() -]+", "_", stem, flags=re.UNICODE).strip(" .") or "artwork"


def output_name(row: dict[str, Any]) -> str:
    ident = str(row["id"]).replace("-", "_")
    return f"{ident}_{clean_stem(str(row['source_image']))}.png"


def save_if_allowed(
    row: dict[str, Any],
    destination: Path,
    icons: dict[str, Image.Image],
    noble: bool,
    overwrite: bool,
) -> str:
    if destination.exists() and not overwrite:
        return "skipped"
    if noble:
        render_noble(row, destination)
    else:
        render_development(row, destination, icons)
    return "rendered"


def validate_rendered_image(path: Path) -> str | None:
    if not path.is_file():
        return f"Missing rendered image: {path}"
    try:
        with Image.open(path) as image:
            if image.size != (CARD_WIDTH, CARD_HEIGHT):
                return f"Wrong rendered dimensions for {path}: {image.size}"
            if image.format != "PNG":
                return f"Wrong rendered format for {path}: {image.format}"
            extrema = image.convert("RGB").getextrema()
            if all(low == high for low, high in extrema):
                return f"Rendered image appears blank: {path}"
    except OSError as exc:
        return f"Unreadable rendered image {path}: {exc}"
    return None


def render_previews(
    cards: list[dict[str, Any]],
    nobles: list[dict[str, Any]],
    icons: dict[str, Image.Image],
    overwrite: bool,
) -> tuple[bool, int, int, list[str]]:
    selections = [
        next(row for row in cards if row["id"] == "T1-05"),
        next(row for row in cards if row["id"] == "T2-03"),
        next(row for row in cards if row["id"] == "T3-01"),
        next(row for row in nobles if row["id"] == "N-06"),
    ]
    rendered = skipped = 0
    errors: list[str] = []
    for row in selections:
        noble = str(row["id"]).startswith("N-")
        destination = OUTPUT_DIRS["preview"] / output_name(row)
        state = save_if_allowed(row, destination, icons, noble, overwrite)
        rendered += state == "rendered"
        skipped += state == "skipped"
        problem = validate_rendered_image(destination)
        if problem:
            errors.append(problem)
    return not errors, rendered, skipped, errors


def render_ui_previews(
    cards: list[dict[str, Any]],
    icons: dict[str, Image.Image],
    overwrite: bool,
) -> tuple[bool, int, int, list[str]]:
    """Render the requested Echidna A/B glass comparison."""
    row = next(item for item in cards if item["id"] == "T1-02")
    variants = (("A", "Echidna_glass_A.png"), ("B", "Echidna_glass_B.png"))
    rendered = skipped = 0
    errors: list[str] = []
    for style_name, filename in variants:
        destination = OUTPUT_DIRS["preview_ui"] / filename
        try:
            if destination.exists() and not overwrite:
                skipped += 1
            else:
                render_development(row, destination, icons, style_name=style_name)
                rendered += 1
            problem = validate_rendered_image(destination)
            if problem:
                errors.append(problem)
        except Exception as exc:
            errors.append(f"UI preview {style_name}: {exc}")
    return not errors, rendered, skipped, errors


def render_cover_previews(
    cards: list[dict[str, Any]],
    icons: dict[str, Image.Image],
    overwrite: bool,
) -> tuple[bool, int, int, list[str]]:
    """Render one character with all four frame materials plus a 2x2 showcase."""
    row = next(item for item in cards if item["id"] == "T1-02")
    variants = (
        ("tier1", "Echidna_Tier1_wood.png"),
        ("tier2", "Echidna_Tier2_silver.png"),
        ("tier3", "Echidna_Tier3_gold.png"),
        ("noble", "Echidna_Noble_diamond.png"),
    )
    rendered = skipped = 0
    errors: list[str] = []
    paths: list[Path] = []
    for frame_kind, filename in variants:
        destination = OUTPUT_DIRS["preview_covers"] / filename
        paths.append(destination)
        try:
            if destination.exists() and not overwrite:
                skipped += 1
            else:
                render_development(row, destination, icons, frame_kind=frame_kind)
                rendered += 1
            problem = validate_rendered_image(destination)
            if problem:
                errors.append(problem)
        except Exception as exc:
            errors.append(f"Cover preview {frame_kind}: {exc}")

    showcase = OUTPUT_DIRS["preview_covers"] / "Echidna_frames_showcase.png"
    try:
        if showcase.exists() and not overwrite:
            skipped += 1
        elif not errors:
            canvas = Image.new("RGBA", (2048, 2048), (11, 16, 23, 255))
            background = ImageDraw.Draw(canvas, "RGBA")
            for y in range(2048):
                shade = int(18 * (1 - abs(y - 1024) / 1024))
                background.line((0, y, 2048, y), fill=(8 + shade // 3, 13 + shade // 2, 22 + shade, 255))

            path_by_kind = {kind: path for (kind, _), path in zip(variants, paths, strict=True)}
            showcase_items = (
                ("noble", "NOBLE", (65, 22)),
                ("tier3", "TIER 3", (1083, 22)),
                ("tier2", "TIER 2", (65, 1025)),
                ("tier1", "TIER 1", (1083, 1025)),
            )
            tile_size = 900
            for frame_kind, label, position in showcase_items:
                with Image.open(path_by_kind[frame_kind]) as image:
                    tile = image.convert("RGBA").resize((tile_size, tile_size), Image.Resampling.LANCZOS)
                shadow = Image.new("RGBA", (tile_size + 34, tile_size + 34), (0, 0, 0, 0))
                shadow_mask = tile.getchannel("A").resize((tile_size, tile_size)).filter(ImageFilter.GaussianBlur(18))
                shadow.putalpha(ImageOps.expand(shadow_mask, border=17, fill=0))
                dark_shadow = Image.new("RGBA", shadow.size, (0, 0, 0, 120))
                dark_shadow.putalpha(shadow.getchannel("A").point(lambda p: p * 110 // 255))
                canvas.alpha_composite(dark_shadow, (position[0] - 17, position[1] - 11))
                canvas.alpha_composite(tile, position)

                label_layer = pixel_text_image(label, scale=7, outline_width=2)
                label_x = position[0] + (tile_size - label_layer.width) // 2
                label_y = position[1] + tile_size + 24
                canvas.alpha_composite(label_layer, (label_x, label_y))
                accent = FRAME_PALETTES[frame_kind]["mid"]
                label_center = position[0] + tile_size // 2
                line_y = label_y + label_layer.height // 2
                background.line((position[0] + 150, line_y, label_x - 20, line_y), fill=accent, width=2)
                background.line((label_x + label_layer.width + 20, line_y, position[0] + tile_size - 150, line_y), fill=accent, width=2)
                draw_diamond_ornament(background, (label_center - label_layer.width // 2 - 35, line_y), 5, 7, accent, FRAME_PALETTES[frame_kind]["light"])
                draw_diamond_ornament(background, (label_center + label_layer.width // 2 + 35, line_y), 5, 7, accent, FRAME_PALETTES[frame_kind]["light"])
            canvas.save(showcase, format="PNG", optimize=True)
            rendered += 1
    except Exception as exc:
        errors.append(f"Cover showcase: {exc}")
    return not errors, rendered, skipped, errors


def render_full_deck(
    cards: list[dict[str, Any]],
    nobles: list[dict[str, Any]],
    icons: dict[str, Image.Image],
    overwrite: bool,
) -> tuple[int, int, list[str]]:
    rendered = skipped = 0
    errors: list[str] = []
    for tier in (1, 2, 3):
        tier_rows = [row for row in cards if int(row["tier"]) == tier]
        folder = OUTPUT_DIRS[f"tier{tier}"]
        for index, row in enumerate(tier_rows, start=1):
            print(f"[{index}/{len(tier_rows)}] Tier{tier} {Path(row['source_image']).name}")
            destination = folder / output_name(row)
            try:
                state = save_if_allowed(row, destination, icons, False, overwrite)
                rendered += state == "rendered"
                skipped += state == "skipped"
                problem = validate_rendered_image(destination)
                if problem:
                    errors.append(problem)
            except Exception as exc:  # continue the batch and report individual failures
                errors.append(f"{row['id']}: {exc}")
    for index, row in enumerate(nobles, start=1):
        print(f"[{index}/{len(nobles)}] Nobles {Path(row['source_image']).name}")
        destination = OUTPUT_DIRS["nobles"] / output_name(row)
        try:
            state = save_if_allowed(row, destination, icons, True, overwrite)
            rendered += state == "rendered"
            skipped += state == "skipped"
            problem = validate_rendered_image(destination)
            if problem:
                errors.append(problem)
        except Exception as exc:
            errors.append(f"{row['id']}: {exc}")
    return rendered, skipped, errors


def rendered_counts() -> dict[str, int]:
    return {
        "Tier1": len(list(OUTPUT_DIRS["tier1"].glob("*.png"))),
        "Tier2": len(list(OUTPUT_DIRS["tier2"].glob("*.png"))),
        "Tier3": len(list(OUTPUT_DIRS["tier3"].glob("*.png"))),
        "Nobles": len(list(OUTPUT_DIRS["nobles"].glob("*.png"))),
        "Preview": len(list(OUTPUT_DIRS["preview"].glob("*.png"))),
        "Preview_UI": len(list(OUTPUT_DIRS["preview_ui"].glob("*.png"))),
        "Preview_Covers": len(list(OUTPUT_DIRS["preview_covers"].glob("*.png"))),
    }


def write_validation_report(
    valid: bool,
    errors: list[str],
    warnings: list[str],
    details: dict[str, Any],
    preview_pass: bool | None,
    render_errors: list[str],
) -> None:
    source_counts = {key: len(image_files(folder)) if folder.is_dir() else 0 for key, folder in source_folders().items()}
    counts = rendered_counts()
    all_render_errors = [*render_errors]
    expected_output = {"Tier1": 40, "Tier2": 30, "Tier3": 20, "Nobles": 10}
    render_complete = all(counts[key] == expected for key, expected in expected_output.items())
    invalid_full_outputs = []
    for key in expected_output:
        folder_key = key.casefold()
        for image_path in OUTPUT_DIRS[folder_key].glob("*.png"):
            problem = validate_rendered_image(image_path)
            if problem:
                invalid_full_outputs.append(problem)
    if invalid_full_outputs:
        render_complete = False
        all_render_errors.append(
            f"Full-deck output integrity mismatches: {len(invalid_full_outputs)} file(s); first: {invalid_full_outputs[0]}"
        )
    preview_files = sorted(OUTPUT_DIRS["preview"].glob("*.png"))
    if preview_pass is None and len(preview_files) == 4:
        preview_pass = all(validate_rendered_image(path) is None for path in preview_files)
    if any(counts[key] not in (0, expected) for key, expected in expected_output.items()):
        all_render_errors.append("One or more full-deck output folders have partial counts")

    lines = [
        "SOURCE FILES",
        f"Tier1: {source_counts[1]} images",
        f"Tier2: {source_counts[2]} images",
        f"Tier3: {source_counts[3]} images",
        f"Nobles: {source_counts['nobles']} images",
        "All source artwork is mapped one-to-one by natural/alphabetical filename order within its existing folder.",
        "",
        "MATERIAL ASSETS",
    ]
    for color, path, width, height, fmt, alpha in details.get("materials", []):
        lines.append(f"{color}: {path.name} | {width}x{height} {fmt} | transparency={alpha}")
    lines.extend(
        [
            "",
            "FRAME STYLES",
            "Tier1: warm carved wood",
            "Tier2: cool polished silver",
            "Tier3: royal luminous gold",
            "Nobles: bright diamond/crystal with restrained sparkles",
            "",
            "DATASET SOURCE",
            DATASET_REFERENCE,
            "",
            "CARD COUNTS",
            f"Tier1: {source_counts[1]} / 40",
            f"Tier2: {source_counts[2]} / 30",
            f"Tier3: {source_counts[3]} / 20",
            f"Nobles: {source_counts['nobles']} / 10",
            "",
            "BONUS DISTRIBUTION",
        ]
    )
    for color in CUSTOM_COLORS:
        tier_values = [details.get("bonus_by_tier", {}).get(tier, Counter())[color] for tier in (1, 2, 3)]
        total = details.get("total_bonus", Counter())[color]
        lines.append(f"{color.title()}: Tier1={tier_values[0]}, Tier2={tier_values[1]}, Tier3={tier_values[2]}, Total={total}")
    lines.extend(
        [
            "",
            "DATA VALIDATION",
            "PASS" if valid else "FAIL",
            "",
            "ARTWORK MAPPING",
            "PASS" if sum(source_counts.values()) == 100 else "FAIL",
            "",
            "PREVIEW",
            "NOT RUN" if preview_pass is None else ("PASS" if preview_pass else "FAIL"),
            f"Preview files: {counts['Preview']} / 4",
            f"Preview_UI files: {counts['Preview_UI']} / 2",
            f"Preview_Covers files: {counts['Preview_Covers']} / 5",
            "",
            "RENDER",
            "PASS" if render_complete and not all_render_errors else ("NOT RUN" if sum(counts[k] for k in expected_output) == 0 else "FAIL"),
            f"Tier1: {counts['Tier1']} / 40",
            f"Tier2: {counts['Tier2']} / 30",
            f"Tier3: {counts['Tier3']} / 20",
            f"Nobles: {counts['Nobles']} / 10",
            "",
            "UNASSIGNED FILES",
            "None",
            "",
            "WARNINGS",
        ]
    )
    lines.extend(f"- {warning}" for warning in warnings)
    if not warnings:
        lines.append("None")
    lines.extend(["", "ERRORS"])
    lines.extend(f"- {error}" for error in [*errors, *all_render_errors])
    if not errors and not all_render_errors:
        lines.append("None")
    VALIDATION_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--preview", action="store_true", help="Validate and render four representative previews")
    mode.add_argument("--ui-preview", action="store_true", help="Render the Echidna glass A/B comparison")
    mode.add_argument("--cover-preview", action="store_true", help="Render Echidna with all four tier frames")
    mode.add_argument("--all", action="store_true", help="Validate, render previews, then render all 100 cards")
    mode.add_argument("--validate", action="store_true", help="Build/verify CSV files and write the validation report")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite generated CSV/images; alone it implies --all")
    return parser.parse_args()


def main() -> int:
    # Windows may inherit a legacy console code page even though paths and CSVs
    # are UTF-8. Keep Vietnamese and accented filenames loggable.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    args = parse_args()
    if not (args.preview or args.ui_preview or args.cover_preview or args.all or args.validate):
        if args.overwrite:
            args.all = True
        else:
            print("Choose --validate, --preview, --ui-preview, --cover-preview, --all, or --overwrite", file=sys.stderr)
            return 2

    ensure_output_structure()
    preview_pass: bool | None = None
    render_errors: list[str] = []
    warnings: list[str] = []
    details: dict[str, Any] = {}

    try:
        dataset = load_dataset()
        expected_cards, expected_nobles = build_expected_rows(dataset)
        write_csv_if_allowed(CARD_CSV, CARD_HEADERS, expected_cards, args.overwrite)
        write_csv_if_allowed(NOBLE_CSV, NOBLE_HEADERS, expected_nobles, args.overwrite)
        valid, errors, warnings, details = validate_all(expected_cards, expected_nobles)
    except ValidationError as exc:
        valid = False
        errors = [str(exc)]
        expected_cards, expected_nobles = [], []

    if not valid:
        write_validation_report(False, errors, warnings, details, None, [])
        print("DATA VALIDATION FAIL")
        for error in errors:
            print(f"ERROR: {error}")
        print(f"Report: {VALIDATION_REPORT}")
        return 1

    print("DATA VALIDATION PASS")
    print("Development cards: 90 (Tier1=40, Tier2=30, Tier3=20)")
    print("Nobles: 10")
    print("Bonus distribution: 18 per material (8/6/4 by tier)")

    if args.preview or args.ui_preview or args.cover_preview or args.all:
        icons = load_material_icons()

    if args.ui_preview:
        ui_pass, ui_rendered, ui_skipped, ui_errors = render_ui_previews(
            expected_cards, icons, args.overwrite
        )
        render_errors.extend(ui_errors)
        print(f"UI preview generation: {'PASS' if ui_pass else 'FAIL'} ({ui_rendered} rendered, {ui_skipped} existing)")
        if not ui_pass:
            write_validation_report(valid, errors, warnings, details, None, render_errors)
            return 1

    if args.cover_preview:
        cover_pass, cover_rendered, cover_skipped, cover_errors = render_cover_previews(
            expected_cards, icons, args.overwrite
        )
        render_errors.extend(cover_errors)
        print(
            f"Cover preview generation: {'PASS' if cover_pass else 'FAIL'} "
            f"({cover_rendered} rendered, {cover_skipped} existing)"
        )
        if not cover_pass:
            write_validation_report(valid, errors, warnings, details, None, render_errors)
            return 1

    if args.preview or args.all:
        preview_pass, preview_rendered, preview_skipped, preview_errors = render_previews(
            expected_cards, expected_nobles, icons, args.overwrite
        )
        render_errors.extend(preview_errors)
        print(f"Preview generation: {'PASS' if preview_pass else 'FAIL'} ({preview_rendered} rendered, {preview_skipped} existing)")
        if not preview_pass:
            write_validation_report(valid, errors, warnings, details, preview_pass, render_errors)
            return 1

        if args.all:
            rendered, skipped, full_errors = render_full_deck(
                expected_cards, expected_nobles, icons, args.overwrite
            )
            render_errors.extend(full_errors)
            print(f"Batch files: {rendered} rendered, {skipped} existing")

    write_validation_report(valid, errors, warnings, details, preview_pass, render_errors)
    counts = rendered_counts()
    print("Development cards rendered:", counts["Tier1"] + counts["Tier2"] + counts["Tier3"])
    print("Tier1:", counts["Tier1"])
    print("Tier2:", counts["Tier2"])
    print("Tier3:", counts["Tier3"])
    print("Nobles:", counts["Nobles"])
    print("Errors:", len(errors) + len(render_errors))
    print("Warnings:", len(warnings))
    print(f"Validation report: {VALIDATION_REPORT}")
    return 1 if render_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
