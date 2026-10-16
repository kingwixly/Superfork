import os
from kit import *
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from PIL import Image
B = ROOT + '/resources/images/buildings/'
silo_base = Image.open(B + 'silo1.png').convert('RGBA')
sam_base = Image.open(B + 'silo4.png').convert('RGBA')

CON = (hexc('#b8bec2'), hexc('#8e959a'), hexc('#666c71'))
OLIVE = (hexc('#8a9a5b'), hexc('#66753f'), hexc('#46522a'))
STEEL = (hexc('#8cbabe'), hexc('#4e7376'), hexc('#264447'))   # base palette
DARK = (hexc('#3e4756'), hexc('#2b323e'), hexc('#1c222b'))
YEL, BLK = hexc('#f2c14e'), hexc('#2a2a2a')
RED, RED_D = hexc('#ff2c00'), hexc('#b6280b')
WHITE, WHITE_D, WHITE_DD = hexc('#f4f6f8'), hexc('#c9d1d8'), hexc('#8f99a3')
CYAN, MAG = hexc('#4ff0ff'), hexc('#ff5ad8')

def missile(c, x, ybot, h, body=(WHITE, WHITE_D), nose=(RED, RED_D), band=None, fin=WHITE_DD):
    """3px-wide upright missile in screen space, base at ybot."""
    x, ybot = int(round(x)), int(round(ybot)); top = ybot - h
    for y in range(top + 2, ybot + 1):
        c.px(x - 1, y, body[0]); c.px(x, y, body[0]); c.px(x + 1, y, body[1])
    c.px(x, top + 1, nose[0]); c.px(x - 1, top + 2, nose[0]); c.px(x, top + 2, nose[0]); c.px(x + 1, top + 2, nose[1])
    c.px(x, top, nose[1])
    if band:
        for y in (top + 5, ybot - 3):
            c.px(x - 1, y, band); c.px(x, y, band); c.px(x + 1, y, band)
    for dx in (-2, 2): c.px(x + dx, ybot, fin); c.px(x + dx, ybot - 1, fin)

def hazard_rim(c, n):
    P = c.P
    for t in range(0, 2 * n):
        col = YEL if (t // 2) % 2 == 0 else BLK
        x, y = P(-n / 2 + t / 2, n / 2, 1); c.px(x, y, col)
        x, y = P(n / 2, n / 2 - t / 2, 1); c.px(x, y, col)

# ---------------- Missile silo ----------------
def silo_t2():
    c = Canvas(16, 24)
    c.box(-4, -4, 0, 8, 8, 1, *CON)
    hazard_rim(c, 8)
    c.box(-2, -2, 1, 4, 4, 0.5, BLK, BLK, BLK)                     # open shaft
    c.box(-3.5, -1, 1, 1.5, 2, 1, *STEEL)                          # blast door halves
    c.box(2, -1, 1, 1.5, 2, 1, *STEEL)
    x, y = c.P(0, 0, 1); missile(c, x, y, 12)
    return c.im

def silo_t3():
    c = Canvas(16, 25)
    c.box(-5, -5, 0, 10, 10, 1, *CON)
    hazard_rim(c, 10)
    # service tower (red lattice) beside the missile
    for k in range(1, 17, 2): c.box(-5, -2, k, 2, 2, 1, hexc('#e85a4a'), hexc('#c43a2c'), hexc('#8a2419'))
    c.line(c.P(-3, -1, 14), c.P(-0.5, 0, 14), WHITE_DD)            # umbilical arm
    c.box(-2, -2, 1, 4, 4, 0.5, BLK, BLK, BLK)
    x, y = c.P(0, 0, 1); missile(c, x, y, 17, band=BLK)
    for (i, j) in ((4, -4), (-4, 4)):                               # floodlights
        x, y = c.P(i, j, 1); c.line((x, y), (x, y - 4), WHITE_DD); c.px(x, y - 5, hexc('#ffe28a'))
    return c.im

def silo_t4():
    c = Canvas(16, 25)
    c.box(-5, -5, 0, 10, 10, 1, *DARK)
    c.line(c.P(-5, 5, 1), c.P(5, 5, 1), CYAN); c.line(c.P(5, 5, 1), c.P(5, -5, 1), CYAN)
    x, y = c.P(0, 0, 1)
    c.d.ellipse([x - 7, y - 3, x + 7, y + 3], outline=CYAN)          # launch ring
    c.d.ellipse([x - 4, y - 2, x + 4, y + 2], outline=MAG)
    for (i, j) in ((-4, -4), (4, -4), (-4, 4), (4, 4)):              # energy pylons
        px_, py_ = c.P(i, j, 1)
        c.line((px_, py_), (px_, py_ - 6), DARK[1]); c.px(px_, py_ - 7, CYAN)
    missile(c, x, y - 2, 17, body=(hexc('#e8eef5'), hexc('#9fb0c4')), nose=(MAG, hexc('#a23a8a')), band=CYAN, fin=hexc('#5a6578'))
    for k in (1, 2): c.px(x, y - 2 + k, CYAN if k == 1 else hexc('#a8fbff'))   # engine glow
    return glow(glow(c.im, CYAN, .3), MAG, .3)

# ---------------- SAM ----------------
def tube_box(c, x, y, length, cells, pal, cap=BLK, tip=None):
    """Launcher box in screen space: rises from (x, y) toward the upper left
    at roughly 55 degrees, `cells` tubes wide, open tube ends at the top."""
    w = cells * 2
    dx, dy = -0.55, -0.85
    ex, ey = x + dx * length, y + dy * length
    c.poly([(x, y), (x + w, y + w / 2), (ex + w, ey + w / 2), (ex, ey)], pal[1])     # side
    c.poly([(x, y - 2), (x + w, y + w / 2 - 2), (ex + w, ey + w / 2 - 2), (ex, ey - 2)], pal[0])  # top
    # open tube ends on the upper face
    for n in range(cells):
        tx, ty = ex + 1 + n * 2, ey + n - 1
        c.px(tx, ty, cap); c.px(tx, ty - 1, cap)
        if tip: c.px(tx, ty - 1, tip)

def sam_t2():
    c = Canvas(16, 24)
    c.box(-4, -4, 0, 8, 8, 1, *CON)
    c.box(-3, -2, 1, 7, 4, 2, *OLIVE)                              # launcher chassis
    c.box(2, -2, 3, 2, 2, 2, OLIVE[0], OLIVE[2], OLIVE[2])         # cab
    x, y = c.P(-1, 0, 3); tube_box(c, x + 1, y, 9, 2, OLIVE, BLK, RED)
    x, y = c.P(3, -4, 1); c.line((x, y), (x, y - 6), WHITE_DD)     # radar mast
    c.d.ellipse([x - 2, y - 9, x + 2, y - 6], fill=WHITE_D); c.px(x, y - 8, RED)
    return c.im

def sam_t3():
    c = Canvas(16, 25)
    c.box(-5, -5, 0, 10, 10, 1, *CON)
    hazard_rim(c, 10)
    # phased-array radar panel on the back
    c.poly([(16, 4), (23, 7), (23, 15), (16, 12)], hexc('#5d6469'))
    c.poly([(17, 6), (22, 8), (22, 13), (17, 11)], hexc('#2b3a4a'))
    for (x, y) in ((18, 8), (20, 9), (18, 10), (20, 11)): c.px(x, y, hexc('#7fd0ff'))
    c.line((20, 15), (20, 19), WHITE_DD)
    # two 4-cell launch boxes on a long chassis
    c.box(-4, -1, 1, 8, 5, 2, *OLIVE)
    for n, (i, j) in enumerate(((-2, 2), (1, 2))):
        x, y = c.P(i, j, 3); tube_box(c, x, y, 10, 2, OLIVE, BLK, RED)
    return c.im

def sam_t4():
    c = Canvas(16, 25)
    c.box(-5, -5, 0, 10, 10, 1, *DARK)
    c.line(c.P(-5, 5, 1), c.P(5, 5, 1), CYAN); c.line(c.P(5, 5, 1), c.P(5, -5, 1), CYAN)
    x, y = c.P(0, 0, 1)
    # shield dome: just the upper arc, dotted, so the turret shows through
    import math
    for a in range(200, 341, 10):
        r = math.radians(a)
        c.px(x + 10 * math.cos(r), y - 2 + 11 * math.sin(r), hexc('#7fe9ff'))
    c.d.ellipse([x - 5, y - 6, x + 5, y + 1], fill=DARK[0])             # turret base
    c.d.ellipse([x - 5, y - 7, x + 5, y - 3], fill=hexc('#5a6578'))
    c.px(x, y - 4, MAG); c.px(x + 1, y - 4, MAG)                         # energy core
    # twin rails angled up-left with a glowing channel between them
    c.line((x - 1, y - 5), (x - 9, y - 16), hexc('#c9d1d8'))
    c.line((x + 1, y - 5), (x - 7, y - 16), hexc('#7f8b99'))
    c.line((x, y - 5), (x - 8, y - 16), CYAN)
    c.px(x - 8, y - 17, hexc('#a8fbff'))
    return glow(glow(c.im, CYAN, .3), MAG, .3)

