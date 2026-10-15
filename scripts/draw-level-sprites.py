"""
Superfork: draws the level-tier sprites (tiers 2-4) for City, Port, Missile
Silo and SAM Launcher from their original 32px art in
resources/images/buildings/, then doubles them to 64px with EPX like the base
sprites. Writes resources/icons/structures_hd/levels/<name>_<tier>.png.

    python3 scripts/draw-level-sprites.py
    node scripts/generate-sprite-atlases.mjs

Higher tiers add more of the same building behind the original (shaded for
depth), plus extras: shipping containers for ports, a glass tower that becomes
a skyscraper with a beacon for cities.
"""
import numpy as np
from PIL import Image
import os as _os
ROOT=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..')
B=_os.path.join(ROOT,'resources/images/buildings/')
OUT=_os.path.join(ROOT,'resources/icons/structures_hd/levels/')

def load(f): return Image.open(B+f+'.png').convert('RGBA')
def canvas(): return Image.new('RGBA',(32,32),(0,0,0,0))
def shade(im,k):
    a=np.array(im).astype(float); a[...,:3]*=k; return Image.fromarray(a.clip(0,255).astype('uint8'),'RGBA')
def put(dst,src,dx,dy):
    tmp=Image.new('RGBA',dst.size,(0,0,0,0)); tmp.paste(src,(dx,dy),src); return Image.alpha_composite(dst,tmp)
def px(im,pts,c):
    for x,y in pts:
        if 0<=x<32 and 0<=y<32: im.putpixel((x,y),c)
def hexc(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))+(255,)

def iso_box(im, x0, ybase, w, h, top, left, right, win=None, winr=None, step=3):
    """Isometric-ish box: left face w px wide, right face w px, height h, top diamond."""
    for i in range(w):            # left face (x0..x0+w-1), slopes down to the right
        yb=ybase+i//2
        for y in range(yb-h, yb+1): px(im,[(x0+i,y)],left)
        if win and h>4:
            for y in range(yb-h+2, yb-1, step):
                if i%2==1 and i<w-1: px(im,[(x0+i,y)],win)
    for i in range(w):            # right face, slopes up to the right
        yb=ybase+(w-1)//2-i//2
        for y in range(yb-h, yb+1): px(im,[(x0+w+i,y)],right)
        if winr and h>4:
            for y in range(yb-h+2, yb-1, step):
                if i%2==0 and i>0: px(im,[(x0+w+i,y)],winr)
    # top diamond
    for i in range(w):
        for j in range(w):
            x=x0+i+j; y=ybase-h-(w//2)+ (i//2) - (j//2) + (w//2) - 1
            px(im,[(x,y)],top)

def epx(src):
    a=np.array(src);h,w,_=a.shape;out=np.zeros((h*2,w*2,4),dtype=a.dtype)
    g=lambda y,x:tuple(a[min(max(y,0),h-1),min(max(x,0),w-1)])
    for y in range(h):
        for x in range(w):
            P=g(y,x);A=g(y-1,x);Bq=g(y,x+1);C=g(y,x-1);D=g(y+1,x);o=[P,P,P,P]
            if C==A and C!=D and A!=Bq:o[0]=A
            if A==Bq and A!=C and Bq!=D:o[1]=Bq
            if D==C and D!=Bq and C!=A:o[2]=C
            if Bq==D and Bq!=A and D!=C:o[3]=D
            out[2*y,2*x],out[2*y,2*x+1],out[2*y+1,2*x],out[2*y+1,2*x+1]=o
    return Image.fromarray(out,'RGBA')

RED=hexc('#ff2c00'); RED2=hexc('#ff8585'); GOLD=hexc('#f2c14e')

# ---------------- City ----------------
city=load('cityAlt1')
def tower(im, x0, ybase, h):
    iso_box(im,x0,ybase,4,h,hexc('#7edfb6'),hexc('#96d7db'),hexc('#668284'),win=hexc('#3a3f40'),winr=hexc('#0f191b'))
def city_t(t):
    im=canvas()
    if t>=3: im=put(im,shade(city,.82),-5,-5)
    if t>=2: im=put(im,shade(city,.9),4,-5)
    if t>=3:
        # A glass tower rising out of the middle: mid-rise at 3, skyscraper
        # with an antenna and a red beacon at 4.
        base = 20
        h = 12 if t == 3 else 15
        sk=canvas(); tower(sk,12,base,h)
        if t>=4:
            top=base-h-3
            px(sk,[(16,top),(16,top-1)],hexc('#7d9d9f')); px(sk,[(16,top-2)],RED)
        im=put(im,sk,0,0)
    im=put(im,city,0,0)
    return im

# ---------------- Port ----------------
port=load('port1')
CONT=[hexc('#b6460d'),hexc('#1f5aa6'),hexc('#2e8b57'),hexc('#d6cf2b')]
def containers(im, x0, ybase, n, layers=1):
    for L in range(layers):
        for k in range(n):
            c=CONT[(k+L*2)%len(CONT)]
            dark=tuple(int(v*.7) for v in c[:3])+(255,)
            iso_box(im,x0+k*3,ybase+ (k*3)//2 - L*3,2,2,tuple(min(255,int(v*1.2)) for v in c[:3])+(255,),c,dark)
def port_t(t):
    im=canvas()
    if t>=3:
        crane=port.crop((4,6,24,26)); im=put(im,shade(crane,.85),11,0)
    im=put(im,port,0,0)
    if t>=2:
        c=canvas(); containers(c,18,27,3,1 if t<4 else 2); im=put(im,c,0,0)
    if t>=4:
        c=canvas(); containers(c,2,25,2,2); im=put(im,c,0,0)
    return im

# ---------------- Silo / SAM: more launchers ----------------
def multi(base, t, beacon):
    im=canvas()
    if t>=3: im=put(im,shade(base,.8),-6,-5)
    if t>=2: im=put(im,shade(base,.88),6,-5)
    if t>=4: im=put(im,shade(base,.8),0,-9)
    im=put(im,base,0,0)
    return im
silo=load('silo1'); sam=load('silo4')

S={}
for t in (2,3,4):
    S[f'city_{t}']=city_t(t)
    S[f'port_{t}']=port_t(t)
    S[f'missile_silo_{t}']=multi(silo,t,RED)
    S[f'sam_launcher_{t}']=multi(sam,t,RED2)
import os
os.makedirs(OUT,exist_ok=True)
for k,v in S.items(): epx(v).save(OUT+k+'.png')
print('wrote', len(S), 'level sprites to', OUT)
