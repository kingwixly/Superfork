#!/usr/bin/env python3
"""
SuperFront's free cosmetics catalog.

OpenFront's cosmetics (patterns, crowns, skins, effects) all live in its closed
catalog server; none ship with the game. SuperFront has no such server, so this
script builds a catalog of original items in the same CosmeticsSchema format and
everyone owns all of it (see packages/shared/src/BundledCosmetics.ts).

Writes:
  resources/cosmetics/superfront.json
  resources/cosmetics/crowns/<name>.svg   (square, replaces the 1st-place crown)
  resources/cosmetics/skins/<name>.png    (1024px stamp over the territory)

Run from the repo root:  python3 scripts/superfront-cosmetics/generate.py
"""
import base64
import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "resources", "cosmetics")


def item(name, rarity, **extra):
    return {"name": name, "product": None, "rarity": rarity, "artist": "SuperFront", **extra}


# --------------------------------------------------------------------------
# Patterns. Encoding (PatternDecoder.decodePatternData): byte0 = version 0,
# byte1 = scale | ((w-2) & 31) << 3, byte2 = ((w-2) >> 5) & 3 | (h-2) << 2,
# then w*h bits, LSB first; a 0 bit is the primary colour, 1 the secondary.
# --------------------------------------------------------------------------
def encode(w, h, scale, fn):
    assert 2 <= w <= 129 and 2 <= h <= 65 and 0 <= scale <= 7
    bits = bytearray((w * h + 7) // 8)
    for y in range(h):
        for x in range(w):
            if fn(x, y):
                i = y * w + x
                bits[i >> 3] |= 1 << (i & 7)
    head = bytes([0, scale | (((w - 2) & 31) << 3), (((w - 2) >> 5) & 3) | ((h - 2) << 2)])
    return base64.urlsafe_b64encode(head + bytes(bits)).decode().rstrip("=")


def camo(seed, w, h, blobs, rmin, rmax):
    rnd = random.Random(seed)
    pts = [(rnd.uniform(0, w), rnd.uniform(0, h), rnd.uniform(rmin, rmax)) for _ in range(blobs)]

    def fn(x, y):
        for px, py, r in pts:
            dx = min(abs(x - px), w - abs(x - px))  # wraps, so tiles seamlessly
            dy = min(abs(y - py), h - abs(y - py))
            if dx * dx + dy * dy < r * r:
                return True
        return False

    return fn


def hexagon(x, y):
    # Honeycomb: Voronoi edges of a hex lattice that tiles a 26x15 repeat.
    w, h = 26, 15
    centers = [(0, 0), (13, 7.5)]
    ds = []
    for cx, cy in centers:
        for ox in (-w, 0, w):
            for oy in (-h, 0, h):
                ds.append(math.hypot(x + 0.5 - (cx + ox), (y + 0.5 - (cy + oy)) * 1.0))
    ds.sort()
    return ds[1] - ds[0] < 1.1


PATTERNS = {
    # name: (rarity, w, h, scale, fn, palettes)
    "pinstripe": ("common", 6, 2, 0, lambda x, y: x % 6 == 0,
                  ["navy_gold", "crimson_ivory", "forest_bark"]),
    "diagonal_bands": ("common", 16, 16, 0, lambda x, y: (x + y) % 16 < 5,
                       ["crimson_ivory", "ocean_foam", "ember_ash", "royal_gold"]),
    "checkerboard": ("common", 8, 8, 0, lambda x, y: (x < 4) != (y < 4),
                     ["midnight_steel", "crimson_ivory", "sand_dune"]),
    "polka": ("uncommon", 10, 10, 0, lambda x, y: (x - 4.5) ** 2 + (y - 4.5) ** 2 < 6.5,
              ["royal_gold", "ocean_foam", "rose_cream", "forest_bark"]),
    "chevron": ("uncommon", 16, 8, 0, lambda x, y: (y + abs((x % 16) - 8)) % 8 < 3,
                ["ember_ash", "navy_gold", "glacier_white"]),
    "brickwork": ("uncommon", 12, 6, 0,
                  lambda x, y: y % 3 == 0 or (x + (6 if y >= 3 else 0)) % 12 == 0,
                  ["ember_ash", "sand_dune", "midnight_steel"]),
    "honeycomb": ("rare", 26, 15, 0, hexagon, ["royal_gold", "sand_dune", "toxic_night"]),
    "waves": ("rare", 24, 12, 0,
              lambda x, y: abs(y - (6 + 3.2 * math.sin(x / 24 * 2 * math.pi))) < 1.3,
              ["ocean_foam", "glacier_white", "navy_gold"]),
    "argyle": ("rare", 16, 16, 0,
               lambda x, y: (abs(x - 7.5) / 8 + abs(y - 7.5) / 8) < 0.62 or x == y or x == 15 - y,
               ["crimson_ivory", "forest_bark", "rose_cream"]),
    "woodland_camo": ("epic", 48, 48, 1, camo(7, 48, 48, 26, 3, 7),
                      ["forest_bark", "sand_dune", "midnight_steel", "glacier_white"]),
    "starfield": ("epic", 20, 20, 0,
                  lambda x, y: (x, y) in {(3, 4), (12, 2), (16, 11), (7, 14), (1, 17), (18, 18), (9, 8)}
                  or ((x, y) in {(12, 1), (12, 3), (11, 2), (13, 2), (7, 13), (7, 15), (6, 14), (8, 14)}),
                  ["midnight_steel", "royal_gold", "toxic_night"]),
    "circuit": ("legendary", 16, 16, 0,
                lambda x, y: (y == 3 and x < 11) or (x == 10 and 3 <= y <= 12) or (y == 12 and x >= 10)
                or (x == 4 and y >= 8) or (y == 8 and x <= 4) or (x, y) in {(11, 3), (10, 13), (4, 7)},
                ["toxic_night", "ocean_foam", "ember_ash"]),
    "tiger_stripes": ("legendary", 48, 48, 0, lambda x, y: math.sin((x + 4 * math.sin(y / 48 * 4 * math.pi) + 2 * math.sin(y / 48 * 10 * math.pi)) / 48 * 8 * math.pi) > 0.45,
                      ["ember_ash", "glacier_white", "royal_gold"]),
    # Second batch.
    "zigzag": ("common", 12, 8, 0, lambda x, y: (y - abs((x % 12) - 6)) % 8 < 2,
               ["sunset_violet", "navy_gold", "jade_gold"]),
    "plaid": ("uncommon", 16, 16, 0,
              lambda x, y: (x % 16 in (2, 3, 9)) != (y % 16 in (2, 3, 9)) or (x % 16 == 13 and y % 2 == 0),
              ["crimson_ivory", "forest_bark", "arctic_navy"]),
    "scales": ("rare", 12, 8, 0,
               lambda x, y: abs(math.hypot((x + (6 if y >= 4 else 0)) % 12 - 6, (y % 4) - 4) - 5) < 1.0,
               ["jade_gold", "ocean_foam", "sunset_violet"]),
    "crosshatch": ("uncommon", 10, 10, 0, lambda x, y: (x + y) % 10 == 0 or (x - y) % 10 == 0,
                   ["midnight_steel", "sand_dune", "arctic_navy"]),
    "dunes": ("rare", 40, 20, 0,
              lambda x, y: math.sin(x / 40 * 2 * math.pi + y / 20 * 2 * math.pi * 2) > 0.3 and (y % 5 != 0),
              ["sand_dune", "sunset_violet", "ember_ash"]),
    "lattice": ("epic", 16, 16, 0,
                lambda x, y: (x % 8 in (0, 1) or y % 8 in (0, 1)) and not (x % 8 in (0, 1) and y % 8 in (0, 1)),
                ["royal_gold", "jade_gold", "arctic_navy", "toxic_night"]),
}

PALETTES = {
    "navy_gold": ("#1D2F5C", "#D4A72C"),
    "crimson_ivory": ("#A3162B", "#F2E8D5"),
    "forest_bark": ("#2F5A2E", "#6B4A2B"),
    "ocean_foam": ("#13628F", "#A9E3F0"),
    "ember_ash": ("#C2410C", "#2B2522"),
    "royal_gold": ("#4C2A85", "#E6B422"),
    "midnight_steel": ("#151A2D", "#7C8798"),
    "sand_dune": ("#C9A86A", "#7A5634"),
    "rose_cream": ("#C94C6E", "#F7E1D7"),
    "glacier_white": ("#5FA8D3", "#F4FAFF"),
    "toxic_night": ("#141414", "#7CFC3A"),
    "sunset_violet": ("#F97362", "#5B2A86"),
    "arctic_navy": ("#E8F1F8", "#1D2F5C"),
    "jade_gold": ("#0F766E", "#E6B422"),
}


# --------------------------------------------------------------------------
# Crowns: 128x128, drawn over a leading player's name.
# --------------------------------------------------------------------------
def crown_svg(body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
            '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#FFF3B0"/><stop offset="1" stop-color="#C98A12"/></linearGradient>'
            '<linearGradient id="ice" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#58B4E8"/></linearGradient>'
            '<linearGradient id="fire" x1="0" y1="1" x2="0" y2="0">'
            '<stop offset="0" stop-color="#B91C1C"/><stop offset=".55" stop-color="#F97316"/>'
            '<stop offset="1" stop-color="#FDE047"/></linearGradient></defs>'
            f'{body}</svg>\n')


CROWNS = {
    "royal_crown": ("rare", crown_svg(
        '<path d="M14 98 L8 40 L38 66 L64 24 L90 66 L120 40 L114 98 Z" fill="url(#g)" stroke="#5A3A05" stroke-width="5" stroke-linejoin="round"/>'
        '<rect x="14" y="96" width="100" height="16" rx="3" fill="url(#g)" stroke="#5A3A05" stroke-width="5"/>'
        '<circle cx="64" cy="80" r="8" fill="#C81E3A" stroke="#5A3A05" stroke-width="3"/>'
        '<circle cx="36" cy="84" r="5" fill="#1E5AC8"/><circle cx="92" cy="84" r="5" fill="#1E5AC8"/>'
        '<circle cx="8" cy="40" r="6" fill="url(#g)" stroke="#5A3A05" stroke-width="3"/>'
        '<circle cx="64" cy="24" r="6" fill="url(#g)" stroke="#5A3A05" stroke-width="3"/>'
        '<circle cx="120" cy="40" r="6" fill="url(#g)" stroke="#5A3A05" stroke-width="3"/>')),
    "laurel_wreath": ("uncommon", crown_svg(
        "".join(
            f'<ellipse cx="{64 + s * 48 * math.cos(math.radians(a)):.1f}" cy="{70 + 40 * math.sin(math.radians(a)):.1f}" rx="13" ry="6" '
            f'transform="rotate({(a + 90) * s if s > 0 else 180 - (a + 90):.1f} {64 + s * 48 * math.cos(math.radians(a)):.1f} {70 + 40 * math.sin(math.radians(a)):.1f})" '
            'fill="#5E9E3A" stroke="#22421A" stroke-width="3"/>'
            for s in (-1, 1) for a in range(-80, 100, 26))
        + '<path d="M48 112 Q64 100 80 112" fill="none" stroke="#C81E3A" stroke-width="7" stroke-linecap="round"/>')),
    "frost_crown": ("epic", crown_svg(
        '<path d="M14 100 L20 54 L34 72 L44 30 L56 66 L64 12 L72 66 L84 30 L94 72 L108 54 L114 100 Z" fill="url(#ice)" stroke="#1B4E7A" stroke-width="4" stroke-linejoin="round"/>'
        '<rect x="14" y="98" width="100" height="14" rx="3" fill="url(#ice)" stroke="#1B4E7A" stroke-width="4"/>'
        '<path d="M64 74 L70 84 L64 94 L58 84 Z" fill="#E0F4FF" stroke="#1B4E7A" stroke-width="2"/>')),
    "flame_crown": ("epic", crown_svg(
        '<path d="M16 104 C10 76 22 66 28 50 C34 66 36 72 42 60 C44 40 54 30 52 10 C70 26 74 44 70 62 C78 54 80 44 86 36 C90 52 98 60 98 40 C114 60 118 82 112 104 Z" fill="url(#fire)" stroke="#5A1006" stroke-width="4" stroke-linejoin="round"/>'
        '<rect x="14" y="100" width="100" height="14" rx="3" fill="#3A2A22" stroke="#140C08" stroke-width="4"/>')),
    "star_tiara": ("rare", crown_svg(
        '<path d="M10 104 Q64 58 118 104" fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round"/>'
        '<path d="M10 104 Q64 58 118 104" fill="none" stroke="#5A3A05" stroke-width="3" stroke-linecap="round"/>'
        + "".join(
            '<polygon points="' + " ".join(
                f"{cx + (r if i % 2 == 0 else r * .42) * math.cos(math.radians(-90 + i * 36)):.1f},"
                f"{cy + (r if i % 2 == 0 else r * .42) * math.sin(math.radians(-90 + i * 36)):.1f}"
                for i in range(10)) + '" fill="url(#g)" stroke="#5A3A05" stroke-width="3" stroke-linejoin="round"/>'
            for cx, cy, r in ((64, 42, 28), (28, 72, 16), (100, 72, 16))))),
    "iron_helm": ("legendary", crown_svg(
        '<path d="M22 104 L22 64 Q22 26 64 26 Q106 26 106 64 L106 104 Z" fill="#7C8798" stroke="#20252E" stroke-width="5" stroke-linejoin="round"/>'
        '<path d="M22 64 Q12 40 4 18 Q24 30 34 46" fill="#E9E1CF" stroke="#20252E" stroke-width="4" stroke-linejoin="round"/>'
        '<path d="M106 64 Q116 40 124 18 Q104 30 94 46" fill="#E9E1CF" stroke="#20252E" stroke-width="4" stroke-linejoin="round"/>'
        '<rect x="58" y="26" width="12" height="78" fill="#5C6676"/>'
        '<rect x="22" y="94" width="84" height="12" fill="#C98A12" stroke="#20252E" stroke-width="4"/>')),
    "masquerade_mask": ("uncommon", crown_svg(
        '<path d="M8 86 Q64 30 120 86 Q100 74 64 98 Q28 74 8 86 Z" fill="#2B2522" stroke="#E6B422" stroke-width="5" stroke-linejoin="round"/>'
        '<path d="M28 82 Q64 52 100 82" fill="none" stroke="#E6B422" stroke-width="3"/>'
        '<circle cx="64" cy="70" r="7" fill="#C81E3A" stroke="#E6B422" stroke-width="3"/>')),
    "jeweled_circlet": ("epic", crown_svg(
        '<path d="M14 92 Q64 64 114 92 L114 104 Q64 78 14 104 Z" fill="url(#g)" stroke="#5A3A05" stroke-width="4" stroke-linejoin="round"/>'
        '<path d="M64 58 L74 74 L64 88 L54 74 Z" fill="#22D3EE" stroke="#0E4A59" stroke-width="3"/>'
        '<circle cx="34" cy="86" r="6" fill="#C81E3A" stroke="#5A3A05" stroke-width="2"/>'
        '<circle cx="94" cy="86" r="6" fill="#C81E3A" stroke="#5A3A05" stroke-width="2"/>')),
    "bramble_crown": ("rare", crown_svg(
        '<ellipse cx="64" cy="88" rx="50" ry="18" fill="none" stroke="#3F2A1A" stroke-width="10"/>'
        '<ellipse cx="64" cy="88" rx="50" ry="18" fill="none" stroke="#6B4A2B" stroke-width="5"/>'
        + "".join(f'<path d="M{x} {88 + dy} l{-6 if i % 2 else 6} -16" stroke="#3F2A1A" stroke-width="4" stroke-linecap="round"/>'
                  for i, (x, dy) in enumerate([(22, -6), (40, -14), (58, -18), (76, -18), (94, -14), (110, -6)])))),
    "admiral_cap": ("rare", crown_svg(
        '<path d="M14 82 Q64 40 114 82 L108 92 L20 92 Z" fill="#F4F6F8" stroke="#1D2F5C" stroke-width="5" stroke-linejoin="round"/>'
        '<rect x="20" y="90" width="88" height="12" rx="3" fill="#1D2F5C"/>'
        '<path d="M22 104 Q64 120 106 104" fill="none" stroke="#111827" stroke-width="8" stroke-linecap="round"/>'
        '<circle cx="64" cy="72" r="9" fill="url(#g)" stroke="#5A3A05" stroke-width="3"/>')),
}


# --------------------------------------------------------------------------
# Territory skins: a 1024px emblem stamped over the middle of the territory.
# --------------------------------------------------------------------------
SK = 1024


def skin_canvas():
    return Image.new("RGBA", (SK * 2, SK * 2), (0, 0, 0, 0))


def finish(im):
    return im.resize((SK, SK), Image.LANCZOS)


def star_pts(cx, cy, r, inner, n=5, rot=-90):
    return [(cx + (r if i % 2 == 0 else r * inner) * math.cos(math.radians(rot + i * 180 / n)),
             cy + (r if i % 2 == 0 else r * inner) * math.sin(math.radians(rot + i * 180 / n)))
            for i in range(n * 2)]


def skin_compass():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    d.ellipse([c - 760, c - 760, c + 760, c + 760], outline=(255, 255, 255, 170), width=40)
    d.ellipse([c - 640, c - 640, c + 640, c + 640], outline=(255, 255, 255, 110), width=16)
    d.polygon(star_pts(c, c, 900, 0.16, 4, -90), fill=(255, 255, 255, 190))
    d.polygon(star_pts(c, c, 560, 0.25, 4, -45), fill=(255, 255, 255, 130))
    return finish(im)


def skin_crossed_swords():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    for s in (-1, 1):
        blade = [(-40, -880), (40, -880), (60, 440), (0, 560), (-60, 440)]
        guard = [(-260, 440), (260, 440), (260, 520), (-260, 520)]
        grip = [(-46, 520), (46, 520), (46, 820), (-46, 820)]
        a = math.radians(38 * s)
        for poly, col in ((blade, (235, 238, 245, 200)), (guard, (230, 180, 60, 210)), (grip, (110, 70, 40, 210))):
            pts = [(c + x * math.cos(a) - y * math.sin(a), c + x * math.sin(a) + y * math.cos(a)) for x, y in poly]
            d.polygon(pts, fill=col)
    return finish(im)


def skin_sunburst():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    for i in range(24):
        a0, a1 = math.radians(i * 15 - 3.5), math.radians(i * 15 + 3.5)
        r = 940 if i % 2 == 0 else 760
        d.polygon([(c, c), (c + r * math.cos(a0), c + r * math.sin(a0)), (c + r * math.cos(a1), c + r * math.sin(a1))],
                  fill=(255, 214, 90, 150))
    d.ellipse([c - 380, c - 380, c + 380, c + 380], fill=(255, 226, 120, 200))
    return finish(im)


def skin_crescent():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    d.ellipse([c - 720, c - 720, c + 720, c + 720], fill=(245, 245, 235, 185))
    d.ellipse([c - 420, c - 820, c + 900, c + 520], fill=(0, 0, 0, 0))
    for x, y, r in ((c + 330, c - 80, 170), (c + 560, c + 300, 110), (c + 150, c + 420, 90)):
        d.polygon(star_pts(x, y, r, 0.42), fill=(245, 245, 235, 200))
    return finish(im)


def skin_shield():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    shape = [(c - 620, c - 760), (c + 620, c - 760), (c + 620, c - 80), (c + 380, c + 460), (c, c + 860),
             (c - 380, c + 460), (c - 620, c - 80)]
    d.polygon(shape, fill=(255, 255, 255, 70), outline=(255, 255, 255, 200), width=44)
    d.rectangle([c - 70, c - 620, c + 70, c + 640], fill=(255, 255, 255, 170))
    d.rectangle([c - 480, c - 220, c + 480, c - 80], fill=(255, 255, 255, 170))
    return finish(im)


def skin_anchor():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    col = (230, 236, 245, 200)
    d.ellipse([c - 170, c - 900, c + 170, c - 560], outline=col, width=70)
    d.rectangle([c - 60, c - 580, c + 60, c + 700], fill=col)
    d.rectangle([c - 420, c - 420, c + 420, c - 300], fill=col)
    d.arc([c - 720, c - 220, c + 720, c + 820], 20, 160, fill=col, width=110)
    for s in (-1, 1):
        x = c + s * 676
        d.polygon([(x - 150 * s, c + 360), (x + 70 * s, c + 120), (x + 120 * s, c + 470)], fill=col)
    return finish(im)


def skin_atom():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    col = (230, 240, 255, 190)
    for a in (0, 60, 120):
        e = Image.new("RGBA", im.size, (0, 0, 0, 0)); ed = ImageDraw.Draw(e)
        ed.ellipse([c - 900, c - 330, c + 900, c + 330], outline=col, width=60)
        im.alpha_composite(e.rotate(a, center=(c, c)))
    d = ImageDraw.Draw(im)
    d.ellipse([c - 170, c - 170, c + 170, c + 170], fill=(255, 220, 120, 220))
    return finish(im)


def skin_tower():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    col = (235, 232, 220, 195)
    d.rectangle([c - 380, c - 420, c + 380, c + 820], fill=col)
    for i in range(5):
        x = c - 380 + i * 190
        d.rectangle([x, c - 620, x + 110, c - 420], fill=col)
    d.rectangle([c - 130, c + 450, c + 130, c + 820], fill=(0, 0, 0, 0))
    d.pieslice([c - 130, c + 320, c + 130, c + 580], 180, 360, fill=(0, 0, 0, 0))
    d.rectangle([c - 60, c - 250, c + 60, c - 50], fill=(0, 0, 0, 0))
    return finish(im)


def skin_wings():
    im = skin_canvas(); d = ImageDraw.Draw(im); c = SK
    col = (245, 240, 225, 190)
    for s_ in (-1, 1):
        for i in range(5):
            y = c - 300 + i * 150
            x0 = c + s_ * 120
            x1 = c + s_ * (900 - i * 130)
            d.polygon([(x0, y), (x1, y - 120 + i * 40), (x1 - s_ * 60, y + 90), (x0, y + 120)], fill=col)
    d.ellipse([c - 150, c - 400, c + 150, c + 500], fill=(255, 214, 90, 210))
    return finish(im)


SKINS = {
    "compass_rose": ("rare", skin_compass),
    "crossed_swords": ("rare", skin_crossed_swords),
    "sunburst": ("epic", skin_sunburst),
    "crescent_night": ("epic", skin_crescent),
    "knight_shield": ("legendary", skin_shield),
    "admiralty_anchor": ("legendary", skin_anchor),
    "split_atom": ("epic", skin_atom),
    "watchtower": ("rare", skin_tower),
    "gilded_wings": ("legendary", skin_wings),
}


# --------------------------------------------------------------------------
# Effects.
# --------------------------------------------------------------------------
RAINBOW = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#007AFF", "#AF52DE"]


def grad(colors, size, speed):
    return {"type": "gradient", "colors": colors, "colorSize": size, "movementSpeed": speed}


def trans(colors, freq):
    return {"type": "transition", "colors": colors, "frequency": freq}


EFFECTS = {
    "transportShipTrail": {
        "rainbow_wake": ("epic", grad(RAINBOW, 3, 4)),
        "golden_wake": ("rare", grad(["#FFE27A", "#C98A12"], 4, 2)),
        "ghost_wake": ("uncommon", trans(["#FFFFFF", "#9FB3C8"], 1.5)),
        "toxic_wake": ("rare", grad(["#7CFC3A", "#1E5F12"], 2, 6)),
        "sunset_wake": ("uncommon", grad(["#F97362", "#FDE047", "#A855F7"], 3, 3)),
    },
    "nukeTrail": {
        "inferno_trail": ("epic", grad(["#FDE047", "#F97316", "#B91C1C"], 2, 8)),
        "plasma_helix": ("legendary", {"type": "spiral", "colors": ["#A855F7", "#22D3EE", "#F0ABFC"],
                                       "radius": 2.5, "strands": 3, "rotationSpeed": 6}),
        "frost_trail": ("rare", grad(["#FFFFFF", "#58B4E8"], 3, 5)),
        "strobe_trail": ("uncommon", trans(["#FF3B30", "#FFFFFF"], 6)),
        "jade_helix": ("epic", {"type": "spiral", "colors": ["#0F766E", "#5EEAD4", "#E6B422"],
                                "radius": 2, "strands": 2, "rotationSpeed": 4}),
    },
    "nukeExplosion": {
        "golden_shockwave": ("epic", {"type": "shockwave", "nukeType": "atom", "colors": ["#FFF3B0", "#E6B422", "#C2410C"],
                                      "size": 60, "speed": 40, "thickness": 4, "transitionSpeed": 2}),
        "ice_sparkles": ("epic", {"type": "sparkles", "nukeType": "atom", "colors": ["#FFFFFF", "#A9E3F0", "#58B4E8"],
                                  "size": 55, "speed": 35, "thickness": 1.5, "transitionSpeed": 3, "density": 260}),
        "violet_shockwave": ("legendary", {"type": "shockwave", "nukeType": "hydro", "colors": ["#F0ABFC", "#A855F7", "#4C1D95"],
                                           "size": 120, "speed": 60, "thickness": 7, "transitionSpeed": 2}),
        "solar_embers": ("legendary", {"type": "embers", "nukeType": "hydro", "colors": ["#FDE047", "#F97316", "#7F1D1D"],
                                       "size": 110, "speed": 50, "thickness": 2.5, "transitionSpeed": 2, "density": 420}),
        "confetti_burst": ("epic", {"type": "sparkles", "nukeType": "mirvWarhead", "colors": RAINBOW,
                                    "size": 30, "speed": 30, "thickness": 1.2, "transitionSpeed": 4, "density": 140}),
        "cinder_rain": ("rare", {"type": "embers", "nukeType": "mirvWarhead", "colors": ["#F97316", "#2B2522"],
                                 "size": 28, "speed": 28, "thickness": 1.5, "transitionSpeed": 2, "density": 120}),
    },
    "structures": {
        "gilded_structures": ("epic", grad(["#FFF3B0", "#E6B422", "#8A5A06"], 1, 0.6)),
        "prism_structures": ("legendary", trans(RAINBOW, 1.2)),
        "steel_structures": ("rare", grad(["#E5E9F0", "#7C8798"], 1, 0.4)),
        "jade_structures": ("epic", grad(["#5EEAD4", "#0F766E", "#E6B422"], 1, 0.5)),
    },
    "warship": {
        "dreadnought_steel": ("rare", grad(["#B9C2CF", "#3B4452"], 1, 0.5)),
        "prism_fleet": ("legendary", trans(RAINBOW, 1.2)),
        "golden_fleet": ("epic", grad(["#FFF3B0", "#C98A12"], 1, 0.8)),
    },
    "train": {
        "golden_express": ("epic", grad(["#FFE27A", "#C98A12"], 2, 3)),
        "neon_express": ("legendary", trans(["#22D3EE", "#F0ABFC", "#7CFC3A"], 2)),
    },
    "railroad": {
        "gilded_rails": ("epic", grad(["#FFE27A", "#8A5A06"], 3, 1)),
        "neon_rails": ("legendary", grad(["#22D3EE", "#A855F7"], 4, 3)),
    },
}


def main():
    os.makedirs(os.path.join(OUT, "crowns"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "skins"), exist_ok=True)

    palettes_used = set()
    patterns = {}
    for name, (rarity, w, h, scale, fn, pals) in PATTERNS.items():
        patterns[name] = item(name, rarity, pattern=encode(w, h, scale, fn),
                              colorPalettes=[{"name": p, "isArchived": False} for p in pals])
        palettes_used.update(pals)

    crowns = {}
    for name, (rarity, svg) in CROWNS.items():
        open(os.path.join(OUT, "crowns", f"{name}.svg"), "w").write(svg)
        crowns[name] = item(name, rarity, url=f"/cosmetics/crowns/{name}.svg")

    skins = {}
    for name, (rarity, draw) in SKINS.items():
        draw().save(os.path.join(OUT, "skins", f"{name}.png"), optimize=True)
        skins[name] = item(name, rarity, url=f"/cosmetics/skins/{name}.png")

    effects = {}
    for etype, entries in EFFECTS.items():
        effects[etype] = {
            name: item(name, rarity, effectType=etype, attributes=attrs)
            for name, (rarity, attrs) in entries.items()
        }

    catalog = {
        "colorPalettes": {
            n: {"name": n, "primaryColor": PALETTES[n][0], "secondaryColor": PALETTES[n][1]}
            for n in sorted(palettes_used)
        },
        "patterns": patterns,
        "flags": {},
        "crowns": crowns,
        "skins": skins,
        "effects": effects,
    }
    with open(os.path.join(OUT, "superfront.json"), "w") as f:
        json.dump(catalog, f, indent=2)
        f.write("\n")
    n_fx = sum(len(v) for v in effects.values())
    print(f"{len(patterns)} patterns, {len(palettes_used)} palettes, {len(crowns)} crowns, "
          f"{len(skins)} skins, {n_fx} effects")


if __name__ == "__main__":
    main()
