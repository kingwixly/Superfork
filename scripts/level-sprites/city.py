import os
from kit import *
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from PIL import Image
base = Image.open(ROOT + '/resources/images/buildings/cityAlt1.png').convert('RGBA')

GLASS_T, GLASS_L, GLASS_R = hexc('#bfeff2'), hexc('#7fc7d6'), hexc('#4f8fa3')
CON_T, CON_L, CON_R = hexc('#c9c3b5'), hexc('#a39d8f'), hexc('#76716a')
DARK_T, DARK_L, DARK_R = hexc('#3d4b63'), hexc('#2a344a'), hexc('#1b2233')
PLAZA_T, PLAZA_L, PLAZA_R = hexc('#9aa3a8'), hexc('#7b8388'), hexc('#5d6469')
WIN, WIN_D, LIT = hexc('#e9fbff'), hexc('#1d3540'), hexc('#ffe28a')
CYAN, MAG = hexc('#4ff0ff'), hexc('#ff5ad8')
GREEN_T, GREEN_L, GREEN_R = hexc('#7ec850'), hexc('#5a9c38'), hexc('#3f7428')

def plaza(c, t=(PLAZA_T, PLAZA_L, PLAZA_R)):
    c.box(-5, -5, 0, 10, 10, 1, *t)

def t2():
    c = Canvas(16, 23); plaza(c)
    c.box(-5, 1, 1, 4, 4, 1, GREEN_T, GREEN_L, GREEN_R)          # small park
    c.px(*c.P(-3, 2, 3), hexc('#2f6b1f')); c.px(*c.P(-4, 3, 3), hexc('#2f6b1f'))
    c.box(-5, -5, 1, 5, 4, 9, CON_T, CON_L, CON_R)                  # older block (back-left)
    c.windows(-5, -5, 1, 5, 4, 9, WIN_D)
    c.box(1, -5, 1, 4, 4, 14, hexc('#7edfb6'), GLASS_L, GLASS_R)    # glass tower (back-right)
    c.windows(1, -5, 1, 4, 4, 14, WIN, rows=2)
    c.box(0, 1, 1, 5, 4, 6, CON_T, CON_L, CON_R)                    # front low-rise
    c.windows(0, 1, 1, 5, 4, 6, WIN_D)
    return c.im

def t3():
    c = Canvas(16, 23); plaza(c)
    c.box(-5, -5, 1, 4, 4, 12, hexc('#7edfb6'), GLASS_L, GLASS_R)
    c.windows(-5, -5, 1, 4, 4, 12, WIN)
    c.stripe(-5, -5, 7, 4, 4, CYAN)
    c.box(1, -5, 1, 4, 4, 17, hexc('#7edfb6'), GLASS_L, GLASS_R)            # tallest
    c.windows(1, -5, 1, 4, 4, 17, WIN)
    c.stripe(1, -5, 9, 4, 4, CYAN); c.stripe(1, -5, 14, 4, 4, CYAN)
    c.box(2, -4, 18, 2, 2, 2, hexc('#ffffff'), GLASS_L, GLASS_R)   # rooftop crown
    # dome hall front
    c.box(-1, 1, 1, 6, 5, 4, CON_T, CON_L, CON_R)
    c.windows(-1, 1, 1, 6, 5, 4, WIN_D, rows=3)
    x, y = c.P(2, 3.5, 6); c.d.ellipse([x - 3, y - 2, x + 3, y + 2], fill=GLASS_T)
    c.px(x, y - 2, CYAN)
    return c.im

def t4():
    c = Canvas(16, 26)
    c.box(-4, -4, 0, 8, 8, 1, hexc('#4a5568'), hexc('#343d4c'), hexc('#232a35'))
    c.line(c.P(-4, 4, 1), c.P(4, 4, 1), CYAN); c.line(c.P(4, 4, 1), c.P(4, -4, 1), CYAN)
    # magenta side tower, back-right
    c.box(1.5, -3.5, 1, 2, 2, 11, DARK_T, DARK_L, DARK_R)
    c.stripe(1.5, -3.5, 11, 2, 2, MAG); c.stripe(1.5, -3.5, 6, 2, 2, MAG)
    # the spire: tapering stack
    for (o, s_, k0, h) in ((-2, 4, 1, 7), (-1.5, 3, 8, 6), (-1, 2, 14, 5), (-0.5, 1, 19, 1)):
        c.box(o, o, k0, s_, s_, h, DARK_T, DARK_L, DARK_R)
        c.windows(o, o, k0, s_, s_, h, hexc('#7fa8c9'), rows=3, every=2)
        c.stripe(o, o, k0 + h - 1, s_, s_, CYAN)
    x, y = c.P(0, 0, 20); c.line((x, y), (x, y - 1), hexc('#c0d0e0')); c.px(x, y - 2, MAG)
    x, y = c.P(0, 0, 11); c.d.ellipse([x - 6, y - 2, x + 6, y + 2], outline=MAG)
    # redraw the spire's front over the ring's near half so it reads as around it
    c.box(-1.5, -1.5, 8, 3, 3, 6, DARK_T, DARK_L, DARK_R)
    c.windows(-1.5, -1.5, 8, 3, 3, 6, hexc('#7fa8c9'), rows=3, every=2)
    c.stripe(-1.5, -1.5, 13, 3, 3, CYAN)
    x, y = c.P(0, 0, 11)
    for dx in range(-6, 7):
        if abs(dx) >= 3: c.px(x + dx, y + 2 if abs(dx) < 5 else y + 1, MAG)
    return glow(glow(c.im, CYAN, .3), MAG, .3)

