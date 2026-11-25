import sys, os, glob, collections
import numpy as np
from PIL import Image
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
