import sys, os, glob, collections
import numpy as np
from PIL import Image
src_dirs = sys.argv[1:-1]; out = sys.argv[-1]
os.makedirs(out, exist_ok=True)
POSES = ['idle','happy','eat','walk','attack','sleep','sick','cry','win']
EGG = ['idle','wobble','crack','hatch']
def bg_mask(a):
    # background = near-white or light neutral grey (divider lines), connected to border
    r,g,b = a[...,0].astype(int),a[...,1].astype(int),a[...,2].astype(int)
    mn = np.minimum(np.minimum(r,g),b); mx = np.maximum(np.maximum(r,g),b)
    cand = (mn > 232) | ((mn > 175) & (mx - mn < 14))
    H,W = cand.shape; seen = np.zeros_like(cand)
    q = collections.deque()
    for x in range(W):
        for y in (0,H-1):
            if cand[y,x] and not seen[y,x]: seen[y,x]=1; q.append((y,x))
    for y in range(H):
        for x in (0,W-1):
            if cand[y,x] and not seen[y,x]: seen[y,x]=1; q.append((y,x))
    while q:
        y,x = q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            yy,xx=y+dy,x+dx
            if 0<=yy<H and 0<=xx<W and cand[yy,xx] and not seen[yy,xx]:
                seen[yy,xx]=1; q.append((yy,xx))
    return seen.astype(bool), mn
def cut(img, n, names, prefix):
    W,H = img.size; cw, ch = W/n, H/n
    for i,name in enumerate(names):
        cx, cy = i % n, i // n
        box = (int(cx*cw)+5, int(cy*ch)+5, int((cx+1)*cw)-5, int((cy+1)*ch)-5)
        a = np.array(img.crop(box).convert('RGB'))
        bg, mn = bg_mask(a)
        alpha = np.where(bg, 0, 255).astype(np.uint8)
        # soften halo: opaque pixels next to background that are very light
        edge = np.zeros_like(bg)
        edge[1:,:] |= bg[:-1,:]; edge[:-1,:] |= bg[1:,:]; edge[:,1:] |= bg[:,:-1]; edge[:,:-1] |= bg[:,1:]
        soft = edge & ~bg & (mn > 200)
        alpha[soft] = np.clip((255 - mn[soft]) * 4, 60, 255).astype(np.uint8)
        rgba = np.dstack([a, alpha])
        ys, xs = np.where(alpha > 20)
        if len(ys) == 0: continue
        y0,y1,x0,x1 = max(0,ys.min()-4), ys.max()+5, max(0,xs.min()-4), xs.max()+5
        im = Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')
        im.thumbnail((360, 360), Image.LANCZOS)
        im.save(os.path.join(out, f'{prefix}-{name}.webp'), 'WEBP', quality=82, method=6)
for d in src_dirs:
    for f in sorted(glob.glob(os.path.join(d, '*.jpg'))):
        base = os.path.basename(f)[:-4]            # e.g. sky-2-elite
        img = Image.open(f)
        if base.endswith('egg'): cut(img, 2, EGG, base)
        else: cut(img, 3, POSES, base)
        print('ok', base)
