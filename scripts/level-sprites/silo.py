import os
from PIL import Image
from kit import *
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
base = Image.open(ROOT + "/resources/images/buildings/silo1.png").convert("RGBA")

TEAL = dict(hi=hexc('#baebed'), top=hexc('#8cbabe'), mid=hexc('#4e7376'), dark=hexc('#335558'),
            deep=hexc('#264447'), cone_l=hexc('#e8f4f6'), cone_m=hexc('#c9e1e4'), cone_r=hexc('#a8c5c8'))
ALLOY = dict(hi=hexc('#8a97ab'), top=hexc('#5a6578'), mid=hexc('#3e4756'), dark=hexc('#2b323e'),
             deep=hexc('#1c222b'), cone_l=hexc('#c9d4e2'), cone_m=hexc('#9fb0c4'), cone_r=hexc('#6f7f94'))
RED, RED_H, RED_D = hexc('#ff2c00'), hexc('#ff5430'), hexc('#b6280b')
YEL, BLK = hexc('#f2c14e'), hexc('#1e1e1e')
CYAN, MAG = hexc('#4ff0ff'), hexc('#ff5ad8')

def star_pad(c, cx, cy, R, p, seams=None, hazard=False, lights=None):
    r = R * 0.5        # iso: vertical spikes half as long
    k = 0.36           # how deep the concave sides are (higher = chunkier)
    # extrusion: the pad's thickness, drawn first, 2px lower
    for dy in (2, 1):
        pts = [(cx - R, cy + dy), (cx - R * k, cy + r * k + dy), (cx, cy + r + dy),
               (cx + R * k, cy + r * k + dy), (cx + R, cy + dy)]
        c.poly(pts + [(cx, cy + dy)], p['deep'])
    L, T, Rt, Bm = (cx - R, cy), (cx, cy - r), (cx + R, cy), (cx, cy + r)
    iTL, iTR = (cx - R * k, cy - r * k), (cx + R * k, cy - r * k)
    iBL, iBR = (cx - R * k, cy + r * k), (cx + R * k, cy + r * k)
    C = (cx, cy)
    # four spikes, each split along its ridge into a lit and a shaded half
    c.poly([L, iTL, C], p['top']); c.poly([L, C, iBL], p['mid'])
    c.poly([T, iTR, C], p['top']); c.poly([T, C, iTL], p['hi'])
    c.poly([Rt, iTR, C], p['mid']); c.poly([Rt, C, iBR], p['dark'])
    c.poly([Bm, iBL, C], p['mid']); c.poly([Bm, C, iBR], p['deep'])
    if seams:
        for tip in (L, Rt, Bm): c.line(tip, C, seams)
    if hazard:
        for tip in (L, Rt):
            for t in range(4):
                f = 0.15 + t * 0.12
                x = tip[0] + (cx - tip[0]) * f; y = tip[1]
                c.px(x, y, YEL if t % 2 == 0 else BLK)
    if lights:
        for tip in (L, Rt, Bm): c.px(*tip, lights)

def cone(c, cx, cy, w, h, p, collar=None):
    top = cy - h
    c.poly([(cx - w, cy), (cx - 1, top), (cx, top), (cx, cy)], p['cone_l'])
    c.poly([(cx, cy), (cx, top), (cx + 1, top), (cx + w, cy)], p['cone_r'])
    c.line((cx, cy), (cx, top), p['cone_m'])
    if collar:   # front half of a collar ring only, so it reads as a band
        for dx in range(-w - 1, w + 2):
            c.px(cx + dx, cy + (1 if abs(dx) < w - 1 else 0), collar)
    return top

def warhead(c, x, y, big=False, cols=(RED_H, RED, RED_D)):
    """Pointed warhead like the original's: rounded nose, shaded right side."""
    hi, mid, dk = cols
    x, y = int(round(x)), int(round(y))
    if big:   # 4 wide, 5 tall
        rows = [(0, 1), (-1, 2), (-2, 2), (-2, 2), (-2, 2)]
    else:     # 3 wide, 4 tall
        rows = [(0, 0), (-1, 1), (-1, 1), (-1, 1)]
    for n, (a, b) in enumerate(rows):
        yy = y - len(rows) + 1 + n
        for xx in range(x + a, x + b + 1):
            c.px(xx, yy, dk if xx == x + b and n > 0 else (hi if xx == x + a and n in (1, 2) else mid))

def t2():
    # Hardened: bigger pad, armored collar, blast doors swung open, hazard marks.
    c = Canvas(16, 23)
    cx, cy = 16, 21
    star_pad(c, cx, cy, 10, TEAL, hazard=True)
    for dx in (-6, 4):                                            # open blast doors
        c.poly([(cx + dx, cy - 1), (cx + dx + 3, cy - 2), (cx + dx + 3, cy), (cx + dx, cy + 1)], TEAL['deep'])
        c.line((cx + dx, cy - 1), (cx + dx + 3, cy - 2), TEAL['hi'])
    top = cone(c, cx, cy, 4, 8, TEAL, collar=TEAL['deep'])
    warhead(c, cx, top + 1, big=True)
    return c.im

def t3():
    # Strategic: wider pad with warning lights, double collar, MIRV bus of
    # three warheads, a sensor mast.
    c = Canvas(16, 23)
    cx, cy = 16, 21
    star_pad(c, cx, cy, 12, TEAL, hazard=True, lights=RED)
    x = cx + 8; c.line((x, cy - 2), (x, cy - 9), TEAL['dark']); c.px(x, cy - 10, RED)   # mast
    top = cone(c, cx, cy, 5, 9, TEAL, collar=TEAL['deep'])
    c.d.rectangle([cx - 4, top, cx + 4, top + 1], fill=TEAL['dark'])                  # warhead bus
    c.line((cx - 4, top), (cx + 4, top), TEAL['top'])
    for dx in (-3, 3): warhead(c, cx + dx, top - 1)
    warhead(c, cx, top - 1, big=True)
    return c.im

def t4():
    # Advanced: alloy pad with glowing seams, energy ring, plasma warhead,
    # hovering hatch plates.
    c = Canvas(16, 23)
    cx, cy = 16, 21
    star_pad(c, cx, cy, 12, ALLOY, seams=CYAN, lights=MAG)
    top = cone(c, cx, cy, 5, 10, ALLOY, collar=CYAN)
    for dx in range(-7, 8):                                       # energy ring, front arc
        if abs(dx) > 4: c.px(cx + dx, cy - 5 + (abs(dx) - 5) // 2, CYAN)
    warhead(c, cx, top + 1, big=True, cols=(hexc('#ffc6f1'), MAG, hexc('#a23a8a')))
    return glow(glow(c.im, CYAN, .2), MAG, .3)

