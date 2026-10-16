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
BAND = hexc('#e9fbff')   # white mullion band (tiers 3-4)
AVI = hexc('#ff3b2f')    # red aviation light
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
    c.box(1, -5, 1, 4, 4, 17, hexc('#7edfb6'), GLASS_L, GLASS_R)            # tallest
    c.windows(1, -5, 1, 4, 4, 17, WIN)
    c.box(2, -4, 18, 2, 2, 2, hexc('#ffffff'), GLASS_L, GLASS_R)   # rooftop crown
    # dome hall front
    c.box(-1, 1, 1, 6, 5, 4, CON_T, CON_L, CON_R)
    c.windows(-1, 1, 1, 6, 5, 4, WIN_D, rows=3)
    x, y = c.P(2, 3.5, 6); c.d.ellipse([x - 3, y - 2, x + 3, y + 2], fill=GLASS_T)
    c.px(x, y - 2, BAND)
    return c.im

def t4():
    # Modern supertall skyline: a stepped glass supertall with a spire and a
    # red aviation light, flanked by two lower glass towers. No neon.
    c = Canvas(16, 26)
    c.box(-4.5, -4.5, 0, 9, 9, 1, PLAZA_T, PLAZA_L, PLAZA_R)
    c.box(-5, -5, 1, 3, 3, 10, hexc('#7edfb6'), GLASS_L, GLASS_R)
    c.windows(-5, -5, 1, 3, 3, 10, WIN)
    c.box(2, -5, 1, 3, 3, 12, hexc('#7edfb6'), GLASS_L, GLASS_R)
    c.windows(2, -5, 1, 3, 3, 12, WIN)
    for (o, s_, k0, h) in ((-2.5, 5, 1, 8), (-2, 4, 9, 6), (-1.5, 3, 15, 5), (-1, 2, 20, 2)):
        c.box(o, o, k0, s_, s_, h, hexc('#d9f6f8'), hexc('#6fb3c9'), hexc('#3f7f96'))
        c.windows(o, o, k0, s_, s_, h, WIN, rows=2)
    x, y = c.P(0, 0, 22); c.line((x, y), (x, y - 1), hexc('#c0d0e0')); c.px(x, y - 2, AVI)
    c.box(-4, 2.5, 1, 3, 2, 2, CON_T, CON_L, CON_R)                     # low podium, front
    c.windows(-4, 2.5, 1, 3, 2, 2, LIT, face='left', rows=3)
    return c.im

