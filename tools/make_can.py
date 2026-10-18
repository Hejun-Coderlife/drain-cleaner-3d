"""
从产品正面图生成：
  1. can.png —— 罐子整圈展开贴图（正面 = 照片逐行按圆柱反投影，背面用两侧边缘颜色接上）
  2. 打印罐子轮廓 CAN_PROFILE（[照片行号, 半径px]），贴进 app.js

用法：python3 tools/make_can.py <产品图.png> <输出 can.png>
照片要求：正面、近似正交、白底。参数在下面 Y0/Y1/BODY_PX 按实际图调。
"""
import sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
Y0, Y1 = 557, 2090          # 罐顶 / 罐底所在行
TEX_W = 2048                # 一圈的像素
THETA_MAX = np.radians(76)  # 照片里能可靠取样的最大转角（再往外压缩太狠、边缘发白）
CX = 572.5                  # 罐子中轴所在列
LABEL = (1085, 2028)        # 标签主体（金色带下沿 ~ 银底边上沿）

img = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = img.shape

# ---- 每行轮廓：左边缘 → 半径 ----
bg = (img > 242).all(axis=2)
rows = np.arange(Y0, Y1 + 1)
cen, rad = [], []
for y in rows:
    xs = np.nonzero(~bg[y, 50:W - 50])[0] + 50
    l = xs[0]                                          # 只认左边缘：右侧有白色标签块会被当成背景
    cen.append(CX); rad.append(CX - l)
cen, rad = np.array(cen), np.array(rad)
k = 5                                                  # 中值去抖
pad = lambda a: np.pad(a, k // 2, mode='edge')
cen = np.array([np.median(pad(cen)[i:i + k]) for i in range(len(cen))])
rad = np.array([np.median(pad(rad)[i:i + k]) for i in range(len(rad))])

# ---- 展开贴图 ----
tex_h = int(round((Y1 - Y0) * TEX_W / (np.pi * 2 * rad.max())))
v = np.linspace(0, 1, tex_h)
ys = Y0 + v * (Y1 - Y0)
yi = np.clip(np.round(ys - Y0).astype(int), 0, len(rows) - 1)
th = (np.arange(TEX_W) + 0.5) / TEX_W * 2 * np.pi - np.pi        # u=0.5 → θ=0 正面

def sample(x, y):
    x0 = np.clip(np.floor(x).astype(int), 0, W - 2); y0 = np.clip(np.floor(y).astype(int), 0, H - 2)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy

R = (rad[yi] - 1.5)[:, None]
C = cen[yi][:, None]
Y = np.repeat(ys[:, None], TEX_W, axis=1)
front = sample(C + R * np.sin(np.clip(th, -THETA_MAX, THETA_MAX))[None, :], Y)
# 背面：两侧边缘颜色（取 70°~76° 一段平均）沿背面渐变接上，保证金色带 / 银底边一圈连续
band = np.radians(np.linspace(70, 76, 7))
right = np.mean([sample(cen[yi] + (rad[yi] - 1.5) * np.sin(b), ys) for b in band], axis=0)
left = np.mean([sample(cen[yi] - (rad[yi] - 1.5) * np.sin(b), ys) for b in band], axis=0)
t = np.clip((np.mod(th - THETA_MAX, 2 * np.pi)) / (2 * np.pi - 2 * THETA_MAX), 0, 1)[None, :, None]
# 标签主体那段（金色带以下、银底边以上）边缘有字，背面改用竖向大幅模糊后的底色，免得拉出横条纹
body = (ys > LABEL[0]) & (ys < LABEL[1])
def vblur(a, sig):
    k = np.exp(-0.5 * (np.arange(-3 * sig, 3 * sig + 1) / sig) ** 2); k /= k.sum()
    return np.stack([np.convolve(np.pad(a[:, c], 3 * sig, mode='edge'), k, mode='valid') for c in range(3)], axis=1)
for side in (left, right):
    side[body] = vblur(side, int(60 * tex_h / (Y1 - Y0)))[body]
back = right[:, None, :] * (1 - t) + left[:, None, :] * t
fade = np.clip((np.abs(th) - np.radians(64)) / (THETA_MAX - np.radians(64)), 0, 1)
fade = (fade * fade * (3 - 2 * fade))[None, :, None]
fade = np.where(body[:, None, None], fade, (np.abs(th) > THETA_MAX)[None, :, None])
out = front * (1 - fade) + back * fade
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, optimize=True)
print(f'// {OUT}: {TEX_W}x{tex_h}', file=sys.stderr)

# ---- 轮廓：RDP 简化 ----
pts = np.stack([rows.astype(float), rad], axis=1)
def rdp(p, eps):
    if len(p) < 3: return p
    a, b = p[0], p[-1]
    d = np.abs((b - a)[0] * (p - a)[:, 1] - (b - a)[1] * (p - a)[:, 0]) / np.linalg.norm(b - a)
    i = int(np.argmax(d))
    if d[i] > eps: return np.vstack([rdp(p[:i + 1], eps)[:-1], rdp(p[i:], eps)])
    return np.vstack([a, b])
simp = rdp(pts, 1.2)
print('const CAN_PROFILE = [' + ', '.join(f'[{int(y)}, {r:.1f}]' for y, r in simp) + '];')
