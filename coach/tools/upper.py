import sys, os
from PIL import Image, ImageFilter
import numpy as np
src, out = sys.argv[1], sys.argv[2]
img = np.array(Image.open(src).convert('RGB')).astype(int)
mn, mx = img.min(2), img.max(2)
ink = (mn < 225) | (mx - mn > 25)
def runs(v, gap):
    idx = np.where(v)[0]; res = []; s = idx[0]; p = idx[0]
    for i in idx[1:]:
        if i - p > gap: res.append((s, p)); s = i
        p = i
    res.append((s, p)); return res
bands = [r for r in runs(ink.sum(1) > 2, 25) if r[1] - r[0] > 60]
med = np.median([b[1] - b[0] for b in bands]); rows = []
for b in bands:
    if b[1] - b[0] > 1.5 * med:
        sub = runs(ink[b[0]:b[1] + 1, :780].sum(1) > 2, 25)
        top = (b[0] + sub[0][0], b[0] + sub[0][1]); rows.append((top, 5)); rows.append(((top[1] + 10, b[1]), 1))
    else: rows.append((b, 5))
k = 0
for (y0, y1), n in rows:
    v = ink[y0:y1 + 1].sum(0) > 1
    rr = runs(v, 3)
    if n == 1:
        big = max(runs(v, 40), key=lambda r: r[1] - r[0]); rr = [r for r in rr if r[0] >= big[0] and r[1] <= big[1]]
    gaps = sorted(range(len(rr) - 1), key=lambda i: rr[i + 1][0] - rr[i][1], reverse=True)[:n - 1]
    cuts = sorted(gaps); groups = []; st = 0
    for c in cuts: groups.append((rr[st][0], rr[c][1])); st = c + 1
    groups.append((rr[st][0], rr[-1][1]))
    for (x0, x1) in groups:
        # 只留大寫：找大小寫之間的分界（優先找空白，否則找墨水最少的欄）
        col = ink[y0:y1 + 1, x0:x1 + 1].sum(0); W = x1 - x0 + 1
        lo, hi = int(W * .38), int(W * .78)
        zero = [i for i in range(lo, hi) if col[i] == 0]
        cut = zero[0] if zero else lo + int(np.argmin(col[lo:hi]))
        x1 = x0 + cut - 1
        while col[x1 - x0] == 0 and x1 > x0: x1 -= 1
        sub = ink[y0:y1 + 1, x0:x1 + 1]; ys = np.where(sub.sum(1) > 3)[0]
        a = img[y0 + ys[0] - 6:y0 + ys[-1] + 7, x0 - 6:x1 + 7]
        m, M = a.min(2), a.max(2)
        alpha = np.where((m > 228) & (M - m < 22), 0, 255).astype(np.uint8)
        al = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.7))
        o = Image.fromarray(a.astype(np.uint8)).convert('RGBA'); o.putalpha(al)
        o = o.resize((round(o.width * .6), round(o.height * .6)), Image.LANCZOS)
        nm = chr(97 + k); o.save(os.path.join(out, f'ltr-{nm}.webp'), 'WEBP', quality=88, method=6); print(nm, o.size, end='  '); k += 1
print('\ntotal', k)
