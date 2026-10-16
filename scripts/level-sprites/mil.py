import os
from kit import *
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from PIL import Image
B = ROOT + '/resources/images/buildings/'
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
    # tracking radar dish on a pedestal, at the back
    x, y = 20, 17
    c.d.rectangle([x - 1, y - 3, x + 1, y], fill=hexc('#6b7686'))
    c.d.ellipse([x - 4, y - 10, x + 3, y - 3], fill=hexc('#d2d7dc'))
    c.d.ellipse([x - 3, y - 9, x + 2, y - 4], fill=hexc('#a3aab1'))
    c.line((x - 1, y - 6), (x - 3, y - 8), hexc('#323946')); c.px(x - 3, y - 8, RED)
    # two 4-cell launch boxes on a long chassis
    c.box(-4, -1, 1, 8, 5, 2, *OLIVE)
    for n, (i, j) in enumerate(((-2, 2), (1, 2))):
        x, y = c.P(i, j, 3); tube_box(c, x, y, 10, 2, OLIVE, BLK, RED)
    return c.im

def sam_t4():
    # Long-range battery: four big canisters raised to vertical on a heavy
    # launcher, a radar dome and a command shelter. Real hardware, no glow.
    c = Canvas(16, 25)
    c.box(-5, -5, 0, 10, 10, 1, *CON)
    hazard_rim(c, 10)
    c.box(2, -5, 1, 3, 3, 2, *CON)                                        # command shelter
    x, y = c.P(3.5, -3.5, 3); c.line((x, y), (x, y - 5), WHITE_DD); c.px(x, y - 6, RED)
    x, y = c.P(-4, -3, 1)                                                 # radar dome
    c.d.ellipse([x - 3, y - 7, x + 3, y - 1], fill=hexc('#e8ecef'))
    c.d.ellipse([x, y - 6, x + 3, y - 1], fill=hexc('#b9c0c6'))
    c.box(-3, -1, 1, 7, 5, 2, *OLIVE)                                     # heavy chassis
    c.box(3, -1, 3, 1.5, 3, 2, OLIVE[0], OLIVE[2], OLIVE[2])              # cab
    # four canisters standing upright in a row, gaps between them, back first
    for n, j in enumerate((0, 1.6, 3.2, 4.8)):
        i = -2.5
        x, y = c.P(i, j, 3)
        top = y - 11
        c.d.rectangle([x - 1, top, x, y], fill=OLIVE[0])                  # lit side
        c.d.rectangle([x + 1, top + 1, x + 1, y], fill=OLIVE[2])          # shade side
        c.px(x - 1, top, BLK); c.px(x, top, BLK)                          # open end
        c.line((x - 1, top + 3), (x, top + 3), OLIVE[1])                  # band
    return c.im

