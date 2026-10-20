"""Lab sprites (progression): base + tiers 2-4, and the white map icon."""
import os
from kit import *
from PIL import Image, ImageDraw

CON_T, CON_L, CON_R = hexc('#d9d6cc'), hexc('#b3afa3'), hexc('#85817a')
ROOF_T, ROOF_L, ROOF_R = hexc('#5c6b7a'), hexc('#46525e'), hexc('#323b44')
PAD_T, PAD_L, PAD_R = hexc('#9aa3a8'), hexc('#7b8388'), hexc('#5d6469')
GLASS_T, GLASS_L, GLASS_R = hexc('#cfeff7'), hexc('#8cc7da'), hexc('#5a93a8')
WIN, WIN_D = hexc('#e9fbff'), hexc('#24414d')
DOME, DOME_S, SLIT = hexc('#e8ecef'), hexc('#aab3ba'), hexc('#2a3440')
GREEN = hexc('#5ef08a')     # lab light (flask glow)
DISH, DISH_S = hexc('#f0f2f4'), hexc('#9aa4ad')
AVI = hexc('#ff3b2f')


def pad(c, s=10):
    c.box(-s / 2, -s / 2, 0, s, s, 1, PAD_T, PAD_L, PAD_R)


def dome(c, i, j, k, r):
    x, y = c.P(i, j, k)
    c.d.pieslice([x - r, y - r, x + r, y + r], 180, 360, fill=DOME)
    c.d.pieslice([x - r, y - r, x + r, y + r], 270, 360, fill=DOME_S)
    c.line((x, y - r), (x, y - 1), SLIT)            # observatory slit


def dish(c, i, j, k):
    x, y = c.P(i, j, k)
    c.line((x, y), (x, y - 3), DISH_S)               # mast
    c.d.ellipse([x - 3, y - 6, x + 2, y - 3], fill=DISH)
    c.px(x - 1, y - 5, DISH_S)
    c.px(x + 2, y - 7, DISH_S)                       # feed horn


def base():
    c = Canvas(16, 23); pad(c, 9)
    c.box(-4, -3, 1, 8, 6, 5, CON_T, CON_L, CON_R)
    c.windows(-4, -3, 1, 8, 6, 5, WIN_D, rows=3)
    c.box(-4, -3, 6, 8, 6, 1, ROOF_T, ROOF_L, ROOF_R)
    dome(c, 0, 0, 7, 3)
    x, y = c.P(-4, 3, 2); c.px(x + 2, y, GREEN); c.px(x + 3, y, GREEN)
    return glow(c.im, GREEN)


def t2():
    c = Canvas(16, 23); pad(c)
    c.box(-5, -4, 1, 7, 6, 6, CON_T, CON_L, CON_R)
    c.windows(-5, -4, 1, 7, 6, 6, WIN_D, rows=2)
    c.box(-5, -4, 7, 7, 6, 1, ROOF_T, ROOF_L, ROOF_R)
    dome(c, -1.5, -1, 8, 3)
    c.box(2, -1, 1, 3, 5, 3, CON_T, CON_L, CON_R)    # annex
    c.windows(2, -1, 1, 3, 5, 3, hexc('#ffe28a'), rows=3)
    dish(c, 3.5, 1.5, 4)
    x, y = c.P(-5, 2, 2); c.px(x + 2, y, GREEN); c.px(x + 4, y, GREEN)
    return glow(c.im, GREEN)


def t3():
    c = Canvas(16, 24); pad(c)
    # research campus: long block, glass atrium, dome and dish
    c.box(-5, -5, 1, 10, 4, 5, CON_T, CON_L, CON_R)
    c.windows(-5, -5, 1, 10, 4, 5, WIN_D, rows=2)
    c.box(-5, -5, 6, 10, 4, 1, ROOF_T, ROOF_L, ROOF_R)
    c.box(-5, 0, 1, 5, 5, 7, GLASS_T, GLASS_L, GLASS_R)
    c.windows(-5, 0, 1, 5, 5, 7, WIN, rows=2)
    dome(c, 2.5, -3, 7, 3)
    c.box(1, 1, 1, 4, 4, 3, CON_T, CON_L, CON_R)
    dish(c, 3, 3, 4)
    x, y = c.P(-1, 2, 9); c.px(x, y, GREEN)
    return glow(c.im, GREEN)


def t4():
    c = Canvas(16, 25); pad(c, 9.5)
    # national laboratory: glass research tower over a campus, two domes,
    # big dish. Modern, not sci-fi.
    c.box(-5, -5, 1, 10, 3, 4, CON_T, CON_L, CON_R)
    c.windows(-5, -5, 1, 10, 3, 4, WIN_D, rows=2)
    c.box(-4, -1, 1, 4, 4, 13, GLASS_T, GLASS_L, GLASS_R)
    c.windows(-4, -1, 1, 4, 4, 13, WIN, rows=2)
    c.box(-4, -1, 14, 4, 4, 1, ROOF_T, ROOF_L, ROOF_R)
    x, y = c.P(-2, 1, 15); c.line((x, y), (x, y - 2), DISH_S); c.px(x, y - 3, AVI)
    dome(c, 3, -3.5, 5, 3)
    dome(c, -3, -4, 5, 2)
    c.box(1.5, 1.5, 1, 3.5, 3.5, 3, CON_T, CON_L, CON_R)
    dish(c, 3.2, 3.2, 4)
    x, y = c.P(-4, 3, 3); c.px(x + 1, y, GREEN); c.px(x + 3, y + 1, GREEN)
    return glow(c.im, GREEN)


def icon64():
    """White silhouette for the -gon icon atlas: a lab flask."""
    S = 4
    im = Image.new('RGBA', (64 * S, 64 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    W = (255, 255, 255, 255)
    cx = 32 * S
    # neck
    d.rectangle([cx - 5 * S, 12 * S, cx + 5 * S, 28 * S], fill=W)
    d.rounded_rectangle([cx - 8 * S, 9 * S, cx + 8 * S, 14 * S], radius=2 * S, fill=W)
    # body (triangle flask with rounded base)
    d.polygon([(cx - 5 * S, 27 * S), (cx + 5 * S, 27 * S), (cx + 18 * S, 50 * S),
               (cx - 18 * S, 50 * S)], fill=W)
    d.rounded_rectangle([cx - 19 * S, 46 * S, cx + 19 * S, 54 * S], radius=3 * S, fill=W)
    # liquid line cut-out and bubbles, so it reads at small sizes
    d.line([(cx - 13 * S, 41 * S), (cx + 13 * S, 41 * S)], fill=(0, 0, 0, 0), width=2 * S)
    d.ellipse([cx - 4 * S, 44 * S, cx + 0 * S, 48 * S], fill=(0, 0, 0, 0))
    d.ellipse([cx + 3 * S, 46 * S, cx + 6 * S, 49 * S], fill=(0, 0, 0, 0))
    return im.resize((64, 64), Image.LANCZOS)
