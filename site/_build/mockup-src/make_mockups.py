import os
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = SRC

# screen name -> (crop_top, crop_bottom_from_end) in raw screenshot px, or None for no crop
CROPS = {
    "home": (0, 0),
    "cards": (1250, 0),
    "sheet": (0, 0),
}
# per-(name,theme) overrides where scroll position differed between captures
CROP_OVERRIDES = {
    ("cards", "dark"): (520, 730),
}

DI_W, DI_H, DI_R = 336, 104, 52       # dynamic island size
PAD_TOP = 168                          # status-bar / notch reserved area
BEZEL = 40                             # titanium bezel thickness
OUTER_R = 210                          # outer body corner radius
SCREEN_R = 168                         # screen mask corner radius (post-pad canvas)
SHADOW_BLUR = 46
SHADOW_OFFSET = 34
SHADOW_ALPHA = 100


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def titanium_gradient(size, dark):
    w, h = size
    grad = Image.new("RGB", (1, h))
    if dark:
        top, bot = (58, 58, 62), (24, 24, 26)
    else:
        top, bot = (196, 196, 200), (150, 150, 156)
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        grad.putpixel((0, y), (r, g, b))
    return grad.resize((w, h))


def build(name, theme):
    raw_path = os.path.join(SRC, f"raw-{name}-{theme}.png")
    img = Image.open(raw_path).convert("RGB")
    top, bot = CROP_OVERRIDES.get((name, theme), CROPS[name])
    if top or bot:
        img = img.crop((0, top, img.width, img.height - bot))

    bg = img.getpixel((5, 5))

    # 1. screen canvas with reserved top pad for dynamic island
    canvas = Image.new("RGB", (img.width, img.height + PAD_TOP), bg)
    canvas.paste(img, (0, PAD_TOP))
    d = ImageDraw.Draw(canvas)
    di_x = (canvas.width - DI_W) // 2
    di_y = 46
    d.rounded_rectangle([di_x, di_y, di_x + DI_W, di_y + DI_H], radius=DI_R, fill=(0, 0, 0))

    # 2. mask screen with rounded corners
    screen_mask = rounded_mask(canvas.size, SCREEN_R)
    screen_rgba = canvas.convert("RGBA")
    screen_rgba.putalpha(screen_mask)

    # 3. titanium frame (extra BTN_PAD margin so side buttons can protrude fully)
    BTN_PAD = 16
    frame_w = canvas.width + 2 * BEZEL
    frame_h = canvas.height + 2 * BEZEL
    body_w = frame_w + 2 * BTN_PAD
    body = Image.new("RGBA", (body_w, frame_h), (0, 0, 0, 0))

    body_mask = rounded_mask((frame_w, frame_h), OUTER_R)
    body_color = titanium_gradient((frame_w, frame_h), dark=(theme == "dark"))
    frame_layer = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    frame_layer.paste(body_color, (0, 0), body_mask)

    # inner bezel groove (subtle darker ring just outside the screen)
    groove = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(groove)
    gd.rounded_rectangle(
        [BEZEL - 6, BEZEL - 6, BEZEL - 6 + canvas.width + 12, BEZEL - 6 + canvas.height + 12],
        radius=SCREEN_R + 6, fill=(0, 0, 0, 90),
    )
    frame_layer = Image.alpha_composite(frame_layer, groove)
    body.alpha_composite(frame_layer, (BTN_PAD, 0))
    body.paste(screen_rgba, (BTN_PAD + BEZEL, BEZEL), screen_rgba)

    # 4. side buttons (protrude symmetrically across the frame edge)
    bd = ImageDraw.Draw(body)
    btn_fill = (198, 198, 202, 255) if theme == "light" else (54, 54, 58, 255)
    btn_edge = (150, 150, 155, 255) if theme == "light" else (14, 14, 16, 255)
    right_x = BTN_PAD + frame_w
    left_x = BTN_PAD

    def h_button(cx, y0, y1, w=BTN_PAD + 6):
        bd.rounded_rectangle([cx - w, y0, cx + w, y1], radius=9, outline=btn_edge, width=2, fill=btn_fill)

    # right side: power/action button
    h_button(right_x, 430, 640)
    # left side: action button + two volume buttons
    h_button(left_x, 250, 320)
    h_button(left_x, 380, 500)
    h_button(left_x, 540, 660)

    # 5. soft drop shadow on transparent canvas
    pad = SHADOW_BLUR * 3
    out = Image.new("RGBA", (body_w + pad * 2, frame_h + pad * 2 + SHADOW_OFFSET), (0, 0, 0, 0))
    shadow_shape = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_shape)
    sd.rounded_rectangle([0, 0, frame_w, frame_h], radius=OUTER_R, fill=(0, 0, 0, SHADOW_ALPHA))
    shadow_shape = shadow_shape.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    out.alpha_composite(shadow_shape, (pad + BTN_PAD, pad + SHADOW_OFFSET))
    out.alpha_composite(body, (pad, pad))

    # trim to content bbox with small margin
    bbox = out.getbbox()
    margin = 20
    l, t, r, b = bbox
    l = max(0, l - margin); t = max(0, t - margin)
    r = min(out.width, r + margin); b = min(out.height, b + margin)
    out = out.crop((l, t, r, b))

    # downscale: displayed at max ~250 CSS px wide, 3x retina headroom is plenty
    target_w = 760
    if out.width > target_w:
        scale = target_w / out.width
        out = out.resize((target_w, round(out.height * scale)), Image.LANCZOS)

    png_path = os.path.join(OUT, f"shot-{name}-{theme}.png")
    out.save(png_path)
    webp_path = os.path.join(OUT, f"shot-{name}-{theme}.webp")
    out.save(webp_path, "WEBP", quality=88, method=6)
    print(name, theme, out.size, "->", webp_path, f"{os.path.getsize(webp_path)/1024:.0f}KB")


for name in CROPS:
    for theme in ("light", "dark"):
        build(name, theme)
