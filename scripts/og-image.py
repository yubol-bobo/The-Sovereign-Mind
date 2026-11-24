"""Draw site/og.png, the 1200x630 picture shown when the site's link is shared.

Run from the repo root:  python3 scripts/og-image.py
Needs Pillow and a CJK font (set OG_FONT to its path if the default is missing).
"""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
FONT = os.environ.get('OG_FONT', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc')
COLORS = ['#5b9bf5', '#ff7a4d', '#33c08d', '#f0b03a', '#f07aa8', '#a089ff', '#35bccd', '#f0665b', '#86c452', '#8590ff', '#cf9763']
rng = random.Random(7)


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def glow(img, xy, r, color, alpha):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = xy
    d.ellipse((x - r, y - r, x + r, y + r), fill=(*color, alpha))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(r * 0.45)))


img = Image.new('RGBA', (W, H), (5, 4, 10, 255))
# nebulae
glow(img, (180, 120), 260, (255, 96, 56), 70)
glow(img, (1010, 190), 300, (122, 77, 255), 80)
glow(img, (820, 600), 320, (47, 107, 255), 55)

# stars
d = ImageDraw.Draw(img)
for _ in range(900):
    x, y = rng.random() * W, rng.random() * H
    r = rng.choice([0.6, 0.8, 1, 1, 1.4, 2])
    a = rng.randint(70, 255)
    d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, a))

# the galaxy: tilted rings of book "spines" around a glowing core
cx, cy, tilt = 905, 330, 0.36
try:
    n = len(json.load(open('site/data/books.json', encoding='utf-8'))['books'])
except Exception:
    n = 161
rings = [(120, 7), (205, 24), (275, n - 31)]
ring_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
rd = ImageDraw.Draw(ring_layer)
for R, _ in rings:
    rd.ellipse((cx - R, cy - R * tilt, cx + R, cy + R * tilt), outline=(255, 255, 255, 40), width=1)
img.alpha_composite(ring_layer)

glow(img, (cx, cy), 120, (255, 122, 77), 150)
glow(img, (cx, cy), 55, (255, 200, 160), 230)
d = ImageDraw.Draw(img)
d.ellipse((cx - 26, cy - 26, cx + 26, cy + 26), fill=(255, 236, 220, 255))

spines = []
for ri, (R, count) in enumerate(rings):
    for i in range(count):
        t = i / count * math.tau + ri * 0.4
        x, y = cx + math.cos(t) * R, cy + math.sin(t) * R * tilt
        depth = math.sin(t)  # >0 is in front of the core
        spines.append((depth, x, y, COLORS[(i + ri * 3) % len(COLORS)], ri))
for depth, x, y, c, ri in sorted(spines):
    s = 0.75 + 0.35 * (depth + 1) / 2
    w, h = (7 if ri < 2 else 4.5) * s, (26 if ri == 0 else 20 if ri == 1 else 15) * s
    col = rgb(c)
    lit = rng.random() < 0.3 or ri == 0
    if lit:
        glow(img, (x, y), 14 * s, col, 120)
        d = ImageDraw.Draw(img)
    alpha = 255 if lit else 150
    d.rounded_rectangle((x - w / 2, y - h / 2, x + w / 2, y + h / 2), radius=2, fill=(*col, alpha))

# fade the left side so the title reads cleanly
fade = Image.new('L', (W, 1))
for x in range(W):
    fade.putpixel((x, 0), int(max(0, 1 - x / 760) ** 1.4 * 200))
shade = Image.new('RGBA', (W, H), (5, 4, 10, 255))
shade.putalpha(fade.resize((W, H)))
img.alpha_composite(shade)

d = ImageDraw.Draw(img)
title = ImageFont.truetype(FONT, 132)
sub = ImageFont.truetype(FONT, 34)
small = ImageFont.truetype(FONT, 24)
d.text((80, 112), 'AI 时代的终身阅读计划', font=small, fill=(255, 122, 77, 255))
# soft glow behind the title
tl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(tl).text((76, 160), '精神主权', font=title, fill=(255, 122, 77, 160))
img.alpha_composite(tl.filter(ImageFilter.GaussianBlur(18)))
d = ImageDraw.Draw(img)
d.text((76, 160), '精神主权', font=title, fill=(250, 244, 236, 255))
d.text((82, 320), 'The Sovereign Mind', font=sub, fill=(205, 196, 186, 255))
d.text((82, 420), f'{n} 本书 · 11 个星区 · 一年 24 本主线', font=small, fill=(160, 152, 170, 255))

img.convert('RGB').save('site/og.png', optimize=True)
print('wrote site/og.png')
