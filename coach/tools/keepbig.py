import sys
from PIL import Image
import numpy as np
from collections import deque
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGBA'); a = np.array(im); al = a[:, :, 3] > 40
    H, W = al.shape; lab = np.zeros((H, W), int); best = (0, 0); n = 0
    for y in range(H):
        for x in range(W):
            if al[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n; c = 0
                while q:
                    cy, cx = q.popleft(); c += 1
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and al[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; q.append((ny, nx))
                if c > best[0]: best = (c, n)
    keep = lab == best[1]
    from PIL import ImageFilter
    km = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    a[:, :, 3] = np.minimum(a[:, :, 3], np.array(km))
    ys, xs = np.where(a[:, :, 3] > 10)
    Image.fromarray(a[max(0, ys.min() - 2):ys.max() + 3, max(0, xs.min() - 2):xs.max() + 3]).save(f, 'WEBP', quality=88, method=6)
    print(f.split('/')[-1], Image.open(f).size, end='  ')
