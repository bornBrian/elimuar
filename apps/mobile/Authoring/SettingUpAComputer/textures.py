"""Draws the practical's colour and height maps into Assets/ElimuARContent/SettingUpAComputer/Textures."""
from __future__ import annotations

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "Assets", "ElimuARContent", os.path.basename(HERE), "Textures")
FONTS = "C:/Windows/Fonts/"
random.seed(7)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONTS + ("arialbd.ttf" if bold else "arial.ttf"), size)


def mono(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONTS + "consola.ttf", size)


def save(img: Image.Image, name: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, name + ".png"))
    print("wrote", name)


def normal_from_height(height: Image.Image, strength: float = 2.0) -> Image.Image:
    h = np.asarray(height.convert("L"), dtype=np.float32) / 255.0
    dx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
    dy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([(nx / n + 1) * 127.5, (ny / n + 1) * 127.5, (nz / n + 1) * 127.5], -1)
    return Image.fromarray(rgb.astype(np.uint8), "RGB")


def noise(size, amount=8, blur=1.2, base=0):
    a = np.random.default_rng(3).normal(base, amount, (size[1], size[0])).clip(-40, 40)
    img = Image.fromarray((a + 128).astype(np.uint8), "L")
    return img.filter(ImageFilter.GaussianBlur(blur))


def traces(d: ImageDraw.ImageDraw, w: int, h: int, color, count: int, width=3, area=None):
    x0, y0, x1, y1 = area or (0, 0, w, h)
    for _ in range(count):
        x, y = random.randint(x0, x1), random.randint(y0, y1)
        pts = [(x, y)]
        for _ in range(random.randint(2, 5)):
            if random.random() < 0.5:
                x += random.choice([-1, 1]) * random.randint(20, 160)
            else:
                y += random.choice([-1, 1]) * random.randint(20, 160)
            if random.random() < 0.4:
                k = random.randint(10, 50)
                x += random.choice([-1, 1]) * k
                y += random.choice([-1, 1]) * k
            pts.append((max(x0, min(x1, x)), max(y0, min(y1, y))))
        d.line(pts, fill=color, width=width, joint="curve")
        ex, ey = pts[-1]
        d.ellipse((ex - width * 1.6, ey - width * 1.6, ex + width * 1.6, ey + width * 1.6), fill=color)


def chip(d, box, label=None, size=22, color=(22, 22, 24)):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=color)
    d.rectangle((x0 + 3, y0 + 3, x1 - 3, y1 - 3), outline=(40, 40, 44), width=2)
    d.ellipse((x0 + 8, y0 + 8, x0 + 18, y0 + 18), fill=(52, 52, 56))
    if label:
        f = font(size)
        tw = d.textlength(label, font=f)
        d.text(((x0 + x1 - tw) / 2, (y0 + y1) / 2 - size * 0.6), label, font=f, fill=(150, 150, 150))


def motherboard():
    W, H = 2048, 2048
    pcb = (24, 30, 34)
    img = Image.new("RGB", (W, H), pcb)
    hgt = Image.new("L", (W, H), 90)
    d, hd = ImageDraw.Draw(img), ImageDraw.Draw(hgt)
    traces(d, W, H, (38, 50, 54), 520, 4)
    traces(hd, W, H, 120, 520, 4)
    gold = (198, 160, 82)
    for x, y in [(70, 70), (W - 70, 70), (70, H - 70), (W - 70, H - 70), (W // 2, 70), (W // 2, H - 70)]:
        d.ellipse((x - 28, y - 28, x + 28, y + 28), fill=gold)
        d.ellipse((x - 14, y - 14, x + 14, y + 14), fill=(10, 10, 10))
    sf = font(30, True)
    white = (226, 230, 232)
    # Socket footprint (the 3D socket sits on it).
    sx, sy, s = 560, 520, 420
    d.rectangle((sx - 14, sy - 14, sx + s + 14, sy + s + 14), outline=white, width=4)
    d.text((sx, sy - 60), "CPU SOCKET", font=sf, fill=white)
    d.polygon([(sx - 10, sy + s + 10), (sx + 40, sy + s + 10), (sx - 10, sy + s - 40)], fill=white)
    # Memory slot outlines.
    for i, x in enumerate((1180, 1270)):
        d.rectangle((x, 300, x + 46, 1240), outline=white, width=3)
        d.text((x - 6, 260), f"DIMM{i + 1}", font=font(24, True), fill=white)
    # M.2 slot and its standoff.
    d.rectangle((520, 1180, 1460, 1290), outline=white, width=3)
    d.text((520, 1135), "M.2  SSD", font=sf, fill=white)
    d.ellipse((1430, 1220, 1470, 1260), fill=gold)
    # Rear I/O edge.
    d.rectangle((40, 1700, 2008, 2008), outline=white, width=3)
    d.text((60, 1650), "REAR  I/O", font=sf, fill=white)
    # Chips and passives.
    chip(d, (1520, 1500, 1760, 1740), "ELIMU H610", 26)
    chip(d, (300, 1400, 420, 1520))
    chip(d, (1720, 520, 1840, 640))
    for _ in range(260):
        x, y = random.randint(120, W - 120), random.randint(120, H - 300)
        if sx - 40 < x < sx + s + 40 and sy - 80 < y < sy + s + 40:
            continue
        w, h = random.choice([(14, 8), (8, 14), (20, 10)])
        d.rectangle((x, y, x + w, y + h), fill=random.choice([(150, 120, 80), (60, 60, 62), (190, 190, 190)]))
        hd.rectangle((x, y, x + w, y + h), fill=170)
    for i in range(6):
        cx, cy = 380 + i * 34, 380
        d.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=(70, 70, 76))
        d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=(120, 120, 128))
    d.text((1560, 1800), "ELIMU  B-1  MOTHERBOARD", font=font(30, True), fill=white)
    img = Image.blend(img, Image.merge("RGB", [noise((W, H), 6)] * 3), 0.06)
    save(img, "motherboard")
    save(normal_from_height(hgt.filter(ImageFilter.GaussianBlur(1.2)), 3.0), "motherboard_n")


def ram():
    W, H = 2048, 512
    img = Image.new("RGB", (W, H), (22, 96, 64))
    d = ImageDraw.Draw(img)
    traces(d, W, H, (30, 116, 78), 160, 3, (0, 0, W, H - 90))
    for i in range(8):
        x = 120 + i * 230
        chip(d, (x, 120, x + 190, 330), "E4G8", 22)
    d.rectangle((0, H - 90, W, H), fill=(22, 96, 64))
    for i in range(80):
        x = 30 + i * 24.6
        if 930 < x < 990:
            continue
        d.rectangle((x, H - 82, x + 16, H - 6), fill=(214, 172, 88))
    d.rectangle((940, H - 90, 980, H), fill=(0, 0, 0))
    d.rounded_rectangle((1560, 40, 1990, 110), radius=8, fill=(232, 232, 232))
    d.text((1580, 54), "8GB  DDR4-3200", font=font(36, True), fill=(30, 30, 30))
    save(img, "ram")


def cpu():
    W = 1024
    img = Image.new("RGB", (W, W), (24, 104, 70))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((90, 90, W - 90, W - 90), radius=60, fill=(186, 190, 196))
    hgt = Image.new("L", (W, W), 60)
    hd = ImageDraw.Draw(hgt)
    hd.rounded_rectangle((90, 90, W - 90, W - 90), radius=60, fill=200)
    grain = noise((W, W), 10, 0.6)
    steel = Image.merge("RGB", [grain] * 3)
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle((90, 90, W - 90, W - 90), radius=60, fill=255)
    img = Image.composite(Image.blend(img, steel, 0.12), img, mask)
    d = ImageDraw.Draw(img)
    ink = (96, 100, 106)
    d.text((170, 300), "ELIMU", font=font(96, True), fill=ink)
    d.text((170, 420), "CORE  i5", font=font(70, True), fill=ink)
    d.text((170, 520), "3.20 GHz  ·  6 CORES", font=font(44), fill=ink)
    d.text((170, 600), "TZ-2026-0815", font=mono(40), fill=ink)
    d.polygon([(30, W - 30), (90, W - 30), (30, W - 90)], fill=(214, 172, 88))
    save(img, "cpu")
    save(img.crop((90, 90, W - 90, W - 90)), "cpu_ihs")
    save(normal_from_height(hgt.filter(ImageFilter.GaussianBlur(3)), 2.0), "cpu_n")


def ssd():
    W, H = 2048, 512
    img = Image.new("RGB", (W, H), (18, 20, 22))
    d = ImageDraw.Draw(img)
    traces(d, W, H, (34, 38, 42), 120, 3)
    for i in range(60):
        x = 20 + i * 4.2
    d.rectangle((0, 40, 120, H - 40), fill=(18, 20, 22))
    for i in range(24):
        y = 60 + i * 16.5
        if 200 < y < 230:
            continue
        d.rectangle((6, y, 110, y + 10), fill=(214, 172, 88))
    chip(d, (260, 110, 560, 400), None)
    chip(d, (640, 110, 1020, 400), None)
    chip(d, (1100, 110, 1480, 400), None)
    d.rounded_rectangle((300, 140, 1500, 370), radius=10, fill=(236, 236, 236))
    d.text((340, 170), "ELIMU  NVMe  SSD", font=font(64, True), fill=(20, 20, 20))
    d.text((340, 260), "512 GB  ·  M.2 2280", font=font(48), fill=(60, 60, 60))
    d.ellipse((1940, 200, 2040, 300), fill=(214, 172, 88))
    d.ellipse((1965, 225, 2015, 275), fill=(8, 8, 8))
    save(img, "ssd")


def io_panel():
    W, H = 2048, 384
    img = Image.new("RGB", (W, H), (176, 180, 186))
    grain = Image.merge("RGB", [noise((W, H), 12, 0.5)] * 3)
    img = Image.blend(img, grain, 0.1)
    d = ImageDraw.Draw(img)
    ink = (40, 44, 50)
    f = font(28, True)
    for label, x in [("POWER", 150), ("VGA", 470), ("HDMI", 700), ("USB", 960), ("USB", 1140), ("LAN", 1390), ("AUDIO", 1640)]:
        tw = d.textlength(label, font=f)
        d.text((x - tw / 2, 300), label, font=f, fill=ink)
    d.text((1830, 300), "12V", font=f, fill=ink)
    save(img, "io_panel")


def case_front():
    W, H = 2048, 600
    img = Image.new("RGB", (W, H), (34, 36, 40))
    hgt = Image.new("L", (W, H), 100)
    d, hd = ImageDraw.Draw(img), ImageDraw.Draw(hgt)
    for y in range(40, H - 40, 26):
        for x in range(40, 900, 26):
            d.ellipse((x, y, x + 12, y + 12), fill=(18, 18, 20))
            hd.ellipse((x, y, x + 12, y + 12), fill=40)
    d.text((1100, 230), "ELIMU", font=font(110, True), fill=(200, 204, 210))
    d.text((1480, 255), "PC", font=font(80), fill=(225, 35, 26))
    d.ellipse((1840, 220, 1960, 340), outline=(160, 164, 170), width=10)
    d.arc((1868, 248, 1932, 312), 300, 240, fill=(160, 164, 170), width=8)
    d.line([(1900, 236), (1900, 282)], fill=(160, 164, 170), width=8)
    for x in (1100, 1230):
        d.rounded_rectangle((x, 420, x + 100, 470), radius=6, fill=(12, 12, 14))
        d.rectangle((x + 14, 432, x + 86, 446), fill=(60, 110, 200))
    save(img, "case_front")
    save(normal_from_height(hgt.filter(ImageFilter.GaussianBlur(1)), 3.0), "case_front_n")


def psu():
    W = 1024
    img = Image.new("RGB", (W, W), (30, 32, 34))
    hgt = Image.new("L", (W, W), 120)
    d, hd = ImageDraw.Draw(img), ImageDraw.Draw(hgt)
    c = W // 2
    for r in range(80, 440, 44):
        d.ellipse((c - r, c - r, c + r, c + r), outline=(70, 72, 76), width=10)
        hd.ellipse((c - r, c - r, c + r, c + r), outline=220, width=10)
    for a in range(0, 360, 45):
        x, y = c + 440 * math.cos(math.radians(a)), c + 440 * math.sin(math.radians(a))
        d.line([(c, c), (x, y)], fill=(70, 72, 76), width=10)
        hd.line([(c, c), (x, y)], fill=220, width=10)
    d.ellipse((c - 90, c - 90, c + 90, c + 90), fill=(60, 62, 66))
    d.text((c - 60, c - 20), "300W", font=font(40, True), fill=(220, 220, 220))
    save(img, "psu")
    save(normal_from_height(hgt.filter(ImageFilter.GaussianBlur(2)), 3.0), "psu_n")


def keyboard():
    W, H = 2048, 680
    img = Image.new("RGB", (W, H), (26, 27, 30))
    hgt = Image.new("L", (W, H), 30)
    d, hd = ImageDraw.Draw(img), ImageDraw.Draw(hgt)
    rows = [
        ["Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"],
        ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", ("Back", 2)],
        [("Tab", 1.5), "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", ("\\", 1.5)],
        [("Caps", 1.8), "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", ("Enter", 2.2)],
        [("Shift", 2.3), "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", ("Shift", 2.7)],
        [("Ctrl", 1.4), ("Win", 1.2), ("Alt", 1.3), ("", 6.6), ("Alt", 1.3), ("Fn", 1.2), ("Ctrl", 1.4)],
    ]
    u, gap, top = 104, 10, 30
    for r, row in enumerate(rows):
        x = 30
        y = top + r * (u + gap) + (16 if r > 0 else 0)
        for k in row:
            label, span = (k, 1) if isinstance(k, str) else k
            w = u * span + gap * (span - 1)
            d.rounded_rectangle((x, y, x + w, y + u), radius=14, fill=(44, 46, 50))
            d.rounded_rectangle((x + 8, y + 6, x + w - 8, y + u - 12), radius=10, fill=(54, 56, 61))
            hd.rounded_rectangle((x, y, x + w, y + u), radius=14, fill=200)
            hd.rounded_rectangle((x + 8, y + 6, x + w - 8, y + u - 12), radius=10, fill=235)
            f = font(34 if len(label) <= 2 else 24, True)
            d.text((x + 18, y + 14), label, font=f, fill=(222, 224, 228))
            x += w + gap
    x0 = 1640
    for r in range(4):
        for c in range(3):
            x, y = x0 + c * (u + gap), top + (r + 1) * (u + gap) + 16
            d.rounded_rectangle((x, y, x + u, y + u), radius=14, fill=(44, 46, 50))
            d.rounded_rectangle((x + 8, y + 6, x + u - 8, y + u - 12), radius=10, fill=(54, 56, 61))
            hd.rounded_rectangle((x, y, x + u, y + u), radius=14, fill=200)
            hd.rounded_rectangle((x + 8, y + 6, x + u - 8, y + u - 12), radius=10, fill=235)
            d.text((x + 34, y + 20), "789456123"[r * 3 + c] if r < 3 else ["0", ".", "+"][c], font=font(34, True), fill=(222, 224, 228))
    save(img, "keyboard")
    save(normal_from_height(hgt.filter(ImageFilter.GaussianBlur(2.5)), 4.0), "keyboard_n")


def screen():
    W, H = 1920, 1080
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    r = 16 + 30 * x + 10 * y
    g = 50 + 70 * x + 20 * (1 - y)
    b = 110 + 110 * (1 - y) * (0.6 + 0.4 * x)
    img = Image.fromarray(np.stack([r + 0 * y, g + 0 * y, b + 0 * x], -1).clip(0, 255).astype(np.uint8), "RGB")
    d = ImageDraw.Draw(img)
    d.text((W // 2 - 330, H // 2 - 120), "Elimu", font=font(150, True), fill=(255, 255, 255))
    d.text((W // 2 + 150, H // 2 - 120), "AR", font=font(150, True), fill=(255, 92, 80))
    d.text((W // 2 - 290, H // 2 + 60), "Computer Studies Lab  ·  PC 07", font=font(44), fill=(220, 230, 245))
    for i, name in enumerate(["Files", "Browser", "Notes", "Paint"]):
        d.rounded_rectangle((60, 60 + i * 170, 180, 180 + i * 170), radius=22, fill=(255, 255, 255, 40), outline=(220, 230, 245), width=3)
        d.text((60, 190 + i * 170), name, font=font(30), fill=(240, 244, 250))
    d.rectangle((0, H - 70, W, H), fill=(14, 22, 40))
    d.text((W - 220, H - 54), "10:24", font=font(36), fill=(230, 234, 240))
    save(img, "screen")


if __name__ == "__main__":
    motherboard()
    ram()
    cpu()
    ssd()
    io_panel()
    case_front()
    psu()
    keyboard()
    screen()
