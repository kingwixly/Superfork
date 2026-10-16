"""Tiny isometric pixel-art kit for 32x32 building sprites (EPX'd to 64)."""
import numpy as np
from PIL import Image, ImageDraw

def hexc(h, a=255):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (a,)
def mul(c, k): return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (c[3],)

class Canvas:
    def __init__(self, ox=16, oy=24):
        self.im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.ox, self.oy = ox, oy
    # iso: i -> right-down, j -> left-down, k -> up. 2:1 diamonds.
    def P(self, i, j, k):
        return (self.ox + (i - j), self.oy + (i + j) / 2 - k)
    def poly(self, pts, c):
        self.d.polygon([(round(x), round(y)) for x, y in pts], fill=c)
    def px(self, x, y, c):
        if 0 <= x < 32 and 0 <= y < 32: self.im.putpixel((int(x), int(y)), c)
    def line(self, a, b, c):
        self.d.line([tuple(map(round, a)), tuple(map(round, b))], fill=c)
    def box(self, i, j, k, w, d, h, top, left, right, edge=None):
        P = self.P
        # right face (i = i+w), left face (j = j+d), top
        self.poly([P(i+w, j, k), P(i+w, j+d, k), P(i+w, j+d, k+h), P(i+w, j, k+h)], right)
        self.poly([P(i, j+d, k), P(i+w, j+d, k), P(i+w, j+d, k+h), P(i, j+d, k+h)], left)
        self.poly([P(i, j, k+h), P(i+w, j, k+h), P(i+w, j+d, k+h), P(i, j+d, k+h)], top)
        if edge:
            self.line(P(i+w, j+d, k), P(i+w, j+d, k+h), edge)
    def windows(self, i, j, k, w, d, h, c, face='both', every=2, rows=2):
        P = self.P
        import numpy as _np
        for kk in _np.arange(k + 2, k + h - 1, rows):
            if face in ('both', 'left'):
                for ii in _np.arange(i + 1, i + w, every):
                    x, y = P(ii, j + d, kk); self.px(x, y, c)
            if face in ('both', 'right'):
                for jj in _np.arange(j + 1, j + d, every):
                    x, y = P(i + w, jj, kk); self.px(x, y, c)
    def stripe(self, i, j, k, w, d, c):
        """Horizontal light band around the two visible faces at height k."""
        P = self.P
        self.line(P(i, j + d, k), P(i + w, j + d, k), c)
        self.line(P(i + w, j + d, k), P(i + w, j, k), c)
    def paste(self, img, dx=0, dy=0):
        t = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); t.paste(img, (dx, dy), img)
        self.im = Image.alpha_composite(self.im, t); self.d = ImageDraw.Draw(self.im)

def glow(im, color, strength=0.55):
    """Soft 1px halo around pixels of exactly `color` (for neon parts)."""
    a = np.array(im).astype(float)
    mask = np.all(a[..., :3] == np.array(color[:3]), axis=-1) & (a[..., 3] > 0)
    out = a.copy()
    for dy, dx in ((0,1),(0,-1),(1,0),(-1,0)):
        sh = np.roll(np.roll(mask, dy, 0), dx, 1)
        near = sh & ~mask
        for ch in range(3):
            out[..., ch] = np.where(near, out[..., ch] * (1 - strength) + color[ch] * strength, out[..., ch])
        out[..., 3] = np.where(near & (a[..., 3] == 0), 140, out[..., 3])
    return Image.fromarray(out.clip(0, 255).astype('uint8'), 'RGBA')

def epx(src):
    a = np.array(src); h, w, _ = a.shape; out = np.zeros((h*2, w*2, 4), dtype=a.dtype)
    g = lambda y, x: tuple(a[min(max(y,0),h-1), min(max(x,0),w-1)])
    for y in range(h):
        for x in range(w):
            P=g(y,x);A=g(y-1,x);B=g(y,x+1);C=g(y,x-1);D=g(y+1,x);o=[P,P,P,P]
            if C==A and C!=D and A!=B:o[0]=A
            if A==B and A!=C and B!=D:o[1]=B
            if D==C and D!=B and C!=A:o[2]=C
            if B==D and B!=A and D!=C:o[3]=D
            out[2*y,2*x],out[2*y,2*x+1],out[2*y+1,2*x],out[2*y+1,2*x+1]=o
    return Image.fromarray(out, 'RGBA')

def sheet(rows, path, bg=(214, 200, 152, 255), z=4):
    """rows: list of lists of 32px images -> preview of EPX'd 64px at zoom z."""
    cw = 64 * z + 12
    W = max(len(r) for r in rows) * cw + 12; H = len(rows) * cw + 12
    s = Image.new('RGBA', (W, H), bg)
    for r, row in enumerate(rows):
        for c, im in enumerate(row):
            big = epx(im).resize((64 * z, 64 * z), Image.NEAREST)
            s.paste(big, (12 + c * cw, 12 + r * cw), big)
    s.save(path)

def edge_clear(im):
    """True when nothing touches the outermost pixel ring (no clipping)."""
    a = np.array(im)[..., 3]
    return a[0].max() == 0 and a[-1].max() == 0 and a[:, 0].max() == 0 and a[:, -1].max() == 0
