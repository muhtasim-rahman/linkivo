#!/usr/bin/env python3
"""
Linkivo make-play-poster.py (v2.5.6)
Purpose: GitHub's README can not play video or show a player (it removes scripts and styles), so the video is a picture that links to YouTube. This script draws a YouTube-style
         play button and a small label onto the poster, so a visitor sees at once that it is a video. Re-run it whenever assets/promo/linkivo-intro.jpg changes:
             python3 "@ Creator/tools/make-play-poster.py"
Needs:   Pillow (pip install pillow). Not part of the app; only used by the owner/agent when the poster changes.
Reads:   assets/promo/linkivo-intro.jpg      Writes: assets/promo/linkivo-intro-play.jpg  (the file README.md shows)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = Path(__file__).resolve().parents[2]
src, out = root / 'assets/promo/linkivo-intro.jpg', root / 'assets/promo/linkivo-intro-play.jpg'
SCALE = 4                                    # draw big, shrink: smooth edges without an anti-aliasing helper

img = Image.open(src).convert('RGB'); W, H = img.size
# 1) a soft dark veil so the white triangle and the label read on any poster
veil = Image.new('RGB', (W, H), (0, 0, 0)); img = Image.blend(img, veil, 0.22)
# 2) bottom gradient for the label
grad = Image.new('L', (1, H)); gd = grad.load()
for y in range(H): gd[0, y] = int(max(0, (y - H * 0.72) / (H * 0.28)) * 150)
img.paste(Image.new('RGB', (W, H), (0, 0, 0)), (0, 0), grad.resize((W, H)))

# 3) the play button: a rounded red rectangle with a white triangle (the shape people know from YouTube), with a soft shadow
bw, bh = round(W * 0.15), round(W * 0.15 * 0.70); cx, cy = W // 2, H // 2 - round(H * 0.03)
layer = Image.new('RGBA', (W * SCALE, H * SCALE), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
box = [(cx - bw // 2) * SCALE, (cy - bh // 2) * SCALE, (cx + bw // 2) * SCALE, (cy + bh // 2) * SCALE]
shadow = Image.new('RGBA', layer.size, (0, 0, 0, 0)); ImageDraw.Draw(shadow).rounded_rectangle([box[0], box[1] + 10 * SCALE, box[2], box[3] + 10 * SCALE], radius=bh * SCALE // 3, fill=(0, 0, 0, 120))
shadow = shadow.filter(ImageFilter.GaussianBlur(14 * SCALE))
d.rounded_rectangle(box, radius=bh * SCALE // 3, fill=(255, 0, 51, 255))
tw, th = bh * 0.42, bh * 0.46                # triangle, nudged right so it looks centred
tx, ty = cx - tw * 0.30, cy
d.polygon([((tx) * SCALE, (ty - th / 2) * SCALE), ((tx) * SCALE, (ty + th / 2) * SCALE), ((tx + tw) * SCALE, ty * SCALE)], fill=(255, 255, 255, 255))
layer = Image.alpha_composite(shadow, layer).resize((W, H), Image.LANCZOS)
img = Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')

# 4) the label, bottom left: a small pill "Watch on YouTube"
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', round(H * 0.045))
except OSError: font = ImageFont.load_default()
label = 'Watch the introduction on YouTube'
d2 = ImageDraw.Draw(img); l, t, r, b = d2.textbbox((0, 0), label, font=font)
padx, pady, m = round(H * 0.022), round(H * 0.014), round(H * 0.04)
x0, y0 = m, H - m - (b - t) - 2 * pady
pill = Image.new('RGBA', (W, H), (0, 0, 0, 0)); pd = ImageDraw.Draw(pill)
pd.rounded_rectangle([x0, y0, x0 + (r - l) + 2 * padx, y0 + (b - t) + 2 * pady], radius=round(H * 0.03), fill=(0, 0, 0, 150))
img = Image.alpha_composite(img.convert('RGBA'), pill).convert('RGB'); d2 = ImageDraw.Draw(img)
d2.text((x0 + padx - l, y0 + pady - t), label, font=font, fill=(255, 255, 255))

img.save(out, 'JPEG', quality=88, optimize=True, progressive=True)
print(f'wrote {out.relative_to(root)} ({W}x{H}, {out.stat().st_size // 1024} KB)')
