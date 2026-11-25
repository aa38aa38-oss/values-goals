import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slice_lib import bg_mask
from PIL import Image
import numpy as np
im, out = sys.argv[1], sys.argv[2]
for n, f in (('day', '13.jpg'), ('noon', '15.jpg'), ('night', '14.jpg')):
    Image.open(os.path.join(im, f)).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, f'room-{n}.webp'), 'WEBP', quality=82, method=6)
sheets = {'16.jpg': ['kb', 'rack', 'tread', 'bag', 'ball', 'clock', 'poster', 'mirror', 'rug'], '17.jpg': ['gloves', 'bike', 'speaker', 'lamp', 'rope', 'hang', 'fridge', 'scale', 'roller']}
for f, names in sheets.items():
    img = Image.open(os.path.join(im, f)).convert('RGB'); W, H = img.size
    for i, nm in enumerate(names):
        cx, cy = i % 3, i // 3
        box = (int(cx * W / 3) + 6, int(cy * H / 3) + 6, int((cx + 1) * W / 3) - 6, int((cy + 1) * H / 3) - 6)
        a = np.array(img.crop(box)); bg, mn = bg_mask(a)
        alpha = np.where(bg, 0, 255).astype(np.uint8)
        ys, xs = np.where(alpha > 20)
        o = Image.fromarray(np.dstack([a, alpha])[max(0, ys.min() - 3):ys.max() + 4, max(0, xs.min() - 3):xs.max() + 4], 'RGBA')
        o.thumbnail((300, 300), Image.LANCZOS)
        o.save(os.path.join(out, f'decor-{nm}.webp'), 'WEBP', quality=85, method=6)
        print(nm, o.size)
