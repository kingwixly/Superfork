import os
from kit import *
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from PIL import Image
base = Image.open(ROOT + '/resources/images/buildings/port1.png').convert('RGBA')

QUAY = (hexc('#a9adb0'), hexc('#86898c'), hexc('#5f6265'))
DARKQ = (hexc('#3e4756'), hexc('#2b323e'), hexc('#1c222b'))
CYAN, MAG = hexc('#4ff0ff'), hexc('#ff5ad8')
CONT = [(hexc('#e0703a'), hexc('#b6460d'), hexc('#7a2f09')),
        (hexc('#4f86d1'), hexc('#1f5aa6'), hexc('#153e73')),
        (hexc('#53b37a'), hexc('#2e8b57'), hexc('#1f5f3c')),
        (hexc('#f1eb5e'), hexc('#d6cf2b'), hexc('#9b950d'))]
RED, WHITE = (hexc('#e85a4a'), hexc('#c43a2c'), hexc('#8a2419')), (hexc('#f4f6f8'), hexc('#d2d7dc'), hexc('#a3aab1'))
BLUE = (hexc('#5b9be0'), hexc('#2f6fb0'), hexc('#1e4a78'))

def container(c, i, j, k, col, pal=None):
    c.box(i, j, k, 3, 1.5, 1.5, *(pal or CONT)[col % len(pal or CONT)])

def row(c, i, j0, n, layers, start=0, pal=None):
    for L in range(layers):
        for m in range(n):
            container(c, i, j0 + m * 1.5, 1 + L * 1.5, start + m + L, pal)

def t2():
    c = Canvas(16, 23)
    c.box(-5, -5, 0, 10, 10, 1, *QUAY)
    for m, col in enumerate((1, 0, 1)):
        container(c, 1.5, -4 + m * 1.6, 1, col)
    container(c, 1.5, 1.2, 1, 2); container(c, 1.5, 1.2, 2.5, 0)
    # jib crane: red/white tower, horizontal jib with counterweight
    c.box(-3, -2, 1, 2, 2, 11, *WHITE)
    for k in (3, 6, 9): c.stripe(-3, -2, k, 2, 2, RED[1])
    c.box(-3.5, -2.5, 12, 3, 3, 2, *RED)                         # cab
    c.box(-2.5, -6, 14, 1, 11, 1, *RED)                          # jib (back to front)
    c.box(-3, -6, 13, 2, 2, 1, *QUAY)                            # counterweight
    x, y = c.P(-2, 4.5, 14); c.line((x, y + 1), (x, y + 6), hexc('#3b3b3a'))
    container(c, -3.5, 4, 7.5, 1)                                # load on the hook
    return c.im

def sts_crane(c, frame, dark, boom, boom_dark, house, light=None, beam=None):
    """Ship-to-shore crane drawn in screen space for a crisp silhouette.
    Legs straddle the quay's back half; the boom reaches out top-left, over
    where the water would be."""
    L = c.line
    # back frame (darker), then front frame
    for (x0, y0, col) in ((13, 23, dark), (9, 25, frame)):
        L((x0, y0), (x0, y0 - 13), col)                # leg near
        L((x0 + 6, y0 + 3), (x0 + 6, y0 - 10), col)    # leg far
        L((x0, y0 - 13), (x0 + 6, y0 - 10), col)       # portal beam
        L((x0, y0 - 6), (x0 + 6, y0 - 3), col)         # sill beam
        L((x0, y0 - 6), (x0 + 6, y0 - 10), col)        # bracing
    # joining beams between the two frames
    L((9, 12), (13, 10), frame); L((15, 15), (19, 13), frame)
    # boom: 2px thick, from far over the water (top-left) back over the yard
    L((2, 9), (22, 15), boom); L((2, 10), (22, 16), boom_dark)
    # apex tie-backs
    L((12, 5), (3, 9), dark); L((12, 5), (21, 14), dark); L((12, 5), (12, 10), frame)
    # machinery house
    c.d.rectangle([14, 10, 18, 12], fill=house[1]); c.d.rectangle([14, 10, 18, 10], fill=house[0])
    if light:
        for (x, y) in ((2, 9), (12, 5), (22, 15)): c.px(x, y, light)
    if beam:
        for k in range(1, 9): c.px(4, 10 + k, beam if k % 2 else hexc('#a8fbff'))

def t3():
    c = Canvas(16, 24)
    c.box(-5, -5, 0, 10, 10, 1, *QUAY)
    row(c, 2, -4.5, 6, 2, 0)
    sts_crane(c, BLUE[1], BLUE[2], WHITE[0], WHITE[2], RED, hexc('#ffe28a'))
    c.line((4, 11), (4, 17), hexc('#3b3b3a'))
    c.box(-6, 4, 2, 3, 1.5, 1.5, *CONT[1])  # load on the hook
    return c.im

def t4():
    # Major container terminal: a red post-panamax crane with a white boom
    # working a yard stacked three high.
    c = Canvas(16, 24)
    c.box(-5, -5, 0, 10, 10, 1, *QUAY)
    for L in range(3):
        for m in range(6):
            container(c, 2, -4.5 + m * 1.5, 1 + L * 1.5, m + L)
    sts_crane(c, RED[1], RED[2], WHITE[0], WHITE[2], BLUE, hexc('#ffe28a'))
    c.line((4, 11), (4, 17), hexc('#3b3b3a'))
    c.box(-6, 4, 2, 3, 1.5, 1.5, *CONT[1])
    return c.im

