import sys, os
from PIL import Image, ImageFilter
import numpy as np
from collections import deque
src, out = sys.argv[1], sys.argv[2]
img = np.array(Image.open(src).convert('RGB')).astype(int); H, W = img.shape[:2]
keys = ['n0','n1','n2','n3','n4','n5','n6','n7','n8','n9','dot','sl','bs','st','mi','pl','eq','pc','qu','ex']
def comps(mask):
    lab = np.zeros(mask.shape, int); n = 0; sizes = {}
    for y, x in zip(*np.where(mask)):
        if lab[y, x]: continue
        n += 1; q = deque([(y, x)]); lab[y, x] = n; c = 0
        while q:
            cy, cx = q.popleft(); c += 1
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = cy+dy, cx+dx
                if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; q.append((ny, nx))
        sizes[n] = c
    return lab, sizes
for i, k in enumerate(keys):
    cx, cy = i % 5, i // 5
    a = img[int(cy*H/4)+4:int((cy+1)*H/4)-4, int(cx*W/5)+4:int((cx+1)*W/5)-4]
    m, M = a.min(2), a.max(2); white = (m > 228) & (M - m < 22)
    lab, sizes = comps(~white); big = max(sizes.values())
    keep = np.isin(lab, [n for n, c in sizes.items() if c > big * .06])
    km = Image.fromarray((keep*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.7))
    o = Image.fromarray(a.astype(np.uint8)).convert('RGBA'); o.putalpha(km)
    al = np.array(o)[:, :, 3]; ys, xs = np.where(al > 20)
    o = o.crop((max(0, xs.min()-2), max(0, ys.min()-2), xs.max()+3, ys.max()+3))
    o = o.resize((max(1, round(o.width*.78)), max(1, round(o.height*.78))), Image.LANCZOS)
    o.save(os.path.join(out, f'ltr-{k}.webp'), 'WEBP', quality=88, method=6); print(k, o.size, end='  ')
