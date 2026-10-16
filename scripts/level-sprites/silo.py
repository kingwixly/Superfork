"""Missile silo level tiers, after the open-hatch silo reference: a round
shaft in the original teal star pad, the armored lid swung open behind it,
and the warhead rising out. Higher tiers add modern site systems."""
import math, os
from PIL import Image
from kit import *
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
base = Image.open(ROOT + "/resources/images/buildings/silo1.png").convert("RGBA")

TEAL = dict(hi=hexc('#baebed'), top=hexc('#8cbabe'), mid=hexc('#4e7376'), dark=hexc('#335558'), deep=hexc('#264447'))
CONC = dict(hi=hexc('#d9dcd6'), top=hexc('#b9bdb5'), mid=hexc('#8f948c'), dark=hexc('#62665f'), deep=hexc('#3c3f3a'))
LID = dict(face=hexc('#5c6650'), rim=hexc('#7d876c'), edge=hexc('#3a4132'), deep=hexc('#262b20'), bolt=hexc('#9aa486'))
STEEL = dict(face=hexc('#4a5361'), rim=hexc('#6b7686'), edge=hexc('#323946'), deep=hexc('#20252e'), bolt=hexc('#8c97a8'))
RED_H, RED, RED_M, RED_D = hexc('#ff7a5c'), hexc('#e8361c'), hexc('#c4260f'), hexc('#8a1a0a')
BLK = hexc('#151515'); YEL = hexc('#f2c14e')

def star_pad(c, cx, cy, R, p, k=0.36):
    r = R * 0.5
    for dy in (2, 1):
        c.poly([(cx - R, cy + dy), (cx - R * k, cy + r * k + dy), (cx, cy + r + dy),
                (cx + R * k, cy + r * k + dy), (cx + R, cy + dy), (cx, cy + dy)], p['deep'])
    L, T, Rt, B = (cx - R, cy), (cx, cy - r), (cx + R, cy), (cx, cy + r)
    iTL, iTR, iBL, iBR = (cx - R*k, cy - r*k), (cx + R*k, cy - r*k), (cx - R*k, cy + r*k), (cx + R*k, cy + r*k)
    C = (cx, cy)
    c.poly([L, iTL, C], p['top']); c.poly([L, C, iBL], p['mid'])
    c.poly([T, iTR, C], p['top']); c.poly([T, C, iTL], p['hi'])
    c.poly([Rt, iTR, C], p['mid']); c.poly([Rt, C, iBR], p['dark'])
    c.poly([B, iBL, C], p['mid']); c.poly([B, C, iBR], p['deep'])

def square_pad(c, n, p):
    c.box(-n, -n, 0, 2 * n, 2 * n, 1, p['top'], p['mid'], p['dark'])

def disc(c, cx, cy, w, h, col):
    """Filled ellipse from the exact equation at pixel centres, so it is
    symmetric (PIL's ellipse rasterises lopsided at this size)."""
    for y in range(int(cy - h) - 1, int(cy + h) + 2):
        for x in range(int(cx - w) - 1, int(cx + w) + 2):
            if ((x - cx) / w) ** 2 + ((y - cy) / h) ** 2 <= 1.0:
                c.px(x, y, col)

def lid(c, cx, cy, w, h, pal, bolts=True):
    """Round blast lid swung open, standing behind the shaft, seen face-on
    like the photo: a rim ring, the face, bolts set inside the rim."""
    disc(c, cx, cy, w + 0.5, h + 0.5, pal['rim'])
    disc(c, cx, cy, w - 1.5, h - 1.5, pal['face'])
    if bolts:
        # Four bolts, one rim-pixel in from the edge. (On the diagonals the
        # rim is a single pixel wide, so bolts there sit on the outline.)
        for dx, dy in ((0, -(h - 1)), (0, h - 1), (-(w - 1), 0), (w - 1, 0)):
            c.px(round(cx + dx), round(cy + dy), pal['bolt'])
    c.px(cx, cy, pal['edge']); c.px(cx, cy - 1, pal['bolt'])

def shaft(c, cx, cy, rw, rh, ring, inner=BLK):
    c.d.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=ring['mid'])
    c.d.ellipse([cx - rw + 2, cy - rh + 1, cx + rw - 2, cy + rh - 1], fill=inner)
    c.d.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], outline=ring['hi'])

def shaft_front(c, cx, cy, rw, rh, ring):
    """Front lip of the shaft, drawn over the warhead's base."""
    for x in range(cx - rw + 1, cx + rw):
        t = (x - cx) / rw
        y = cy + rh * math.sqrt(max(0, 1 - t * t))
        c.px(x, round(y), ring['hi']); c.px(x, round(y) - 1, ring['mid'])

def warhead(c, cx, base_y, w, h, cols=(RED_H, RED, RED_M, RED_D), tip=None):
    """Conical nose with a rounded shoulder, lit from the left like the photo."""
    hi, mid, md, dk = cols
    for y in range(h + 1):
        yy = base_y - y
        t = y / h
        half = w * (1 - t) ** 0.85 if t < 1 else 0
        if y < 2: half = w - (2 - y) * 0.6          # rounded shoulder at the base
        for x in range(round(cx - half), round(cx + half) + 1):
            f = (x - (cx - half)) / max(1, 2 * half)
            col = hi if f < 0.22 else mid if f < 0.55 else md if f < 0.8 else dk
            c.px(x, yy, col)
    if tip: c.px(cx, base_y - h, tip)

def radome(c, x, y, r=3):
    c.d.ellipse([x - r, y - r, x + r, y + r], fill=hexc('#e8ecef'))
    c.d.ellipse([x, y - r + 1, x + r, y + r], fill=hexc('#b9c0c6'))
    c.px(x - 1, y - 1, hexc('#ffffff'))
    c.line((x, y + r), (x, y + r + 2), CONC['dark'])

def mast(c, x, y, h, light=RED):
    c.line((x, y), (x, y - h), CONC['dark'])
    c.line((x - 1, y - h + 2), (x + 1, y - h + 2), CONC['dark'])
    c.px(x, y - h - 1, light)

def ciws(c, x, y):
    """Point-defence gun: white dome on a pedestal, barrel to the upper left."""
    c.d.rectangle([x - 2, y - 1, x + 2, y + 1], fill=STEEL['face'])
    c.d.ellipse([x - 2, y - 5, x + 2, y - 1], fill=hexc('#e8ecef'))
    c.d.ellipse([x, y - 4, x + 2, y - 1], fill=hexc('#b9c0c6'))
    c.line((x - 1, y - 2), (x - 5, y - 5), STEEL['edge'])

def radar_dish(c, x, y):
    """Tracking radar: a dish on a pedestal, facing up and to the left."""
    c.d.rectangle([x - 1, y - 3, x + 1, y], fill=STEEL['face'])                 # pedestal
    c.d.ellipse([x - 4, y - 9, x + 2, y - 3], fill=hexc('#d2d7dc'))             # dish
    c.d.ellipse([x - 3, y - 8, x + 1, y - 4], fill=hexc('#a3aab1'))             # dish hollow
    c.line((x - 1, y - 6), (x - 3, y - 8), STEEL['edge'])                       # feed arm
    c.px(x - 3, y - 8, hexc('#ff2c00'))

def hazard_ring(c, cx, cy, rw, rh):
    for n, a in enumerate(range(10, 171, 16)):
        r = math.radians(a)
        c.px(cx + (rw + 1) * math.cos(r), cy + (rh + 1) * math.sin(r), YEL if n % 2 == 0 else BLK)

# ---------- tier 2: the photo, on the original pad ----------
def t2():
    c = Canvas(16, 22)
    cx, cy = 16, 22
    star_pad(c, cx, cy, 12, TEAL)
    c.line((cx + 5, cy - 3), (cx + 6, cy - 6), LID['edge'])                    # hinge arm
    lid(c, cx + 5, cy - 11, 7, 6, LID)
    shaft(c, cx, cy - 1, 7, 3, CONC)
    warhead(c, cx, cy, 6, 11)
    shaft_front(c, cx, cy - 1, 7, 3, CONC)
    return c.im

# ---------- tier 3: hardened site with radar and comms ----------
def t3():
    c = Canvas(16, 22)
    cx, cy = 16, 22
    star_pad(c, cx, cy, 13, TEAL)
    radome(c, cx - 9, cy - 5, 3)
    mast(c, cx + 10, cy - 1, 9)
    c.line((cx + 5, cy - 3), (cx + 6, cy - 6), LID['edge'])
    lid(c, cx + 5, cy - 11, 7, 6, LID)
    shaft(c, cx, cy - 1, 7, 3, CONC)
    hazard_ring(c, cx, cy - 1, 7, 3)
    warhead(c, cx, cy, 6, 12)
    for y in (cy - 5, cy - 6):                                                 # black band
        for x in range(cx - 4, cx + 5):
            if c.im.getpixel((x, y))[3]: c.px(x, y, hexc('#2a2a2a'))
    shaft_front(c, cx, cy - 1, 7, 3, CONC)
    for (x, y) in ((cx - 12, cy), (cx + 12, cy), (cx, cy + 6)): c.px(x, y, RED)  # pad lights
    return c.im

# ---------- tier 4: modern strategic site ----------
def t4():
    c = Canvas(16, 22)
    cx, cy = 16, 22
    star_pad(c, cx, cy, 13, dict(hi=hexc('#9aa7b5'), top=hexc('#6b7686'), mid=hexc('#4a5361'),
                                  dark=hexc('#323946'), deep=hexc('#20252e')))
    radar_dish(c, cx - 10, cy - 2)
    ciws(c, cx + 10, cy - 1)
    # hydraulic rams holding the steel lid
    c.line((cx + 3, cy - 2), (cx + 2, cy - 8), STEEL['bolt']); c.line((cx + 7, cy - 2), (cx + 9, cy - 7), STEEL['bolt'])
    lid(c, cx + 5, cy - 12, 7, 6, STEEL)
    for a in range(0, 360, 12):                                                # lid marking ring
        r = math.radians(a)
        c.px(round(cx + 5 + 3.5 * math.cos(r)), round(cy - 12 + 3 * math.sin(r)), hexc('#f2c14e'))
    shaft(c, cx, cy - 1, 7, 3, dict(hi=hexc('#c9d1d8'), mid=hexc('#6b7686')))
    hazard_ring(c, cx, cy - 1, 7, 3)
    # modern re-entry vehicle: dark body, red nose
    warhead(c, cx, cy, 6, 13, cols=(hexc('#8c97a8'), hexc('#4a5361'), hexc('#323946'), hexc('#20252e')))
    warhead(c, cx, cy - 8, 3, 5)
    shaft_front(c, cx, cy - 1, 7, 3, dict(hi=hexc('#c9d1d8'), mid=hexc('#6b7686')))
    for (x, y) in ((cx - 12, cy), (cx + 12, cy), (cx, cy + 6)): c.px(x, y, RED)
    return c.im

